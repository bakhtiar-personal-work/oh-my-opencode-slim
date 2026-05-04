import type { TuiPluginModule } from '@opencode-ai/plugin/tui';
import type { JSX } from '@opentui/solid';
import { createElement, insert, setProp } from '@opentui/solid';
import { createSignal } from 'solid-js';
import { AGENT_SIDEBAR_DESCRIPTIONS } from './agents/descriptions';
import { SUBAGENT_NAMES } from './config/constants';
import {
  readTuiSnapshot,
  readTuiSnapshotAsync,
  type SessionNode,
  type TuiSnapshot,
} from './tui-state';

const PLUGIN_NAME = 'oh-my-opencode-slim';
const FALLBACK_SIDEBAR_AGENTS: string[] = [...SUBAGENT_NAMES];
const BORDER = { type: 'single' };
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const AGENT_SORT_PRIORITY: Record<string, number> = {
  orchestrator: 0,
  explorer: 1,
  librarian: 2,
  fixer: 3,
  oracle: 4,
  designer: 5,
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
  const configuredAgents =
    Object.keys(details).length > 0
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

function buildOrchestratingRows(
  snapshot: TuiSnapshot,
  now: number,
  theme: { text: unknown; textMuted: unknown; accent: unknown },
): [string, ...Child[]] {
  const tree = snapshot.sessionTree;
  const spinner = getSpinnerChar(now);

  // Collect visible orchestrator sessions (running + flashing done)
  const visibleOrchSessions: Array<[string, SessionNode]> = [];

  for (const [id, node] of Object.entries(tree)) {
    if (node.agent !== 'orchestrator') continue;
    if (node.status === 'running') {
      visibleOrchSessions.push([id, node]);
    } else if (node.status === 'done' && node.finishedAt) {
      const elapsed = now - node.finishedAt;
      if (elapsed < FLASH_DURATION_MS) {
        visibleOrchSessions.push([id, node]);
      }
    }
  }

  const countLabel = `${visibleOrchSessions.length} active`;

  if (visibleOrchSessions.length === 0) {
    return [
      countLabel,
      text({ fg: theme.textMuted }, ['No active orchestrations']),
    ];
  }

  const rows: Child[] = [];

  for (const [orchId, orchNode] of visibleOrchSessions) {
    const modelStr = orchNode.model
      ? formatSidebarModelName(orchNode.model)
      : '';

    // Find children by parentId (robust: doesn't depend on childIds array)
    const visibleChildren: Array<{ childId: string; child: SessionNode }> = [];
    for (const [childId, child] of Object.entries(tree)) {
      if (child.parentId !== orchId) continue;
      if (child.status === 'running') {
        visibleChildren.push({ childId, child });
      } else if (child.status === 'done' && child.finishedAt) {
        const elapsed = now - child.finishedAt;
        if (elapsed < FLASH_DURATION_MS) {
          visibleChildren.push({ childId, child });
        }
      }
    }

    // Orchestrator flash dot
    const orchFlash =
      orchNode.status === 'done' &&
      orchNode.finishedAt &&
      Math.floor((now - orchNode.finishedAt) / 200) % 2 === 0;
    const orchDot =
      orchNode.status === 'running' ? spinner : orchFlash ? '·' : ' ';

    rows.push(
      box({ flexDirection: 'row' }, [
        text({ fg: theme.text }, [`${orchDot} `]),
        text({ fg: theme.text }, [truncate(orchNode.title || orchId, 28)]),
      ]),
    );
    rows.push(
      box(
        {
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'space-between',
        },
        [
          text({ fg: theme.textMuted }, [`  ${modelStr}`]),
          orchNode.variant
            ? text({ fg: theme.textMuted }, [orchNode.variant])
            : null,
        ],
      ),
    );

    // Children
    let totalFileCount = 0;
    for (let i = 0; i < visibleChildren.length; i++) {
      const { childId: _childId, child } = visibleChildren[i];
      const isLast = i === visibleChildren.length - 1;
      const branchChar = isLast ? '└' : '├';
      const pipeChar = isLast ? ' ' : '│';
      const childModel = child.model ? formatSidebarModelName(child.model) : '';
      totalFileCount += child.fileCount;

      // Flash dot for done children
      const childFlash =
        child.status === 'done' &&
        child.finishedAt &&
        Math.floor((now - child.finishedAt) / 200) % 2 === 0;
      const indicator =
        child.status === 'running' ? spinner : childFlash ? '·' : ' ';

      rows.push(
        box({ width: '100%', flexDirection: 'row' }, [
          text({ fg: theme.accent }, [`  ${branchChar}─ ${child.agent}`]),
        ]),
      );
      rows.push(
        box(
          {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
          },
          [
            text({ fg: theme.textMuted }, [`  ${pipeChar}  ${childModel}`]),
            text({ fg: theme.textMuted }, [
              child.variant ? child.variant : '',
              ` ${indicator}`,
            ]),
          ],
        ),
      );
      rows.push(
        box({ width: '100%', flexDirection: 'row' }, [
          text({ fg: theme.textMuted }, [
            `  ${pipeChar}  ${child.fileCount} file${child.fileCount !== 1 ? 's' : ''}`,
          ]),
        ]),
      );
    }

    // Totals
    rows.push(text({ fg: theme.textMuted }, [`  ${'─'.repeat(22)}`]));
    rows.push(
      text({ fg: theme.textMuted }, [
        `  Total: ${visibleChildren.length} agent${visibleChildren.length !== 1 ? 's' : ''} · ${totalFileCount} file${totalFileCount !== 1 ? 's' : ''}`,
      ]),
    );
    rows.push(box({ width: '100%', height: 1 }));
  }

  return [countLabel, ...rows];
}

function getActiveSessions(snapshot: TuiSnapshot, now: number): SessionEntry[] {
  const entries: SessionEntry[] = [];

  for (const [sessionID, node] of Object.entries(snapshot.sessionTree ?? {})) {
    const agentName = node.agent;
    if (!agentName) continue;

    if (node.status === 'running') {
      entries.push({ sessionID, agentName, running: true, finished: false });
    } else if (node.status === 'done' && node.finishedAt) {
      // Account for polling delay: TUI may not see the finish until 1s later
      if (now - node.finishedAt < FLASH_DURATION_MS + 1000) {
        entries.push({ sessionID, agentName, running: false, finished: true });
      }
    }
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

  interface SessionGroup {
    sessionID: string;
    agentName: string;
    running: boolean;
    finished: boolean;
    count: number;
    model: string;
    variant: string | undefined;
  }

  const ourGroups = new Map<string, SessionGroup>();
  for (const entry of ourSessions) {
    const { sessionID, agentName, running, finished } = entry;
    const rawModel = snapshot.sessionTree?.[sessionID]?.model;
    const model = rawModel
      ? formatSidebarModelName(rawModel)
      : snapshot.agentModels[agentName]
        ? formatSidebarModelName(snapshot.agentModels[agentName])
        : 'pending';
    const variant =
      snapshot.sessionTree?.[sessionID]?.variant ??
      snapshot.agentDetails?.[agentName]?.variant;
    const key = `${agentName}\x00${model}\x00${variant ?? ''}`;

    const group = ourGroups.get(key);
    if (group) {
      group.count++;
      group.running = group.running || running;
      group.finished = group.finished || finished;
    } else {
      ourGroups.set(key, {
        sessionID,
        agentName,
        running,
        finished,
        count: 1,
        model,
        variant,
      });
    }
  }

  for (const entry of ourGroups.values()) {
    const { sessionID, agentName, running, finished, count, model, variant } =
      entry;
    const elapsed = finished
      ? now - (snapshot.sessionTree?.[sessionID]?.finishedAt ?? 0)
      : 0;
    const flashDot = finished && Math.floor(elapsed / 200) % 2 === 0;
    const indicator = running ? spinner : flashDot ? '·' : ' ';
    const desc =
      snapshot.agentDetails?.[agentName]?.description ??
      AGENT_SIDEBAR_DESCRIPTIONS[agentName] ??
      agentName;
    const indicatorColor = theme.accent;
    const nameStr = truncate(agentName, 16);
    const descStr = truncate(desc, 12);

    agentRows.push(
      box(
        {
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'space-between',
        },
        [
          box({ flexDirection: 'row' }, [
            text({ fg: indicatorColor }, [`${indicator} `]),
            text({ fg: theme.text }, [nameStr]),
            text({ fg: theme.accent }, [` x${count}`]),
          ]),
          box({ flexDirection: 'row' }, [text({ fg: theme.text }, [descStr])]),
        ],
      ),
    );

    const modelStr = truncate(model, 20).padEnd(8);

    agentRows.push(
      box(
        {
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'space-between',
        },
        [
          text({ fg: theme.textMuted }, [`  ${modelStr}`]),
          variant ? text({ fg: theme.textMuted }, [variant]) : null,
        ],
      ),
    );
  }

  if (customSessions.length > 0) {
    agentRows.push(box({ width: '100%' }));

    const customGroups = new Map<string, SessionGroup>();
    for (const entry of customSessions) {
      const { sessionID, agentName, running, finished } = entry;
      const rawModel = snapshot.sessionTree?.[sessionID]?.model;
      const model = rawModel
        ? formatSidebarModelName(rawModel)
        : snapshot.agentModels[agentName]
          ? formatSidebarModelName(snapshot.agentModels[agentName])
          : 'pending';
      const variant =
        snapshot.sessionTree?.[sessionID]?.variant ??
        snapshot.agentDetails?.[agentName]?.variant;
      const key = `${agentName}\x00${model}\x00${variant ?? ''}`;

      const group = customGroups.get(key);
      if (group) {
        group.count++;
        group.running = group.running || running;
        group.finished = group.finished || finished;
      } else {
        customGroups.set(key, {
          sessionID,
          agentName,
          running,
          finished,
          count: 1,
          model,
          variant,
        });
      }
    }

    for (const entry of customGroups.values()) {
      const { sessionID, agentName, running, finished, count, model, variant } =
        entry;
      const elapsed = finished
        ? now - (snapshot.sessionTree?.[sessionID]?.finishedAt ?? 0)
        : 0;
      const flashDot = finished && Math.floor(elapsed / 200) % 2 === 0;
      const indicator = running ? spinner : flashDot ? '·' : ' ';
      const nameStr = truncate(agentName, 16);
      const modelStr = truncate(model, 20).padEnd(8);

      agentRows.push(
        box(
          {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
          },
          [
            box({ flexDirection: 'row' }, [
              text({ fg: theme.accent }, [`${indicator} `]),
              text({ fg: theme.text }, [nameStr]),
              text({ fg: theme.accent }, [` x${count}`]),
            ]),
          ],
        ),
      );

      agentRows.push(
        box(
          {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
          },
          [
            text({ fg: theme.textMuted }, [`  ${modelStr}`]),
            variant ? text({ fg: theme.textMuted }, [variant]) : null,
          ],
        ),
      );
    }
  }

  if (agentRows.length === 0) {
    agentRows.push(text({ fg: theme.textMuted }, ['No active agents']));
  }

  const orchestratingRows = buildOrchestratingRows(snapshot, now, theme);

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
        {
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'space-between',
        },
        [
          text({ fg: theme.text }, ['Agents']),
          text({ fg: theme.textMuted }, [`[${totalActive} active]`]),
        ],
      ),
      ...agentRows,
      ...(orchestratingRows.length > 0
        ? [
            box({ width: '100%', height: 1 }),
            box(
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
                  {
                    width: '100%',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  },
                  [
                    text({ fg: theme.text }, ['Orchestrating']),
                    text({ fg: theme.textMuted }, [
                      `[${orchestratingRows[0] as string}]`,
                    ]),
                  ],
                ),
                ...(orchestratingRows.slice(1) as Child[]),
              ],
            ),
          ]
        : []),
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
