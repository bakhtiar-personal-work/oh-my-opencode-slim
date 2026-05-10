import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getTuiStatePath,
  readTuiSnapshot,
  recordActiveSubscriptionForProvider,
  recordSubscriptionUsage,
  recordTuiAgentModel,
  recordTuiAgentModels,
  removeSubscriptionUsageEntry,
  subscriptionUsageKey,
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

describe('subscriptionUsage', () => {
  test('recordSubscriptionUsage uses provider-scoped keys', () => {
    recordSubscriptionUsage([
      {
        provider: 'opencode-go',
        accountName: 'personal',
        workspaceId: 'wrk_123',
        fetchedAt: Date.now(),
      },
      {
        provider: 'neuralwatt',
        accountName: 'personal',
        snapshot_at: '',
        balance: {
          credits_remaining_usd: 0,
          total_credits_usd: 0,
          credits_used_usd: 0,
          accounting_method: 'energy',
        },
        usage: {
          lifetime: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
          current_month: { cost_usd: 0, requests: 0, tokens: 0, energy_kwh: 0 },
        },
        subscription: null,
        fetchedAt: Date.now(),
      },
    ]);

    const snapshot = readTuiSnapshot();
    expect(snapshot.subscriptionUsage).toHaveProperty(
      subscriptionUsageKey('opencode-go', 'personal'),
    );
    expect(snapshot.subscriptionUsage).toHaveProperty(
      subscriptionUsageKey('neuralwatt', 'personal'),
    );
  });

  test('recordSubscriptionUsage clears stale entries', () => {
    // First write two entries
    recordSubscriptionUsage([
      {
        provider: 'opencode-go',
        accountName: 'personal',
        workspaceId: 'wrk_123',
        fetchedAt: Date.now(),
        error: undefined,
      },
      {
        provider: 'opencode-go',
        accountName: 'work',
        workspaceId: 'wrk_456',
        fetchedAt: Date.now(),
        error: undefined,
      },
    ]);

    expect(readTuiSnapshot().subscriptionUsage).toHaveProperty(
      subscriptionUsageKey('opencode-go', 'personal'),
    );
    expect(readTuiSnapshot().subscriptionUsage).toHaveProperty(
      subscriptionUsageKey('opencode-go', 'work'),
    );

    // Now write only one entry — the other should be gone
    recordSubscriptionUsage([
      {
        provider: 'opencode-go',
        accountName: 'personal',
        workspaceId: 'wrk_123',
        fetchedAt: Date.now(),
        error: undefined,
      },
    ]);

    const snapshot = readTuiSnapshot();
    expect(snapshot.subscriptionUsage).toHaveProperty(
      subscriptionUsageKey('opencode-go', 'personal'),
    );
    expect(snapshot.subscriptionUsage).not.toHaveProperty(
      subscriptionUsageKey('opencode-go', 'work'),
    );
  });

  test('recordSubscriptionUsage handles empty array (clears all)', () => {
    recordSubscriptionUsage([
      {
        provider: 'opencode-go',
        accountName: 'personal',
        workspaceId: 'wrk_123',
        fetchedAt: Date.now(),
        error: undefined,
      },
    ]);
    expect(readTuiSnapshot().subscriptionUsage).toHaveProperty(
      subscriptionUsageKey('opencode-go', 'personal'),
    );

    // Empty array should clear everything
    recordSubscriptionUsage([]);
    expect(readTuiSnapshot().subscriptionUsage).toEqual({});
  });

  test('removeSubscriptionUsageEntry deletes a specific entry', () => {
    recordSubscriptionUsage([
      {
        provider: 'opencode-go',
        accountName: 'personal',
        workspaceId: 'wrk_123',
        fetchedAt: Date.now(),
        error: undefined,
      },
      {
        provider: 'opencode-go',
        accountName: 'work',
        workspaceId: 'wrk_456',
        fetchedAt: Date.now(),
        error: undefined,
      },
    ]);

    removeSubscriptionUsageEntry('opencode-go', 'personal');

    const snapshot = readTuiSnapshot();
    expect(snapshot.subscriptionUsage).not.toHaveProperty(
      subscriptionUsageKey('opencode-go', 'personal'),
    );
    expect(snapshot.subscriptionUsage).toHaveProperty(
      subscriptionUsageKey('opencode-go', 'work'),
    );
  });

  test('removeSubscriptionUsageEntry is idempotent for unknown names', () => {
    recordSubscriptionUsage([
      {
        provider: 'opencode-go',
        accountName: 'personal',
        workspaceId: 'wrk_123',
        fetchedAt: Date.now(),
        error: undefined,
      },
    ]);

    // Removing a name that doesn't exist should not throw
    expect(() =>
      removeSubscriptionUsageEntry('opencode-go', 'nonexistent'),
    ).not.toThrow();
    expect(readTuiSnapshot().subscriptionUsage).toHaveProperty(
      subscriptionUsageKey('opencode-go', 'personal'),
    );
  });
});

describe('activeSubscriptionByProvider', () => {
  test('recordActiveSubscriptionForProvider sets the field', () => {
    recordActiveSubscriptionForProvider('opencode-go', 'personal');
    expect(readTuiSnapshot().activeSubscriptionByProvider['opencode-go']).toBe(
      'personal',
    );
  });

  test('recordActiveSubscriptionForProvider clears with null', () => {
    recordActiveSubscriptionForProvider('opencode-go', 'personal');
    recordActiveSubscriptionForProvider('opencode-go', null);
    expect(readTuiSnapshot().activeSubscriptionByProvider['opencode-go']).toBe(
      undefined,
    );
  });

  test('recordActiveSubscriptionForProvider survives other snapshot updates', () => {
    recordActiveSubscriptionForProvider('opencode-go', 'personal');
    // Write some other data — shouldn't affect active provider selection
    recordTuiAgentModel({ agentName: 'explorer', model: 'test-model' });
    expect(readTuiSnapshot().activeSubscriptionByProvider['opencode-go']).toBe(
      'personal',
    );
  });
});

describe('tui-state file safety', () => {
  test('does not clobber existing file when state json is malformed', () => {
    const filePath = getTuiStatePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{ malformed json');

    recordTuiAgentModel({ agentName: 'explorer', model: 'test-model' });

    expect(fs.readFileSync(filePath, 'utf8')).toBe('{ malformed json');
  });
});
