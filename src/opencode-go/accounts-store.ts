/**
 * Local file-based storage for OpenCode Go accounts.
 *
 * Stores account credentials (workspace ID + auth cookie) in a local JSON
 * file alongside tui-state.json, NOT in the plugin config, so auth tokens
 * are never committed to repos or exposed in the published schema.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface StoredAccount {
  name: string;
  workspaceId: string;
  authCookie: string;
  provider?: string;
  apiKey?: string;
}

interface AccountsFile {
  version: 1;
  accounts: StoredAccount[];
  activeAccount: string | null;
}

const STATE_DIR = 'oh-my-opencode-slim';
const ACCOUNTS_FILE = 'opencode-go-accounts.json';

function dataDir(): string {
  return (
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share')
  );
}

function getAccountsPath(): string {
  return path.join(dataDir(), 'opencode', 'storage', STATE_DIR, ACCOUNTS_FILE);
}

function emptyFile(): AccountsFile {
  return { version: 1, accounts: [], activeAccount: null };
}

function parseAccountsFile(value: string): AccountsFile {
  try {
    const parsed = JSON.parse(value) as Partial<AccountsFile>;
    if (parsed?.version === 1 && Array.isArray(parsed.accounts)) {
      return {
        version: 1,
        accounts: parsed.accounts,
        activeAccount:
          typeof parsed.activeAccount === 'string'
            ? parsed.activeAccount
            : null,
      };
    }
  } catch {
    // Fall through to empty
  }
  return emptyFile();
}

function readAccountsFile(): AccountsFile {
  try {
    return parseAccountsFile(fs.readFileSync(getAccountsPath(), 'utf8'));
  } catch {
    return emptyFile();
  }
}

function writeAccountsFile(file: AccountsFile): void {
  try {
    const filePath = getAccountsPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
  } catch {
    // Best-effort
  }
}

/**
 * Load all stored accounts.
 */
export function loadAccounts(): StoredAccount[] {
  return readAccountsFile().accounts;
}

/**
 * Add a new account. If an account with the same name already exists,
 * overwrites it (update).
 */
export function saveAccount(account: StoredAccount): void {
  const file = readAccountsFile();
  const existing = file.accounts.findIndex((a) => a.name === account.name);
  if (existing >= 0) {
    file.accounts[existing] = account;
  } else {
    file.accounts.push(account);
  }
  writeAccountsFile(file);
}

/**
 * Remove an account by name. Returns true if deleted, false if not found.
 */
export function removeAccount(name: string): boolean {
  const file = readAccountsFile();
  const index = file.accounts.findIndex((a) => a.name === name);
  if (index < 0) return false;
  file.accounts.splice(index, 1);
  writeAccountsFile(file);
  return true;
}

/**
 * Update the auth cookie for an existing account. Returns true if updated,
 * false if account not found.
 */
export function updateAccountCookie(name: string, authCookie: string): boolean {
  const file = readAccountsFile();
  const account = file.accounts.find((a) => a.name === name);
  if (!account) return false;
  account.authCookie = authCookie;
  writeAccountsFile(file);
  return true;
}

/**
 * Mask an auth cookie for display (show first 8 + last 4 chars).
 */
export function maskCookie(cookie: string): string {
  if (cookie.length <= 16) {
    return `${cookie.slice(0, 4)}...${cookie.slice(-4)}`;
  }
  return `${cookie.slice(0, 8)}...${cookie.slice(-4)}`;
}

/**
 * Look up a stored account by name.
 */
export function getAccount(name: string): StoredAccount | undefined {
  const file = readAccountsFile();
  return file.accounts.find((a) => a.name === name);
}

/**
 * Set the provider and API key for an existing account.
 * Returns true if updated, false if account not found.
 */
export function setAccountKey(
  name: string,
  provider: string,
  apiKey: string,
): boolean {
  const file = readAccountsFile();
  const account = file.accounts.find((a) => a.name === name);
  if (!account) return false;
  account.provider = provider;
  account.apiKey = apiKey;
  writeAccountsFile(file);
  return true;
}

/**
 * Get the currently active OpenCode Go account name.
 */
export function getActiveAccount(): string | null {
  return readAccountsFile().activeAccount ?? null;
}

/**
 * Set the active OpenCode Go account. Pass null to clear.
 */
export function setActiveAccount(name: string | null): void {
  const file = readAccountsFile();
  file.activeAccount = name;
  writeAccountsFile(file);
}
