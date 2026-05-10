import { describe, expect, test } from 'bun:test';
import {
  aggregateOrchestrationUsage,
  formatSessionUsageRows,
  formatSidebarModelName,
  formatTokenAbbrev,
  getSidebarAgentNames,
} from './tui';
import type { TuiSnapshot } from './tui-state';

function createSnapshot(agentModels: TuiSnapshot['agentModels']): TuiSnapshot {
  return {
    version: 1,
    updatedAt: 0,
    agentModels,
    agentDetails: {},
    activeSessions: {},
    orchestratorLastActive: 0,
    agentFinishedAt: {},
    sessionModels: {},
    sessionVariants: {},
    sessionFinished: {},
    sessionTree: {},
    sessionStatuses: {},
    sessionUsage: {},
    subscriptionUsage: {},
    activeSubscriptionByProvider: {},
  };
}

describe('tui sidebar agents', () => {
  test('hides disabled agents when models are persisted explicitly', () => {
    const agentNames = getSidebarAgentNames(
      createSnapshot({
        explorer: 'openai/gpt-5.4-mini',
        fixer: 'openai/gpt-5.4-mini',
      }),
    );

    expect(agentNames).toEqual(['explorer', 'fixer']);
    expect(agentNames).not.toContain('librarian');
  });

  test('uses default-enabled fallback before models are persisted', () => {
    const agentNames = getSidebarAgentNames(createSnapshot({}));

    expect(agentNames).toContain('explorer');
    expect(agentNames).toContain('fixer');
    expect(agentNames).not.toContain('nonexistent-agent');
  });
});

describe('formatSidebarModelName', () => {
  test('keeps only the segment after the last slash', () => {
    expect(formatSidebarModelName('openai/gpt-5.5-fast')).toBe('gpt-5.5-fast');
    expect(
      formatSidebarModelName(
        'fireworks-ai/accounts/fireworks/routers/kimi-k2p5-turbo',
      ),
    ).toBe('kimi-k2p5-turbo');
  });

  test('leaves model names without slashes unchanged', () => {
    expect(formatSidebarModelName('pending')).toBe('pending');
  });
});

describe('orchestrating usage metrics formatters', () => {
  test('abbreviates token counts for sidebar rows', () => {
    expect(formatTokenAbbrev(950)).toBe('950');
    expect(formatTokenAbbrev(1_500)).toBe('2K');
    expect(formatTokenAbbrev(8_200)).toBe('8K');
    expect(formatTokenAbbrev(150_000)).toBe('150K');
    expect(formatTokenAbbrev(999_500)).toBe('1M');
    expect(formatTokenAbbrev(1_150_000)).toBe('1M');
    expect(formatTokenAbbrev(1_500_000)).toBe('2M');
  });

  test('formats context/input/output/cache rows for a session', () => {
    const snapshot = createSnapshot({});
    snapshot.sessionUsage['session-1'] = {
      contextUsed: 150_000,
      contextLimit: 400_000,
      contextPct: 38,
      input: 8_000,
      output: 900,
      reasoning: 200,
      cacheRead: 200,
      cacheWrite: 300,
      updatedAt: 0,
    };

    expect(formatSessionUsageRows(snapshot, 'session-1')).toEqual({
      contextPct: 38,
      ctxLabel: 'CTX',
      ctxValue: '150,000 (38%)',
      ioInputAbbrev: '8K',
      ioOutputAbbrev: '1K',
      cacheLabel: 'CACHE',
      cacheValue: '500',
      cacheReadAbbrev: '200',
      cacheWriteAbbrev: '300',
    });
  });

  test('aggregates totals across orchestrator and descendants', () => {
    const snapshot = createSnapshot({});
    snapshot.sessionTree = {
      orch: {
        title: 'orch',
        agent: 'orchestrator',
        model: 'openai/gpt-5',
        childIds: [],
        status: 'busy',
        createdAt: 0,
      },
      childA: {
        title: 'childA',
        agent: 'explorer',
        model: 'openai/gpt-5-mini',
        parentId: 'orch',
        childIds: [],
        status: 'busy',
        createdAt: 0,
      },
      childB: {
        title: 'childB',
        agent: 'oracle',
        model: 'openai/gpt-5',
        parentId: 'childA',
        childIds: [],
        status: 'busy',
        createdAt: 0,
      },
    };
    snapshot.sessionUsage = {
      orch: {
        contextUsed: 0,
        contextLimit: 0,
        contextPct: 0,
        input: 1_000,
        output: 200,
        reasoning: 50,
        cacheRead: 100,
        cacheWrite: 20,
        updatedAt: 0,
      },
      childA: {
        contextUsed: 0,
        contextLimit: 0,
        contextPct: 0,
        input: 2_000,
        output: 400,
        reasoning: 80,
        cacheRead: 300,
        cacheWrite: 40,
        updatedAt: 0,
      },
      childB: {
        contextUsed: 0,
        contextLimit: 0,
        contextPct: 0,
        input: 500,
        output: 120,
        reasoning: 30,
        cacheRead: 50,
        cacheWrite: 10,
        updatedAt: 0,
      },
    };

    expect(aggregateOrchestrationUsage(snapshot, 'orch')).toEqual({
      inputTotal: 3_950,
      outputTotal: 880,
      cacheRead: 450,
      cacheWrite: 70,
    });
  });
});
