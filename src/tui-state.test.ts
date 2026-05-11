import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  deleteSessionEntries,
  getTuiStatePath,
  mergedSessionUsage,
  normalizeProjectDirectory,
  pruneStaleTuiSessionBundles,
  readTuiSnapshot,
  recordActiveSubscriptionForProvider,
  recordSessionDone,
  recordSessionNode,
  recordSessionProject,
  recordSessionUsage,
  recordSubscriptionUsage,
  removeSubscriptionUsageEntry,
  subscriptionUsageKey,
  updateSnapshot,
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
    recordSessionNode({
      sessionID: 'sess-x',
      title: '',
      agent: 'explorer',
      status: 'busy',
    });
    expect(readTuiSnapshot().activeSubscriptionByProvider['opencode-go']).toBe(
      'personal',
    );
  });
});

describe('sessionUsage', () => {
  test('recordSessionUsage persists token telemetry per session', () => {
    recordSessionUsage({
      sessionID: 'session-123',
      contextUsed: 150_000,
      contextLimit: 400_000,
      contextPct: 37.5,
      input: 8_000,
      output: 900,
      reasoning: 200,
      cacheRead: 2_500,
      cacheWrite: 700,
    });

    const usage = mergedSessionUsage(readTuiSnapshot())['session-123'];
    expect(usage).toBeDefined();
    expect(usage?.contextUsed).toBe(150_000);
    expect(usage?.contextLimit).toBe(400_000);
    expect(usage?.contextPct).toBe(37.5);
    expect(usage?.input).toBe(8_000);
    expect(usage?.output).toBe(900);
    expect(usage?.reasoning).toBe(200);
    expect(usage?.cacheRead).toBe(2_500);
    expect(usage?.cacheWrite).toBe(700);
  });

  test('accumulates orchestration sigma from per-session deltas and persists across idle', () => {
    recordSessionNode({
      sessionID: 'orch',
      title: 'orch',
      agent: 'orchestrator',
      status: 'busy',
    });
    recordSessionNode({
      sessionID: 'child-1',
      title: 'child-1',
      agent: 'explorer',
      parentId: 'orch',
      status: 'busy',
    });
    recordSessionNode({
      sessionID: 'child-2',
      title: 'child-2',
      agent: 'fixer',
      parentId: 'orch',
      status: 'busy',
    });

    recordSessionUsage({
      sessionID: 'child-1',
      contextUsed: 21_120,
      input: 20_000,
      output: 100,
      reasoning: 20,
      cacheRead: 1_000,
      cacheWrite: 400,
    });
    recordSessionUsage({
      sessionID: 'child-2',
      contextUsed: 20_730,
      input: 20_000,
      output: 200,
      reasoning: 30,
      cacheRead: 500,
      cacheWrite: 100,
    });
    recordSessionUsage({
      sessionID: 'child-1',
      contextUsed: 26_500,
      input: 25_000,
      output: 150,
      reasoning: 50,
      cacheRead: 1_300,
      cacheWrite: 500,
    });

    // Simulate the orchestration becoming idle/completed.
    recordSessionDone('child-1');
    recordSessionDone('child-2');
    recordSessionDone('orch');

    // New child under the same orchestrator session should keep accumulating.
    recordSessionNode({
      sessionID: 'child-3',
      title: 'child-3',
      agent: 'oracle',
      parentId: 'orch',
      status: 'busy',
    });
    recordSessionUsage({
      sessionID: 'child-3',
      contextUsed: 20_810,
      input: 20_000,
      output: 100,
      reasoning: 10,
      cacheRead: 700,
      cacheWrite: 200,
    });

    const snapshot = readTuiSnapshot();
    expect(snapshot.sessions.orch?.orchestrationSigmaAccum).toEqual({
      contextUsed: 68_040,
      input: 65_000,
      output: 450,
      cacheRead: 2_500,
      cacheWrite: 800,
    });
    expect(
      snapshot.sessions.orch?.orchestrationUsageLastSeen['child-1'],
    ).toEqual({
      contextUsed: 26_500,
      input: 25_000,
      output: 150,
      cacheRead: 1_300,
      cacheWrite: 500,
    });
  });

  test('deleteSessionEntries removes child nodes from tree and cascades bundle on root delete', () => {
    recordSessionNode({
      sessionID: 'orch',
      title: 'orch',
      agent: 'orchestrator',
      status: 'busy',
    });
    recordSessionNode({
      sessionID: 'child-1',
      title: 'child-1',
      agent: 'explorer',
      parentId: 'orch',
      status: 'busy',
    });
    recordSessionUsage({
      sessionID: 'child-1',
      contextUsed: 1_065,
      input: 1_000,
      output: 10,
      reasoning: 5,
      cacheRead: 50,
      cacheWrite: 10,
    });
    expect(
      readTuiSnapshot().sessions.orch?.orchestrationSigmaAccum,
    ).toBeDefined();

    deleteSessionEntries('child-1');
    expect(
      readTuiSnapshot().sessions.orch?.orchestrationUsageLastSeen['child-1'],
    ).toBeUndefined();
    expect(readTuiSnapshot().sessions.orch?.tree['child-1']).toBeUndefined();
    expect(readTuiSnapshot().sessions.orch?.tree.orch?.childIds).toEqual([]);
    expect(
      readTuiSnapshot().sessions.orch?.orchestrationSigmaAccum,
    ).toBeDefined();

    deleteSessionEntries('orch');
    expect(readTuiSnapshot().sessions.orch).toBeUndefined();
  });
});

describe('pruneStaleTuiSessionBundles', () => {
  test('removes bundle when every tree id is absent from OpenCode and project matches', () => {
    const projectDir = normalizeProjectDirectory(tempDir);
    recordSessionProject({ sessionID: 'root-del', projectPath: tempDir });
    recordSessionNode({
      sessionID: 'root-del',
      title: '',
      agent: 'orchestrator',
      status: 'idle',
    });
    recordSessionNode({
      sessionID: 'child-del',
      title: '',
      agent: 'explorer',
      parentId: 'root-del',
      status: 'idle',
    });

    expect(readTuiSnapshot().sessions['root-del']).toBeDefined();

    updateSnapshot((s) => {
      pruneStaleTuiSessionBundles(s, {
        opencodeIds: new Set(['ses_still_live']),
        currentProjectDir: projectDir,
        now: Date.now(),
      });
    });

    expect(readTuiSnapshot().sessions['root-del']).toBeUndefined();
  });

  test('keeps bundle when project path does not match workspace', () => {
    const otherDir = path.join(tempDir, 'other-ws');
    fs.mkdirSync(otherDir, { recursive: true });
    const workspaceDir = normalizeProjectDirectory(tempDir);
    recordSessionProject({ sessionID: 'root-x', projectPath: otherDir });
    recordSessionNode({
      sessionID: 'root-x',
      title: '',
      agent: 'orchestrator',
      status: 'idle',
    });

    updateSnapshot((s) => {
      pruneStaleTuiSessionBundles(s, {
        opencodeIds: new Set(['nostale']),
        currentProjectDir: workspaceDir,
        now: Date.now(),
      });
    });

    expect(readTuiSnapshot().sessions['root-x']).toBeDefined();
  });

  test('does not remove bundles when opencodeIds is empty', () => {
    const projectDir = normalizeProjectDirectory(tempDir);
    recordSessionProject({ sessionID: 'root-k', projectPath: tempDir });
    recordSessionNode({
      sessionID: 'root-k',
      title: '',
      agent: 'orchestrator',
      status: 'idle',
    });

    updateSnapshot((s) => {
      pruneStaleTuiSessionBundles(s, {
        opencodeIds: new Set(),
        currentProjectDir: projectDir,
        now: Date.now(),
      });
    });

    expect(readTuiSnapshot().sessions['root-k']).toBeDefined();
  });

  test('soft-prunes subtree when only some ids are missing from OpenCode', () => {
    const projectDir = normalizeProjectDirectory(tempDir);
    recordSessionProject({ sessionID: 'root-p', projectPath: tempDir });
    recordSessionNode({
      sessionID: 'root-p',
      title: '',
      agent: 'orchestrator',
      status: 'busy',
    });
    recordSessionNode({
      sessionID: 'gone-child',
      title: '',
      agent: 'explorer',
      parentId: 'root-p',
      status: 'busy',
    });
    recordSessionUsage({
      sessionID: 'gone-child',
      contextUsed: 100,
      contextLimit: 400,
      contextPct: 25,
      input: 10,
      output: 5,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });

    updateSnapshot((s) => {
      pruneStaleTuiSessionBundles(s, {
        opencodeIds: new Set(['root-p']),
        currentProjectDir: projectDir,
        now: Date.now(),
      });
    });

    const snap = readTuiSnapshot();
    expect(snap.sessions['root-p']).toBeDefined();
    const gone = snap.sessions['root-p']?.tree['gone-child'];
    expect(gone?.status).toBe('idle');
    expect(gone?.usage).toBeUndefined();
  });
});

describe('tui-state file safety', () => {
  test('does not clobber existing file when state json is malformed', () => {
    const filePath = getTuiStatePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{ malformed json');

    recordSessionNode({
      sessionID: 'sess-x',
      title: '',
      agent: 'explorer',
      status: 'busy',
    });

    expect(fs.readFileSync(filePath, 'utf8')).toBe('{ malformed json');
  });
});
