/**
 * Usage service for OpenCode Go usage tracking.
 *
 * Manages account storage, refresh lifecycle, rate limiting, and the
 * /go slash command.
 *
 * Accounts are stored locally (not in plugin config) to keep auth tokens
 * out of version control and the published schema.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PluginInput } from '@opencode-ai/plugin';
import {
  recordActiveOpenCodeGoAccount,
  recordOpencodeGoUsage,
  removeOpencodeGoUsageEntry,
} from '../tui-state';
import { createInternalAgentTextPart } from '../utils';
import {
  getAccount,
  getActiveAccount,
  loadAccounts,
  maskCookie,
  removeAccount,
  type StoredAccount,
  saveAccount,
  setAccountKey,
  setActiveAccount,
  updateAccountCookie,
} from './accounts-store';
import { scrapeQuota } from './scraper';
import type { OpenCodeGoUsageEntry } from './types';

const GO_COMMAND = 'go';
const DEFAULT_REFRESH_INTERVAL_MS = 60_000;
const DEFAULT_PERIODIC_INTERVAL_MS = 600_000; // 10 minutes

function formatResetTime(resetTimeIso: string): string {
  const diff = new Date(resetTimeIso).getTime() - Date.now();
  if (diff <= 0) return 'soon';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `in ${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

function formatBar(percent: number, width = 10): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export class UsageService {
  private client: PluginInput['client'];
  private lastRefresh = 0;
  private pendingRefresh: Promise<OpenCodeGoUsageEntry[]> | null = null;
  private cached: OpenCodeGoUsageEntry[] = [];
  private refreshIntervalMs: number;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private periodicIntervalMs: number;

  constructor(
    client: PluginInput['client'],
    refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
    periodicIntervalMs = DEFAULT_PERIODIC_INTERVAL_MS,
  ) {
    this.client = client;
    this.refreshIntervalMs = refreshIntervalMs;
    this.periodicIntervalMs = periodicIntervalMs;
    this.startPeriodicRefresh();
  }

  /** Get accounts from local storage. */
  private getAccounts(): StoredAccount[] {
    return loadAccounts();
  }

  /**
   * Refresh all accounts' usage data, respecting rate limit unless forced.
   * Returns the scraped results.
   */
  async refresh(force = false): Promise<OpenCodeGoUsageEntry[]> {
    const now = Date.now();
    if (!force && now - this.lastRefresh < this.refreshIntervalMs) {
      return this.cached;
    }

    // Deduplicate concurrent refresh calls
    if (this.pendingRefresh) {
      return this.pendingRefresh;
    }

    this.pendingRefresh = this._doRefresh();
    try {
      this.cached = await this.pendingRefresh;
      return this.cached;
    } finally {
      this.pendingRefresh = null;
    }
  }

  private async _doRefresh(): Promise<OpenCodeGoUsageEntry[]> {
    this.lastRefresh = Date.now();
    this.resetPeriodicTimer();
    const accounts = this.getAccounts();

    if (accounts.length === 0) {
      recordOpencodeGoUsage([]);
      return [];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const results = await Promise.allSettled(
        accounts.map(async (account) => {
          const entry = await scrapeQuota(
            account.workspaceId,
            account.authCookie,
            controller.signal,
          );
          entry.accountName = account.name;
          return entry;
        }),
      );

      const entries: OpenCodeGoUsageEntry[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          entries.push(result.value);
        } else {
          entries.push({
            accountName: 'unknown',
            workspaceId: '',
            fetchedAt: Date.now(),
            error: `Scrape failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
          });
        }
      }

      // Persist to tui-state for the TUI sidebar to read
      recordOpencodeGoUsage(entries);

      return entries;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Called when orchestrator goes idle — triggers a non-forced refresh.
   */
  onOrchestratorIdle(): void {
    // Sync active account from auth.json (handles external edits)
    this.syncActiveAccount();
    // Fire-and-forget refresh (rate-limited internally)
    this.refresh(false).catch(() => {
      // Best-effort: errors are captured in the entries
    });
  }

  /**
   * Sync the active account by comparing stored API keys against
   * auth.json. If a stored account's apiKey matches the opencode-go
   * key in auth.json, that account is marked active. Otherwise active
   * is cleared. This keeps the sidebar accurate even if auth.json
   * was edited externally.
   */
  syncActiveAccount(): string | null {
    const authPath = path.join(
      process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'),
      'opencode',
      'auth.json',
    );

    let authKey: string | undefined;
    try {
      const raw = fs.readFileSync(authPath, 'utf8');
      const auth = JSON.parse(raw) as Record<
        string,
        { type: string; key?: string }
      >;
      authKey = auth['opencode-go']?.key;
    } catch {
      // auth.json doesn't exist or can't be read — clear active
    }

    if (authKey) {
      const accounts = this.getAccounts();
      for (const account of accounts) {
        if (account.apiKey === authKey) {
          // Found matching account — ensure it's marked active
          if (getActiveAccount() !== account.name) {
            setActiveAccount(account.name);
            recordActiveOpenCodeGoAccount(account.name);
          }
          return account.name;
        }
      }
    }

    // No match found — clear active if it was set
    if (getActiveAccount() !== null) {
      setActiveAccount(null);
      recordActiveOpenCodeGoAccount(null);
    }
    return null;
  }

  /**
   * Start the periodic background refresh timer.
   */
  private startPeriodicRefresh(): void {
    this.periodicTimer = setInterval(() => {
      this.refresh(false).catch(() => {
        // Best-effort: errors are captured in the entries
      });
    }, this.periodicIntervalMs);
    // Don't block Node exit
    if (this.periodicTimer && typeof this.periodicTimer.unref === 'function') {
      this.periodicTimer.unref();
    }
  }

  /**
   * Reset the periodic timer — called after any actual refresh to
   * restart the countdown.
   */
  private resetPeriodicTimer(): void {
    if (this.periodicTimer !== null) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    this.startPeriodicRefresh();
  }

  /**
   * Clean up the periodic timer. Call when the plugin is shutting down.
   */
  dispose(): void {
    if (this.periodicTimer !== null) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  /**
   * Handle slash commands: /go.
   */
  async handleCommandExecuteBefore(
    input: {
      command: string;
      sessionID: string;
      arguments: string;
    },
    output: { parts: Array<{ type: string; text?: string }> },
  ): Promise<void> {
    if (input.command === GO_COMMAND) {
      await this.handleGoCommand(input, output);
    }
  }

  private async handleGoCommand(
    input: {
      command: string;
      sessionID: string;
      arguments: string;
    },
    output: { parts: Array<{ type: string; text?: string }> },
  ): Promise<void> {
    output.parts.length = 0;

    const args = input.arguments.trim();
    const parts = args.split(/\s+/);
    const subcommand = parts[0]?.toLowerCase();

    switch (subcommand) {
      case 'add': {
        const [_, name, workspaceId, ...cookieParts] = parts;
        const authCookie = cookieParts.join(' ');
        if (!name || !workspaceId || !authCookie) {
          output.parts.push(
            createInternalAgentTextPart(
              'Usage: /go add <name> <workspace-id> <auth-cookie>\n' +
                'Example: /go add personal wrk_xxx Fe26.2...',
            ),
          );
          return;
        }
        saveAccount({ name, workspaceId, authCookie });
        // Refresh to update sidebar immediately
        this.refresh(true).catch(() => {});
        output.parts.push(
          createInternalAgentTextPart(`✅ Added account "${name}".`),
        );
        break;
      }

      case 'remove':
      case 'rm': {
        const [_, name] = parts;
        if (!name) {
          output.parts.push(
            createInternalAgentTextPart('Usage: /go remove <name>'),
          );
          return;
        }
        const removed = removeAccount(name);
        if (removed) {
          // If removing the active account, clear the active state
          if (getActiveAccount() === name) {
            setActiveAccount(null);
            recordActiveOpenCodeGoAccount(null);
            output.parts.push(
              createInternalAgentTextPart(
                `✅ Removed account "${name}" (was active). Run /go switch to activate another account.`,
              ),
            );
          } else {
            output.parts.push(
              createInternalAgentTextPart(`✅ Removed account "${name}".`),
            );
          }
          // Clear sidebar entry immediately
          removeOpencodeGoUsageEntry(name);
        } else {
          output.parts.push(
            createInternalAgentTextPart(`Account "${name}" not found.`),
          );
        }
        break;
      }

      case 'edit': {
        const [_, name, ...cookieParts] = parts;
        const authCookie = cookieParts.join(' ');
        if (!name || !authCookie) {
          output.parts.push(
            createInternalAgentTextPart(
              'Usage: /go edit <name> <new-auth-cookie>',
            ),
          );
          return;
        }
        const updated = updateAccountCookie(name, authCookie);
        if (updated) {
          output.parts.push(
            createInternalAgentTextPart(
              `✅ Updated auth cookie for "${name}".`,
            ),
          );
          this.refresh(true).catch(() => {});
        } else {
          output.parts.push(
            createInternalAgentTextPart(`Account "${name}" not found.`),
          );
        }
        break;
      }

      case 'list':
      case 'ls': {
        const accounts = this.getAccounts();
        const active = getActiveAccount();
        if (accounts.length === 0) {
          output.parts.push(
            createInternalAgentTextPart(
              'No accounts configured. Use /go add to add one.',
            ),
          );
          return;
        }
        const lines = ['### OpenCode Go Accounts', ''];
        for (const acct of accounts) {
          const isActive = active === acct.name;
          const star = isActive ? '★ ' : '  ';
          lines.push(`${star}${acct.name}: ${acct.workspaceId}`);
          lines.push(`    cookie: ${maskCookie(acct.authCookie)}`);
          if (acct.provider) {
            lines.push(
              `    provider: ${acct.provider}${acct.apiKey ? ' (key set)' : ''}`,
            );
          }
        }
        if (active) {
          lines.push('');
          lines.push(`Active account: ★ ${active}`);
        }
        lines.push('');
        lines.push('Commands:');
        lines.push('  /go add <name> <workspace-id> <auth-cookie>');
        lines.push('  /go remove <name>');
        lines.push('  /go edit <name> <new-auth-cookie>');
        lines.push('  /go set-key <name> <api-key>');
        lines.push('  /go switch <name>');
        lines.push('  /go refresh');
        output.parts.push(createInternalAgentTextPart(lines.join('\n')));
        break;
      }

      case 'set-key': {
        const [_, name, ...keyParts] = parts;
        const apiKey = keyParts.join(' ');
        if (!name || !apiKey) {
          output.parts.push(
            createInternalAgentTextPart(
              'Usage: /go set-key <name> <api-key>\n' +
                'Example: /go set-key personal sk-...\n' +
                'After setting a key, use /go switch <name> to activate it.',
            ),
          );
          return;
        }
        const updated = setAccountKey(name, 'opencode-go', apiKey);
        if (updated) {
          output.parts.push(
            createInternalAgentTextPart(
              `✅ Set API key for "${name}". Use /go switch ${name} to activate.`,
            ),
          );
        } else {
          output.parts.push(
            createInternalAgentTextPart(`Account "${name}" not found.`),
          );
        }
        break;
      }

      case 'switch': {
        const [_, name] = parts;
        if (!name) {
          output.parts.push(
            createInternalAgentTextPart('Usage: /go switch <name>'),
          );
          return;
        }
        const account = getAccount(name);
        if (!account) {
          output.parts.push(
            createInternalAgentTextPart(`Account "${name}" not found.`),
          );
          return;
        }
        if (!account.apiKey) {
          output.parts.push(
            createInternalAgentTextPart(
              `Account "${name}" has no API key set. Use /go set-key ${name} <api-key> first.`,
            ),
          );
          return;
        }
        // No-op if already active
        if (getActiveAccount() === name) {
          output.parts.push(
            createInternalAgentTextPart(`Account "${name}" is already active.`),
          );
          return;
        }
        try {
          // Write the API key to OpenCode auth.json via SDK's auth.set()
          await this.client.auth.set({
            path: { id: 'opencode-go' },
            body: { type: 'api', key: account.apiKey },
          });
        } catch {
          output.parts.push(
            createInternalAgentTextPart(
              '⚠ Failed to update auth. The key was not applied.',
            ),
          );
          return;
        }
        // Set as active
        setActiveAccount(name);
        recordActiveOpenCodeGoAccount(name);
        // Show restart toast
        this.client.tui
          .showToast({
            body: {
              title: 'Account Switched',
              message: `Switched to "${name}". Restart for new API key.`,
              variant: 'success',
              duration: 5000,
            },
          })
          .catch(() => {});
        output.parts.push(
          createInternalAgentTextPart(`✅ Switched to account "${name}".`),
        );
        break;
      }

      case 'refresh': {
        await this.refresh(true);
        output.parts.push(
          createInternalAgentTextPart('✅ Refreshed all accounts.'),
        );
        break;
      }

      default: {
        output.parts.push(
          createInternalAgentTextPart(
            'OpenCode Go Account Management\n\n' +
              'Commands:\n' +
              '  /go add <name> <workspace-id> <auth-cookie>   Add an account\n' +
              '  /go remove <name>                             Remove an account\n' +
              '  /go edit <name> <new-auth-cookie>            Update auth cookie\n' +
              '  /go set-key <name> <api-key>                 Set API key for switching\n' +
              '  /go switch <name>                            Switch active account\n' +
              '  /go list                                     List all accounts\n' +
              '  /go refresh                                  Force refresh all',
          ),
        );
        break;
      }
    }
  }

  /**
   * Register /go command in OpenCode config.
   */
  registerCommand(opencodeConfig: Record<string, unknown>): void {
    const configCommand = opencodeConfig.command as
      | Record<string, unknown>
      | undefined;
    if (!opencodeConfig.command) {
      opencodeConfig.command = {};
    }

    if (!configCommand?.[GO_COMMAND]) {
      (opencodeConfig.command as Record<string, unknown>)[GO_COMMAND] = {
        template:
          'Manage OpenCode Go accounts (add, remove, list, edit, set-key, switch, refresh)',
        description:
          'Add, remove, list, edit, set-key, switch, or refresh OpenCode Go accounts for usage tracking in the sidebar',
      };
    }
  }
}

export function createUsageService(
  client: PluginInput['client'],
  refreshIntervalMs?: number,
  periodicIntervalMs?: number,
): UsageService {
  return new UsageService(client, refreshIntervalMs, periodicIntervalMs);
}
