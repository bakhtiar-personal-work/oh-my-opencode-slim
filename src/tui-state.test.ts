import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  readTuiSnapshot,
  recordActiveOpenCodeGoAccount,
  recordOpencodeGoUsage,
  recordTuiAgentModel,
  recordTuiAgentModels,
  removeOpencodeGoUsageEntry,
} from './tui-state';

let previousXdgDataHome: string | undefined;
let tempDir: string;

beforeEach(() => {
  previousXdgDataHome = process.env.XDG_DATA_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omos-tui-state-'));
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

describe('tui-state persistence', () => {
  test('persists enabled agent models', () => {
    recordTuiAgentModels({
      agentModels: {
        explorer: 'openai/gpt-5.4-mini',
        fixer: 'openai/gpt-5.4-mini',
      },
    });

    const snapshot = readTuiSnapshot();

    expect(snapshot.agentModels).toEqual({
      explorer: 'openai/gpt-5.4-mini',
      fixer: 'openai/gpt-5.4-mini',
    });
  });

  test('updates a single live agent model without dropping others', () => {
    recordTuiAgentModels({
      agentModels: {
        orchestrator: 'default',
        explorer: 'openai/gpt-5.4-mini',
      },
    });

    recordTuiAgentModel({
      agentName: 'orchestrator',
      model: 'openai/gpt-5.5',
    });

    expect(readTuiSnapshot().agentModels).toEqual({
      orchestrator: 'openai/gpt-5.5',
      explorer: 'openai/gpt-5.4-mini',
    });
  });
});

describe('opencodeGoUsage', () => {
  test('recordOpencodeGoUsage clears stale entries', () => {
    // First write two entries
    recordOpencodeGoUsage([
      {
        accountName: 'personal',
        workspaceId: 'wrk_123',
        fetchedAt: Date.now(),
        error: undefined,
      },
      {
        accountName: 'work',
        workspaceId: 'wrk_456',
        fetchedAt: Date.now(),
        error: undefined,
      },
    ]);

    expect(readTuiSnapshot().opencodeGoUsage).toHaveProperty('personal');
    expect(readTuiSnapshot().opencodeGoUsage).toHaveProperty('work');

    // Now write only one entry — the other should be gone
    recordOpencodeGoUsage([
      {
        accountName: 'personal',
        workspaceId: 'wrk_123',
        fetchedAt: Date.now(),
        error: undefined,
      },
    ]);

    const snapshot = readTuiSnapshot();
    expect(snapshot.opencodeGoUsage).toHaveProperty('personal');
    expect(snapshot.opencodeGoUsage).not.toHaveProperty('work');
  });

  test('recordOpencodeGoUsage handles empty array (clears all)', () => {
    recordOpencodeGoUsage([
      {
        accountName: 'personal',
        workspaceId: 'wrk_123',
        fetchedAt: Date.now(),
        error: undefined,
      },
    ]);
    expect(readTuiSnapshot().opencodeGoUsage).toHaveProperty('personal');

    // Empty array should clear everything
    recordOpencodeGoUsage([]);
    expect(readTuiSnapshot().opencodeGoUsage).toEqual({});
  });

  test('removeOpencodeGoUsageEntry deletes a specific entry', () => {
    recordOpencodeGoUsage([
      {
        accountName: 'personal',
        workspaceId: 'wrk_123',
        fetchedAt: Date.now(),
        error: undefined,
      },
      {
        accountName: 'work',
        workspaceId: 'wrk_456',
        fetchedAt: Date.now(),
        error: undefined,
      },
    ]);

    removeOpencodeGoUsageEntry('personal');

    const snapshot = readTuiSnapshot();
    expect(snapshot.opencodeGoUsage).not.toHaveProperty('personal');
    expect(snapshot.opencodeGoUsage).toHaveProperty('work');
  });

  test('removeOpencodeGoUsageEntry is idempotent for unknown names', () => {
    recordOpencodeGoUsage([
      {
        accountName: 'personal',
        workspaceId: 'wrk_123',
        fetchedAt: Date.now(),
        error: undefined,
      },
    ]);

    // Removing a name that doesn't exist should not throw
    expect(() => removeOpencodeGoUsageEntry('nonexistent')).not.toThrow();
    expect(readTuiSnapshot().opencodeGoUsage).toHaveProperty('personal');
  });
});

describe('activeOpenCodeGoAccount', () => {
  test('recordActiveOpenCodeGoAccount sets the field', () => {
    recordActiveOpenCodeGoAccount('personal');
    expect(readTuiSnapshot().activeOpenCodeGoAccount).toBe('personal');
  });

  test('recordActiveOpenCodeGoAccount clears with null', () => {
    recordActiveOpenCodeGoAccount('personal');
    recordActiveOpenCodeGoAccount(null);
    expect(readTuiSnapshot().activeOpenCodeGoAccount).toBeNull();
  });

  test('recordActiveOpenCodeGoAccount survives other snapshot updates', () => {
    recordActiveOpenCodeGoAccount('personal');
    // Write some other data — shouldn't affect activeAccount
    recordTuiAgentModel({ agentName: 'explorer', model: 'test-model' });
    expect(readTuiSnapshot().activeOpenCodeGoAccount).toBe('personal');
  });
});
