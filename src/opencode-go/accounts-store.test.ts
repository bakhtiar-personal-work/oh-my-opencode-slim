import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getAccount,
  getActiveAccount,
  loadAccounts,
  removeAccount,
  saveAccount,
  setAccountKey,
  setActiveAccount,
} from './accounts-store';

let previousXdgDataHome: string | undefined;
let tempDir: string;

beforeEach(() => {
  previousXdgDataHome = process.env.XDG_DATA_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omos-accounts-store-'));
  process.env.XDG_DATA_HOME = tempDir;
});

afterEach(() => {
  if (previousXdgDataHome === undefined) {
    delete process.env.XDG_DATA_HOME;
  } else {
    process.env.XDG_DATA_HOME = previousXdgDataHome;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('accounts-store', () => {
  test('saveAccount and loadAccounts', () => {
    saveAccount({
      name: 'personal',
      workspaceId: 'wrk_123',
      authCookie: 'cookie-abc',
    });

    const accounts = loadAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe('personal');
    expect(accounts[0].workspaceId).toBe('wrk_123');
    expect(accounts[0].authCookie).toBe('cookie-abc');
  });

  test('saveAccount overwrites existing account by name', () => {
    saveAccount({
      name: 'personal',
      workspaceId: 'wrk_123',
      authCookie: 'cookie-old',
    });
    saveAccount({
      name: 'personal',
      workspaceId: 'wrk_456',
      authCookie: 'cookie-new',
    });

    const accounts = loadAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].workspaceId).toBe('wrk_456');
    expect(accounts[0].authCookie).toBe('cookie-new');
  });

  test('removeAccount removes by name', () => {
    saveAccount({
      name: 'personal',
      workspaceId: 'wrk_123',
      authCookie: 'cookie-abc',
    });
    const removed = removeAccount('personal');
    expect(removed).toBe(true);
    expect(loadAccounts()).toHaveLength(0);
  });

  test('removeAccount returns false for unknown name', () => {
    const removed = removeAccount('nonexistent');
    expect(removed).toBe(false);
  });

  test('getAccount finds by name', () => {
    saveAccount({
      name: 'personal',
      workspaceId: 'wrk_123',
      authCookie: 'cookie-abc',
    });
    const account = getAccount('personal');
    expect(account).toBeDefined();
    expect(account!.workspaceId).toBe('wrk_123');
  });

  test('getAccount returns undefined for unknown name', () => {
    const account = getAccount('nonexistent');
    expect(account).toBeUndefined();
  });

  test('setAccountKey sets provider and apiKey', () => {
    saveAccount({
      name: 'personal',
      workspaceId: 'wrk_123',
      authCookie: 'cookie-abc',
    });
    const updated = setAccountKey('personal', 'openai', 'sk-test-key');
    expect(updated).toBe(true);

    const account = getAccount('personal');
    expect(account!.provider).toBe('openai');
    expect(account!.apiKey).toBe('sk-test-key');
  });

  test('setAccountKey returns false for unknown name', () => {
    const updated = setAccountKey('nonexistent', 'openai', 'sk-test-key');
    expect(updated).toBe(false);
  });

  test('setActiveAccount and getActiveAccount', () => {
    setActiveAccount('personal');
    expect(getActiveAccount()).toBe('personal');
  });

  test('setActiveAccount clears with null', () => {
    setActiveAccount('personal');
    setActiveAccount(null);
    expect(getActiveAccount()).toBeNull();
  });

  test('activeAccount survives save/load cycle', () => {
    saveAccount({
      name: 'personal',
      workspaceId: 'wrk_123',
      authCookie: 'cookie-abc',
    });
    setActiveAccount('personal');

    // Save another account — activeAccount should persist
    saveAccount({
      name: 'work',
      workspaceId: 'wrk_456',
      authCookie: 'cookie-def',
    });

    expect(getActiveAccount()).toBe('personal');
  });

  test('accounts with apiKey are loaded with the field', () => {
    saveAccount({
      name: 'personal',
      workspaceId: 'wrk_123',
      authCookie: 'cookie-abc',
    });
    setAccountKey('personal', 'anthropic', 'sk-ant-key');

    const accounts = loadAccounts();
    expect(accounts[0].provider).toBe('anthropic');
    expect(accounts[0].apiKey).toBe('sk-ant-key');
  });
});
