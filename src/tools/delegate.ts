import type { ToolDefinition } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config';
import { ALL_AGENT_NAMES, TMUX_SPAWN_DELAY_MS } from '../config/constants';
import { getAgentOverride } from '../config/utils';
import {
  recordSessionDone,
  recordSessionNode,
  sessionTreeStore,
  updateSnapshot,
} from '../tui-state';
import {
  extractSessionResult,
  type PromptBody,
  parseModelReference,
  promptWithTimeout,
} from '../utils/session';
import type { SubagentDepthTracker } from '../utils/subagent-depth';

type OpencodeClient = import('@opencode-ai/plugin').PluginInput['client'];

const VARIANT_OPTIONS = ['low', 'medium', 'high', 'max'] as const;
const MODE_OPTIONS = ['blocking', 'fire_forget'] as const;

export function createDelegateTools(
  ctx: { client: OpencodeClient; directory: string },
  config: PluginConfig | undefined,
  depthTracker: SubagentDepthTracker | undefined,
  multiplexerEnabled: boolean,
): Record<string, ToolDefinition> {
  const directory = ctx.directory;

  const subagentOptions: readonly string[] = [
    ...ALL_AGENT_NAMES.filter((name) => name !== 'orchestrator'),
  ];

  function recordSessionTree(
    sessionId: string,
    parentSessionId: string,
    agent: string,
    variant?: string,
    mode?: 'blocking' | 'fire_forget',
  ): void {
    recordSessionNode({
      sessionID: sessionId,
      title: '',
      agent,
      variant,
      parentId: parentSessionId,
      mode,
    });
    updateSnapshot((snapshot) => {
      for (const bundle of Object.values(snapshot.sessions)) {
        const parent = bundle.tree[parentSessionId];
        if (!parent) continue;
        if (!parent.childIds.includes(sessionId)) {
          parent.childIds.push(sessionId);
        }
        bundle.lastActivityAt = Date.now();
      }
    });
    const storeParent = sessionTreeStore[parentSessionId];
    if (storeParent && !storeParent.childIds.includes(sessionId)) {
      storeParent.childIds.push(sessionId);
    }
  }

  async function runAgentSession(options: {
    parentSessionId: string;
    title: string;
    agent: string;
    model: string;
    variant: string | undefined;
    promptText: string;
    timeout: number;
  }): Promise<string> {
    const modelRef = parseModelReference(options.model);
    if (!modelRef) {
      throw new Error(`Invalid model format: ${options.model}`);
    }

    let sessionId: string | undefined;

    try {
      const session = await ctx.client.session.create({
        body: {
          parentID: options.parentSessionId,
          title: options.title,
        },
        query: { directory },
      });

      if (!session.data?.id) {
        throw new Error('Failed to create session');
      }

      sessionId = session.data.id;

      // Record in session tree directly (bypasses event reliability)
      recordSessionTree(
        sessionId,
        options.parentSessionId,
        options.agent,
        options.variant,
        'blocking',
      );

      if (depthTracker) {
        const registered = depthTracker.registerChild(
          options.parentSessionId,
          sessionId,
        );
        if (!registered) {
          throw new Error('Subagent depth exceeded');
        }
      }

      if (multiplexerEnabled) {
        await new Promise((r) => setTimeout(r, TMUX_SPAWN_DELAY_MS));
      }

      const body: PromptBody = {
        agent: options.agent,
        model: modelRef,
        tools: { task: false },
        parts: [{ type: 'text', text: options.promptText }],
      };

      if (options.variant) {
        body.variant = options.variant;
      }

      await promptWithTimeout(
        ctx.client,
        {
          path: { id: sessionId },
          body,
          query: { directory },
        },
        options.timeout,
      );

      const extraction = await extractSessionResult(ctx.client, sessionId, {
        includeReasoning: false,
      });

      // Mark done before cleanup so flash dot shows in TUI
      recordSessionDone(sessionId);

      if (extraction.empty) {
        throw new Error('Empty response from provider');
      }

      return extraction.text;
    } finally {
      if (sessionId) {
        try {
          await Promise.race([
            ctx.client.session.abort({ path: { id: sessionId } }),
            new Promise((r) => setTimeout(r, 2000)),
          ]);
        } catch {
          /* abort may fail if session already disposed */
        }
        if (depthTracker) {
          depthTracker.cleanup(sessionId);
        }
      }
    }
  }

  const delegateSubagent: ToolDefinition = tool({
    description:
      'Delegate a task to a specialist subagent with explicit variant control. ' +
      'Always specify variant based on task complexity. ' +
      'Blocking mode waits for the result; fire_forget returns a session_id to collect later.',
    args: {
      agent: tool.schema
        .enum(subagentOptions)
        .describe('Target specialist subagent'),
      prompt: tool.schema
        .string()
        .describe('Detailed task description for the subagent'),
      variant: tool.schema
        .enum(VARIANT_OPTIONS)
        .describe(
          'Reasoning depth: low (simple), medium (typical), high (complex), max (critical)',
        ),
      mode: tool.schema
        .enum(MODE_OPTIONS)
        .optional()
        .describe(
          'blocking (default) waits for result; fire_forget returns session_id immediately',
        ),
      model: tool.schema
        .string()
        .optional()
        .describe(
          'Override the subagent model. Pass for @oracle when you selected a specific model (flash vs pro).',
        ),
    },
    execute: async (args, context) => {
      const parentSessionId = context.sessionID;
      const agentName = args.agent;
      const variant = args.variant;
      const mode = args.mode ?? 'blocking';

      const agentOverride = getAgentOverride(config, agentName);
      const effectiveVariant = agentOverride?.variant ?? variant;

      let model = args.model;
      if (!model && config?.agents?.[agentName]?.model) {
        const rawModel = config.agents[agentName].model;
        model = typeof rawModel === 'string' ? rawModel : undefined;
      }

      if (!model) {
        return `Error: No model configured for agent "${agentName}"`;
      }

      if (mode === 'fire_forget') {
        const modelRef = parseModelReference(model);
        if (!modelRef) {
          return `Error: Invalid model format: ${model}`;
        }

        try {
          const session = await ctx.client.session.create({
            body: {
              parentID: parentSessionId,
              title: `${agentName} (${effectiveVariant ?? 'default'})`,
            },
            query: { directory },
          });

          if (!session.data?.id) {
            return 'Error: Failed to create session';
          }

          const sessionId = session.data.id;

          // Record in session tree directly
          recordSessionTree(
            sessionId,
            parentSessionId,
            agentName,
            effectiveVariant,
            'fire_forget',
          );

          if (depthTracker) {
            depthTracker.registerChild(parentSessionId, sessionId);
          }

          const promptBody: PromptBody = {
            agent: agentName,
            model: modelRef,
            tools: { task: false },
            parts: [{ type: 'text', text: args.prompt }],
          };

          if (effectiveVariant) {
            promptBody.variant = effectiveVariant;
          }

          ctx.client.session
            .prompt({
              path: { id: sessionId },
              body: promptBody,
              query: { directory },
            })
            .catch(() => {});

          return `Launched ${agentName} (variant: ${effectiveVariant ?? 'default'}, mode: fire_forget).\nSession ID: ${sessionId}\nCollect with delegate_collect(session_id: "${sessionId}")`;
        } catch (err) {
          return `Error launching ${agentName}: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      // Blocking mode
      try {
        const result = await runAgentSession({
          parentSessionId,
          title: `${agentName} (${effectiveVariant ?? 'default'})`,
          agent: agentName,
          model,
          variant: effectiveVariant,
          promptText: args.prompt,
          timeout: 0, // no timeout — let subagents run freely
        });

        let output = `**${agentName}** (variant: ${effectiveVariant ?? 'default'}):\n\n`;
        output += result;
        return output;
      } catch (err) {
        return `Error running ${agentName} (variant: ${effectiveVariant ?? 'default'}): ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

  const delegateCollect: ToolDefinition = tool({
    description:
      'Collect results from a fire_forget delegation. ' +
      'Pass the session_id returned by delegate_subagent in fire_forget mode.',
    args: {
      session_id: tool.schema
        .string()
        .describe('Session ID from delegate_subagent fire_forget'),
    },
    execute: async (args) => {
      try {
        const sid = args.session_id;
        const statusResult = await (
          ctx.client.session.status as (
            args: Record<string, unknown>,
          ) => Promise<{ data?: Record<string, unknown> }>
        )({ path: { id: sid } });

        const status = (statusResult.data as Record<string, unknown>)?.type as
          | string
          | undefined;

        if (status === 'idle' || status === 'completed' || status === 'error') {
          recordSessionDone(args.session_id);

          const extraction = await extractSessionResult(
            ctx.client,
            args.session_id,
            { includeReasoning: false },
          );

          ctx.client.session
            .abort({ path: { id: args.session_id } })
            .catch(() => {});

          if (depthTracker) {
            depthTracker.cleanup(args.session_id);
          }

          if (extraction.empty) {
            return 'Session completed but produced no output.';
          }

          return extraction.text;
        }

        return `Session still running (status: ${status ?? 'unknown'}). Try again shortly. Use original delegate_subagent session_id.`;
      } catch (err) {
        return `Error collecting result: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });

  return {
    delegate_subagent: delegateSubagent,
    delegate_collect: delegateCollect,
  };
}
