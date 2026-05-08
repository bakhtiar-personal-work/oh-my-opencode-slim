/**
 * Usage service for OpenCode Go usage tracking.
 *
 * Manages account storage, refresh lifecycle, rate limiting, and the
 * /go slash command.
 *
 * Accounts are stored locally (not in plugin config) to keep auth tokens
 * out of version control and the published schema.
 */

import { recordOpencodeGoUsage } from '../tui-state';
import { createInternalAgentTextPart } from '../utils';
import {
  loadAccounts,
  maskCookie,
  removeAccount,
  type StoredAccount,
  saveAccount,
  updateAccountCookie,
} from './accounts-store';
import { scrapeQuota } from './scraper';
import type { OpenCodeGoUsageEntry } from './types';

const GO_COMMAND = 'go';
const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

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
  private lastRefresh = 0;
  private pendingRefresh: Promise<OpenCodeGoUsageEntry[]> | null = null;
  private cached: OpenCodeGoUsageEntry[] = [];
  private refreshIntervalMs: number;

  constructor(refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS) {
    this.refreshIntervalMs = refreshIntervalMs;
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
    const accounts = this.getAccounts();

    if (accounts.length === 0) return [];

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
    // Fire-and-forget refresh (rate-limited internally)
    this.refresh(false).catch(() => {
      // Best-effort: errors are captured in the entries
    });
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
        output.parts.push(
          createInternalAgentTextPart(
            `✅ Added account "${name}".`,
          ),
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
          output.parts.push(
            createInternalAgentTextPart(`✅ Removed account "${name}".`),
          );
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
          lines.push(`  ${acct.name}: ${acct.workspaceId}`);
          lines.push(`    cookie: ${maskCookie(acct.authCookie)}`);
        }
        lines.push('');
        lines.push('Commands:');
        lines.push('  /go add <name> <workspace-id> <auth-cookie>');
        lines.push('  /go remove <name>');
        lines.push('  /go edit <name> <new-auth-cookie>');
        lines.push('  /go refresh');
        output.parts.push(createInternalAgentTextPart(lines.join('\n')));
        break;
      }

      case 'refresh': {
        await this.refresh(true);
        output.parts.push(
          createInternalAgentTextPart(
            '✅ Refreshed all accounts.',
          ),
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
          'Manage OpenCode Go accounts (add, remove, list, edit, refresh)',
        description:
          'Add, remove, list, edit, or refresh OpenCode Go accounts for usage tracking in the sidebar',
      };
    }
  }

}

export function createUsageService(): UsageService {
  return new UsageService();
}
