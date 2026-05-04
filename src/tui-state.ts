import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface AgentDetail {
  description: string;
  variant?: string;
}

export interface SessionFinish {
  agent: string;
  time: number;
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
}

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
  };
}

function parseSnapshot(value: string): TuiSnapshot {
  const parsed = JSON.parse(value) as Partial<TuiSnapshot> | undefined;
  if (parsed?.version !== 1) return emptySnapshot();

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
  };
}

export function readTuiSnapshot(): TuiSnapshot {
  try {
    return parseSnapshot(fs.readFileSync(getTuiStatePath(), 'utf8'));
  } catch {
    return emptySnapshot();
  }
}

export async function readTuiSnapshotAsync(): Promise<TuiSnapshot> {
  try {
    return parseSnapshot(await fs.promises.readFile(getTuiStatePath(), 'utf8'));
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

function updateSnapshot(mutator: (snapshot: TuiSnapshot) => void): void {
  const snapshot = readTuiSnapshot();
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

export function recordAgentDetails(
  details: Record<string, AgentDetail>,
): void {
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
