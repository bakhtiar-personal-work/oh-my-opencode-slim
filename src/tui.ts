import type { TuiPluginModule } from '@opencode-ai/plugin/tui';
import type { JSX } from '@opentui/solid';
import { createElement, insert, setProp } from '@opentui/solid';
import { createSignal } from 'solid-js';
import { AGENT_SIDEBAR_DESCRIPTIONS } from './agents/descriptions';
import { DEFAULT_DISABLED_AGENTS, SUBAGENT_NAMES } from './config/constants';
import {
  readTuiSnapshot,
  readTuiSnapshotAsync,
  type TuiSnapshot,
} from './tui-state';

const PLUGIN_NAME = 'oh-my-opencode-slim';
const FALLBACK_SIDEBAR_AGENTS = SUBAGENT_NAMES.filter(
  (agent) =>
    agent !== 'councillor' &&
    agent !== 'council' &&
    !DEFAULT_DISABLED_AGENTS.includes(agent),
);
const BORDER = { type: 'single' };
const SPINNER_FRAMES = [
  '⠋',
  '⠙',
  '⠹',
  '⠸',
  '⠼',
  '⠴',
  '⠦',
  '⠧',
  '⠇',
  '⠏',
];
const ORCHESTRATOR_ACTIVITY_MS = 15_000;

type Child = JSX.Element | string | number | null | undefined | false;

function element(
  tag: string,
  props: Record<string, unknown>,
  children: Child[] = [],
) {
  const node = createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) setProp(node, key, value);
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    insert(node, child);
  }

  return node as JSX.Element;
}

function text(props: Record<string, unknown>, children: Child[]) {
  return element('text', props, children);
}

function box(props: Record<string, unknown>, children: Child[] = []) {
  return element('box', props, children);
}

function truncate(value: string, max = 24): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function formatSidebarModelName(model: string): string {
  const lastSlash = model.lastIndexOf('/');
  return lastSlash === -1 ? model : model.slice(lastSlash + 1);
}

export function getSidebarAgentNames(snapshot: TuiSnapshot): string[] {
  const details = snapshot.agentDetails ?? {};
  const models = snapshot.agentModels ?? {};
  const configuredAgents = Object.keys(details).length > 0
    ? Object.keys(details)
    : Object.keys(models);
  return configuredAgents.length > 0
    ? configuredAgents
    : FALLBACK_SIDEBAR_AGENTS;
}

function computeActiveAgentCounts(
  snapshot: TuiSnapshot,
  now: number,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const agentName of Object.values(snapshot.activeSessions ?? {})) {
    counts[agentName] = (counts[agentName] ?? 0) + 1;
  }

  const orchestratorActive =
    now - (snapshot.orchestratorLastActive ?? 0) < ORCHESTRATOR_ACTIVITY_MS;
  if (orchestratorActive) {
    counts.orchestrator = (counts.orchestrator ?? 0) + 1;
  }

  return counts;
}

function computeTotalActive(
  agentCounts: Record<string, number>,
): number {
  return Object.values(agentCounts).reduce((sum, n) => sum + n, 0);
}

function getSpinnerChar(now: number): string {
  return SPINNER_FRAMES[Math.floor(now / 80) % SPINNER_FRAMES.length];
}

function renderSidebar(
  snapshot: TuiSnapshot,
  theme: {
    accent: unknown;
    borderActive: unknown;
    text: unknown;
    textMuted: unknown;
  },
): JSX.Element {
  const now = Date.now();
  const agentCounts = computeActiveAgentCounts(snapshot, now);
  const totalActive = computeTotalActive(agentCounts);
  const spinner = getSpinnerChar(now);

  const agentNames = getSidebarAgentNames(snapshot)
    .filter((n) => n !== 'councillor');

  const sortedNames = [
    'orchestrator',
    ...agentNames.filter((n) => n !== 'orchestrator').sort(),
  ];

  const agentRows: Child[] = [];

  for (const name of sortedNames) {
    const running = (agentCounts[name] ?? 0) > 0;
    const count = agentCounts[name] ?? 0;
    const indicator = running ? spinner : '·';
    const desc =
      snapshot.agentDetails?.[name]?.description ??
      AGENT_SIDEBAR_DESCRIPTIONS[name] ??
      name;
    const model = snapshot.agentModels[name]
      ? formatSidebarModelName(snapshot.agentModels[name])
      : 'pending';
    const variant = snapshot.agentDetails?.[name]?.variant;
    const indicatorColor = running ? theme.accent : theme.textMuted;

    const nameStr = truncate(name, 12);
    const descStr = truncate(desc, 12);

    agentRows.push(
      box(
        { width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
        [
          box({ flexDirection: 'row' }, [
            text({ fg: indicatorColor }, [`${indicator} `]),
            text({ fg: theme.text }, [nameStr]),
          ]),
          box({ flexDirection: 'row' }, [
            text({ fg: theme.text }, [descStr]),
            count > 0
              ? text({ fg: theme.accent }, [` ×${count}`])
              : null,
          ]),
        ],
      ),
    );

    const modelStr = truncate(model, 14).padEnd(14);

    agentRows.push(
      box(
        { width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
        [
          text({ fg: theme.textMuted }, [`  ${modelStr}`]),
          variant
            ? text({ fg: theme.textMuted }, [variant])
            : null,
        ],
      ),
    );
  }

  return box(
    {
      width: '100%',
      flexDirection: 'column',
      border: BORDER,
      borderColor: theme.borderActive,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
    },
    [
      box(
        { width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
        [
          text({ fg: theme.text }, ['Agents']),
          text({ fg: theme.textMuted }, [`[${totalActive} total]`]),
        ],
      ),
      ...agentRows,
    ],
  );
}

const plugin: TuiPluginModule & { id: string } = {
  id: `${PLUGIN_NAME}:tui`,
  tui: async (api, _options, _meta) => {
    const [snapshot, setSnapshot] = createSignal(readTuiSnapshot());
    const [tick, setTick] = createSignal(0);

    const dataTimer = setInterval(async () => {
      try {
        setSnapshot(await readTuiSnapshotAsync());
      } catch {
        // Ignore render errors; this is best-effort live status.
      }
    }, 1000);

    const animTimer = setInterval(() => {
      setTick(tick() + 1);
    }, 50);

    api.lifecycle.onDispose(() => {
      clearInterval(dataTimer);
      clearInterval(animTimer);
    });

    api.slots.register({
      order: 150,
      slots: {
        sidebar_content() {
          tick();
          return renderSidebar(snapshot(), api.theme.current);
        },
      },
    });
  },
};

export default plugin;
