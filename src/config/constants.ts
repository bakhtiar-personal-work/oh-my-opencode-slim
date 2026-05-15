// Agent names
export const AGENT_ALIASES: Record<string, string> = {
  explore: 'explorer',
  'frontend-ui-ux-engineer': 'designer',
};

export const SUBAGENT_NAMES = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'fixer',
  'steward',
  'frame',
] as const;

export const ORCHESTRATOR_NAME = 'orchestrator' as const;

export const ALL_AGENT_NAMES = [ORCHESTRATOR_NAME, ...SUBAGENT_NAMES] as const;

// Agent name type (for use in DEFAULT_MODELS)
export type AgentName = (typeof ALL_AGENT_NAMES)[number];

// Subagent delegation rules: which agents can spawn which subagents
// orchestrator: can spawn all subagents (full delegation)
// All others: leaf nodes — cannot spawn subagents
export const ORCHESTRATABLE_AGENTS = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'fixer',
  'steward',
  'frame',
] as const;

/** Agents that cannot be disabled even if listed in disabled_agents config. */
export const PROTECTED_AGENTS = new Set(['orchestrator']);

/**
 * Get the list of orchestratable agents, excluding any disabled agents.
 * This is used for delegation validation at runtime.
 */
export function getOrchestratableAgents(
  disabledAgents?: Set<string>,
): string[] {
  return ORCHESTRATABLE_AGENTS.filter((name) => !disabledAgents?.has(name));
}

export const SUBAGENT_DELEGATION_RULES: Record<AgentName, readonly string[]> = {
  orchestrator: ORCHESTRATABLE_AGENTS,
  fixer: [],
  designer: [],
  explorer: [],
  librarian: [],
  oracle: [],
  steward: [],
  frame: [],
};

// Default models for each agent
// Hybrid NeuralWatt + OpenCode-Go strategy:
// - Orchestrator on NeuralWatt GLM-5.1 (energy-efficient, strong routing)
// - Explorer on NeuralWatt Qwen3.5-397B-Fast (cheap MoE, tool-calling, no reasoning overhead)
// - Oracle, Librarian, Designer, Fixer on OpenCode-Go (proven reliability)
export const DEFAULT_MODELS: Record<AgentName, string | undefined> = {
  orchestrator: 'neuralwatt/zai-org/GLM-5.1-FP8',
  oracle: 'opencode-go/deepseek-v4-flash',
  librarian: 'opencode-go/deepseek-v4-flash',
  explorer: 'neuralwatt/qwen3.5-397b-fast',
  designer: 'opencode-go/mimo-v2.5-pro',
  fixer: 'opencode-go/deepseek-v4-flash',
  steward: 'opencode-go/deepseek-v4-flash',
  frame: 'opencode-go/mimo-v2.5-pro',
};

// Polling configuration
export const POLL_INTERVAL_MS = 500;
export const POLL_INTERVAL_SLOW_MS = 1000;
export const POLL_INTERVAL_BACKGROUND_MS = 2000;

// Timeouts
export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
export const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes
export const FALLBACK_FAILOVER_TIMEOUT_MS = 15_000;

// Subagent depth limits
export const DEFAULT_MAX_SUBAGENT_DEPTH = 3;

// Workflow reminders
export const PHASE_REMINDER_TEXT = `!IMPORTANT! Follow **<first_gate>** order in system prompt; **delegate_subagent** in the same turn you name the agent. !END!`;

// Tmux pane spawn delay (ms) — gives TmuxSessionManager time to create pane
export const TMUX_SPAWN_DELAY_MS = 500;

// Stagger delay (ms) between parallel session launches to avoid tmux collisions
export const STAGGER_MS = 250;

// Polling stability
export const STABLE_POLLS_THRESHOLD = 3;

/** Agents that are disabled by default. */
export const DEFAULT_DISABLED_AGENTS: string[] = [];
