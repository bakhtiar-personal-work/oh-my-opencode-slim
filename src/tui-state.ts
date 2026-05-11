import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  SubscriptionProvider,
  SubscriptionUsageEntry,
} from './subscriptions/types';

export type { SubscriptionUsageEntry };

export interface AgentDetail {
  description: string;
  variant?: string;
}

export interface SessionFinish {
  agent: string;
  time: number;
}

export interface SessionNode {
  title: string;
  agent: string;
  model: string;
  variant?: string;
  parentId?: string;
  childIds: string[];
  status: 'busy' | 'idle' | 'retry';
  mode?: 'blocking' | 'fire_forget';
  createdAt: number;
  finishedAt?: number;
}

export interface SessionUsageEntry {
  contextUsed: number;
  contextLimit: number;
  contextPct: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  updatedAt: number;
}

export interface TuiSnapshot {
  version: 1;
  updatedAt: number;
  agentModels: Record<string, string>;
  agentDetails: Record<string, AgentDetail>;
  activeSessions: Record<string, string>;
  orchestratorLastActive: number;
  agentFinishedAt: Record<string, number>;
  sessionModels: Record<string, string>;
  sessionVariants: Record<string, string>;
  sessionFinished: Record<string, SessionFinish>;
  sessionTree: Record<string, SessionNode>;
  sessionStatuses: Record<string, string>;
  sessionUsage: Record<string, SessionUsageEntry>;
  /** Subscription usage entries keyed by provider + account name. */
  subscriptionUsage: Record<string, SubscriptionUsageEntry>;
  /** Active account name by provider. */
  activeSubscriptionByProvider: Partial<Record<SubscriptionProvider, string>>;
}

/** In-memory session tree store — shared between main plugin and TUI.
 *  Both run in the same process; this avoids file I/O latency and polling
 *  issues. File persistence still happens for agent data but the tree
 *  is read from memory for instant sidebar updates. */
export const sessionTreeStore: Record<string, SessionNode> = {};

const STATE_DIR = 'oh-my-opencode-slim';
const STATE_FILE = 'tui-state.json';

function dataDir(): string {
  return (
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share')
  );
}

export function getTuiStatePath(): string {
  return path.join(dataDir(), 'opencode', 'storage', STATE_DIR, STATE_FILE);
}

function emptySnapshot(): TuiSnapshot {
  return {
    version: 1,
    updatedAt: Date.now(),
    agentModels: {},
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

function normalizeSubscriptionUsage(
  usage: Record<string, SubscriptionUsageEntry>,
): Record<string, SubscriptionUsageEntry> {
  return usage;
}

function normalizeSessionUsage(
  usage: Record<string, Partial<SessionUsageEntry>>,
): Record<string, SessionUsageEntry> {
  const result: Record<string, SessionUsageEntry> = {};
  for (const [sessionID, entry] of Object.entries(usage)) {
    if (!entry) continue;
    result[sessionID] = {
      contextUsed:
        typeof entry.contextUsed === 'number'
          ? Math.max(0, entry.contextUsed)
          : 0,
      contextLimit:
        typeof entry.contextLimit === 'number'
          ? Math.max(0, entry.contextLimit)
          : 0,
      contextPct:
        typeof entry.contextPct === 'number'
          ? Math.max(0, Math.min(100, entry.contextPct))
          : 0,
      input: typeof entry.input === 'number' ? Math.max(0, entry.input) : 0,
      output: typeof entry.output === 'number' ? Math.max(0, entry.output) : 0,
      reasoning:
        typeof entry.reasoning === 'number' ? Math.max(0, entry.reasoning) : 0,
      cacheRead:
        typeof entry.cacheRead === 'number' ? Math.max(0, entry.cacheRead) : 0,
      cacheWrite:
        typeof entry.cacheWrite === 'number'
          ? Math.max(0, entry.cacheWrite)
          : 0,
      updatedAt:
        typeof entry.updatedAt === 'number' ? Math.max(0, entry.updatedAt) : 0,
    };
  }
  return result;
}

function parseSnapshot(value: string): TuiSnapshot | null {
  const parsed = JSON.parse(value) as Partial<TuiSnapshot> | undefined;
  if (parsed?.version !== 1) return null;

  const activeSubscriptionByProvider: Partial<
    Record<SubscriptionProvider, string>
  > = {};
  if (parsed.activeSubscriptionByProvider) {
    for (const provider of ['opencode-go', 'neuralwatt'] as const) {
      const value = parsed.activeSubscriptionByProvider[provider];
      if (typeof value === 'string' && value.length > 0) {
        activeSubscriptionByProvider[provider] = value;
      }
    }
  }

  return {
    version: 1,
    updatedAt:
      typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    agentModels: parsed.agentModels ?? {},
    agentDetails: parsed.agentDetails ?? {},
    activeSessions: parsed.activeSessions ?? {},
    orchestratorLastActive:
      typeof parsed.orchestratorLastActive === 'number'
        ? parsed.orchestratorLastActive
        : 0,
    agentFinishedAt: parsed.agentFinishedAt ?? {},
    sessionModels: parsed.sessionModels ?? {},
    sessionVariants: parsed.sessionVariants ?? {},
    sessionFinished: parsed.sessionFinished ?? {},
    sessionTree: parsed.sessionTree ?? {},
    sessionStatuses: parsed.sessionStatuses ?? {},
    sessionUsage: normalizeSessionUsage(parsed.sessionUsage ?? {}),
    subscriptionUsage: normalizeSubscriptionUsage(
      parsed.subscriptionUsage ?? {},
    ),
    activeSubscriptionByProvider,
  };
}

function tryReadSnapshot(): {
  snapshot: TuiSnapshot;
  okForMutation: boolean;
} {
  const filePath = getTuiStatePath();
  try {
    const parsed = parseSnapshot(fs.readFileSync(filePath, 'utf8'));
    if (parsed) {
      return { snapshot: parsed, okForMutation: true };
    }
    // Preserve existing file on schema/version mismatch.
    return { snapshot: emptySnapshot(), okForMutation: false };
  } catch (error) {
    // Missing file is expected on first run; allow initialization.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { snapshot: emptySnapshot(), okForMutation: true };
    }
    // For parse/read errors, avoid clobbering existing state.
    return { snapshot: emptySnapshot(), okForMutation: false };
  }
}

export function readTuiSnapshot(): TuiSnapshot {
  return tryReadSnapshot().snapshot;
}

export async function readTuiSnapshotAsync(): Promise<TuiSnapshot> {
  try {
    const parsed = parseSnapshot(
      await fs.promises.readFile(getTuiStatePath(), 'utf8'),
    );
    return parsed ?? emptySnapshot();
  } catch {
    return emptySnapshot();
  }
}

function writeTuiSnapshot(snapshot: TuiSnapshot): void {
  try {
    const filePath = getTuiStatePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(snapshot)}\n`);
  } catch {
    // TUI state is best-effort only.
  }
}

export function updateSnapshot(mutator: (snapshot: TuiSnapshot) => void): void {
  const { snapshot, okForMutation } = tryReadSnapshot();
  if (!okForMutation) return;
  mutator(snapshot);
  snapshot.updatedAt = Date.now();
  writeTuiSnapshot(snapshot);
}

export function recordTuiAgentModels(input: {
  agentModels: Record<string, string>;
}): void {
  updateSnapshot((snapshot) => {
    snapshot.agentModels = { ...input.agentModels };
  });
}

export function recordTuiAgentModel(input: {
  agentName: string;
  model: string;
}): void {
  updateSnapshot((snapshot) => {
    snapshot.agentModels[input.agentName] = input.model;
  });
}

export function recordAgentDetails(details: Record<string, AgentDetail>): void {
  updateSnapshot((snapshot) => {
    snapshot.agentDetails = { ...details };
  });
}

export function recordAgentVariant(input: {
  agentName: string;
  variant: string;
}): void {
  updateSnapshot((snapshot) => {
    const existing = snapshot.agentDetails[input.agentName];
    snapshot.agentDetails[input.agentName] = {
      description: existing?.description ?? '',
      variant: input.variant,
    };
  });
}

export function recordSessionStart(input: {
  sessionID: string;
  agentName: string;
}): void {
  updateSnapshot((snapshot) => {
    snapshot.activeSessions[input.sessionID] = input.agentName;
    delete snapshot.agentFinishedAt[input.agentName];
    delete snapshot.sessionFinished[input.sessionID];
  });
}

export function recordSessionEnd(sessionID: string): void {
  updateSnapshot((snapshot) => {
    const agentName = snapshot.activeSessions[sessionID];
    delete snapshot.activeSessions[sessionID];
    if (agentName) {
      const stillActive = Object.values(snapshot.activeSessions).includes(
        agentName,
      );
      if (!stillActive) {
        snapshot.agentFinishedAt[agentName] = Date.now();
      }
      snapshot.sessionFinished[sessionID] = {
        agent: agentName,
        time: Date.now(),
      };
    }
  });
}

export function recordSessionModel(input: {
  sessionID: string;
  model: string;
}): void {
  updateSnapshot((snapshot) => {
    snapshot.sessionModels[input.sessionID] = input.model;
  });
}

export function recordSessionVariant(input: {
  sessionID: string;
  variant: string;
}): void {
  updateSnapshot((snapshot) => {
    snapshot.sessionVariants[input.sessionID] = input.variant;
  });
}

export function recordOrchestratorActivity(): void {
  updateSnapshot((snapshot) => {
    snapshot.orchestratorLastActive = Date.now();
  });
}

export function recordSessionNode(input: {
  sessionID: string;
  title: string;
  agent: string;
  model?: string;
  variant?: string;
  parentId?: string;
  mode?: 'blocking' | 'fire_forget';
  status?: 'busy' | 'idle' | 'retry';
}): void {
  updateSnapshot((snapshot) => {
    const existing = sessionTreeStore[input.sessionID] ??
      snapshot.sessionTree[input.sessionID] ?? {
        title: '',
        agent: '',
        model: '',
        childIds: [],
        status: 'busy' as const,
        createdAt: Date.now(),
      };
    const node = {
      ...existing,
      title: input.title ?? existing.title,
      agent: input.agent || existing.agent,
      model: input.model ?? existing.model,
      variant: input.variant !== undefined ? input.variant : existing.variant,
      parentId:
        input.parentId !== undefined ? input.parentId : existing.parentId,
      mode: input.mode !== undefined ? input.mode : existing.mode,
      status: input.status ?? existing.status,
      createdAt: existing.createdAt,
    };
    snapshot.sessionTree[input.sessionID] = node;
    sessionTreeStore[input.sessionID] = node;
  });
}

export function recordSessionDone(sessionID: string): void {
  updateSnapshot((snapshot) => {
    const node = snapshot.sessionTree[sessionID];
    if (node) {
      node.status = 'idle';
      node.finishedAt = Date.now();
    }
    // Also sync to in-memory store (file-read is a different object ref)
    const storeNode = sessionTreeStore[sessionID];
    if (storeNode) {
      storeNode.status = 'idle';
      storeNode.finishedAt = Date.now();
    }
  });
}

export function recordSessionUsage(input: {
  sessionID: string;
  contextUsed: number;
  contextLimit: number;
  contextPct: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}): void {
  updateSnapshot((snapshot) => {
    const prev = snapshot.sessionUsage[input.sessionID];

    // Preserve previous contextPct if new one is unreliable (0% due to
    // uncached limit). This prevents flickering when streaming handler
    // overwrites completion data.
    const shouldPreservePct =
      prev &&
      input.contextPct === 0 &&
      prev.contextPct > 0 &&
      input.contextLimit === 0;

    snapshot.sessionUsage[input.sessionID] = {
      contextUsed: Math.max(prev?.contextUsed ?? 0, input.contextUsed),
      contextLimit: Math.max(0, input.contextLimit),
      contextPct: shouldPreservePct
        ? prev.contextPct
        : Math.max(0, Math.min(100, input.contextPct)),
      input: Math.max(0, input.input),
      output: Math.max(0, input.output),
      reasoning: Math.max(0, input.reasoning),
      cacheRead: Math.max(0, input.cacheRead),
      cacheWrite: Math.max(0, input.cacheWrite),
      updatedAt: Date.now(),
    };
  });
}

export function subscriptionUsageKey(
  provider: SubscriptionProvider,
  accountName: string,
): string {
  return `${provider}\u0000${accountName}`;
}

/**
 * Record subscription usage entries (multi-provider).
 */
export function recordSubscriptionUsage(usage: SubscriptionUsageEntry[]): void {
  updateSnapshot((snapshot) => {
    snapshot.subscriptionUsage = {};
    for (const entry of usage) {
      if (entry.accountName) {
        snapshot.subscriptionUsage[
          subscriptionUsageKey(entry.provider, entry.accountName)
        ] = entry;
      }
    }
  });
}

/**
 * Remove a subscription usage entry by provider/account name.
 */
export function removeSubscriptionUsageEntry(
  provider: SubscriptionProvider,
  name: string,
): void {
  updateSnapshot((snapshot) => {
    delete snapshot.subscriptionUsage[subscriptionUsageKey(provider, name)];
  });
}

/**
 * Record the active subscription account by provider.
 * Pass null to clear for that provider.
 */
export function recordActiveSubscriptionForProvider(
  provider: SubscriptionProvider,
  name: string | null,
): void {
  updateSnapshot((snapshot) => {
    if (name) {
      snapshot.activeSubscriptionByProvider[provider] = name;
    } else {
      delete snapshot.activeSubscriptionByProvider[provider];
    }
  });
}
