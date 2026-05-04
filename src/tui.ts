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

const AGENT_SORT_PRIORITY: Record<string, number> = {
  orchestrator: 0,
  explorer: 1,
  librarian: 2,
  fixer: 3,
  oracle: 4,
  designer: 5,
  observer: 6,
  council: 99,
};

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

const FLASH_DURATION_MS = 2000;

function getSpinnerChar(now: number): string {
  return SPINNER_FRAMES[Math.floor(now / 80) % SPINNER_FRAMES.length];
}

interface SessionEntry {
  sessionID: string;
  agentName: string;
  running: boolean;
  finished: boolean;
}

function getActiveSessions(
  snapshot: TuiSnapshot,
  now: number,
): SessionEntry[] {
  const seen = new Set<string>();
  const entries: SessionEntry[] = [];

  for (const [sessionID, agentName] of Object.entries(
    snapshot.activeSessions ?? {},
  )) {
    if (agentName === 'councillor') continue;
    seen.add(sessionID);
    entries.push({ sessionID, agentName, running: true, finished: false });
  }

  for (const [sessionID, fin] of Object.entries(
    snapshot.sessionFinished ?? {},
  )) {
    if (seen.has(sessionID)) continue;
    if (fin.agent === 'councillor') continue;

    // Account for polling delay: TUI may not see the finish until 1s later
    if (now - fin.time >= FLASH_DURATION_MS + 1000) continue;

    entries.push({
      sessionID,
      agentName: fin.agent,
      running: false,
      finished: true,
    });
  }

  const orchestratorAgo = now - (snapshot.orchestratorLastActive ?? 0);
  const orchestratorActive = orchestratorAgo < 15_000;
  const orchestratorBlinking =
    orchestratorAgo >= 15_000 && orchestratorAgo < 15_000 + FLASH_DURATION_MS;

  if (orchestratorActive) {
    entries.push({
      sessionID: '__orchestrator__',
      agentName: 'orchestrator',
      running: true,
      finished: false,
    });
  } else if (orchestratorBlinking) {
    entries.push({
      sessionID: '__orchestrator__',
      agentName: 'orchestrator',
      running: false,
      finished: true,
    });
  }

  return entries;
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
  const sessions = getActiveSessions(snapshot, now);
  const totalActive = sessions.filter((s) => s.running).length;
  const spinner = getSpinnerChar(now);

  const ourSessions = sessions
    .filter((s) => s.agentName in AGENT_SORT_PRIORITY)
    .sort((a, b) => {
      const pa = AGENT_SORT_PRIORITY[a.agentName] ?? 99;
      const pb = AGENT_SORT_PRIORITY[b.agentName] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.agentName.localeCompare(b.agentName);
    });

  const customSessions = sessions
    .filter((s) => !(s.agentName in AGENT_SORT_PRIORITY))
    .sort((a, b) => a.agentName.localeCompare(b.agentName));

  const agentRows: Child[] = [];

  const ourAgentCounts = new Map<string, number>();
  for (const { agentName } of ourSessions) {
    ourAgentCounts.set(agentName, (ourAgentCounts.get(agentName) ?? 0) + 1);
  }

  for (const entry of ourSessions) {
    const { sessionID, agentName, running, finished } = entry;
    const elapsed = finished
      ? now - (snapshot.sessionFinished?.[sessionID]?.time ?? 0)
      : 0;
    const flashDot = finished && Math.floor(elapsed / 200) % 2 === 0;
    const indicator = running ? spinner : flashDot ? '·' : ' ';
    const desc =
      snapshot.agentDetails?.[agentName]?.description ??
      AGENT_SIDEBAR_DESCRIPTIONS[agentName] ??
      agentName;
    const rawModel = snapshot.sessionModels?.[sessionID];
    const model = rawModel
      ? formatSidebarModelName(rawModel)
      : snapshot.agentModels[agentName]
        ? formatSidebarModelName(snapshot.agentModels[agentName])
        : 'pending';
    const variant = snapshot.sessionVariants?.[sessionID]
      ?? snapshot.agentDetails?.[agentName]?.variant;
    const indicatorColor = theme.accent;
    const nameStr = truncate(agentName, 16);
    const agentCount = ourAgentCounts.get(agentName) ?? 1;
    const descStr = truncate(desc, 12);

    agentRows.push(
      box(
        { width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
        [
          box({ flexDirection: 'row' }, [
            text({ fg: indicatorColor }, [`${indicator} `]),
            text({ fg: theme.text }, [nameStr]),
            text({ fg: theme.accent }, [` x${agentCount}`]),
          ]),
          box({ flexDirection: 'row' }, [
            text({ fg: theme.text }, [descStr]),
          ]),
        ],
      ),
    );

    const modelStr = truncate(model, 20).padEnd(8);

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

  if (customSessions.length > 0) {
    agentRows.push(box({ width: '100%' }));

    const customAgentCounts = new Map<string, number>();
    for (const { agentName } of customSessions) {
      customAgentCounts.set(
        agentName,
        (customAgentCounts.get(agentName) ?? 0) + 1,
      );
    }

    for (const entry of customSessions) {
      const { sessionID, agentName, running, finished } = entry;
      const elapsed = finished
        ? now - (snapshot.sessionFinished?.[sessionID]?.time ?? 0)
        : 0;
      const flashDot = finished && Math.floor(elapsed / 200) % 2 === 0;
      const indicator = running ? spinner : flashDot ? '·' : ' ';
      const rawModel = snapshot.sessionModels?.[sessionID];
      const model = rawModel
        ? formatSidebarModelName(rawModel)
        : snapshot.agentModels[agentName]
          ? formatSidebarModelName(snapshot.agentModels[agentName])
          : 'pending';
      const variant = snapshot.sessionVariants?.[sessionID]
        ?? snapshot.agentDetails?.[agentName]?.variant;
      const customCount = customAgentCounts.get(agentName) ?? 1;
      const nameStr = truncate(agentName, 16);
      const modelStr = truncate(model, 20).padEnd(8);

      agentRows.push(
        box(
          { width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
          [
            box({ flexDirection: 'row' }, [
              text({ fg: theme.accent }, [`${indicator} `]),
              text({ fg: theme.text }, [nameStr]),
              text({ fg: theme.accent }, [` x${customCount}`]),
            ]),
          ],
        ),
      );

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
          text({ fg: theme.textMuted }, [`[${totalActive} active]`]),
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
