/**
 * Shared prompt fragments for the orchestrator and specialist agents.
 * Single source of truth for duplicated routing and variant policy copy.
 */

// --- Steward ---

/** Ordered discovery roots documented for prompts and tests. */
export const STEWARD_PATH_GLOBS = [
  'AGENTS.md',
  'AGENT.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.docs/**/*.md',
  '.opencode/**',
  '.cursor/rules/**',
  '.rules/**',
  '.github/copilot-instructions.md',
  '.github/instructions/**',
] as const;

export const STEWARD_DOCS_EXCLUSION =
  '**Excluded:** wholesale `docs/**` (no leading dot) unless the ' +
  'orchestrator says `AGENTS.md` / `AGENT.md` or the user explicitly ' +
  'referenced it.';

export const STEWARD_VSCODE_OUT_OF_SCOPE =
  '**Out of scope:** `.vscode/**` (workspace noise).';

function stewardGlobBulletList(): string {
  return STEWARD_PATH_GLOBS.map((g) => `- \`${g}\``).join('\n');
}

/** Inner body for the steward agent `<steward_paths>` section. */
export function formatStewardAgentStewardPathsBody(): string {
  return [
    'Scan **existing paths only** (use glob/list tools). Priority order:',
    stewardGlobBulletList(),
    STEWARD_DOCS_EXCLUSION,
    STEWARD_VSCODE_OUT_OF_SCOPE,
  ].join('\n');
}

export function buildStewardOrchestratorProtocolBlock(): string {
  return `<steward_protocol>
- **Mandatory first pass:** Unless the user turn is **pure orchestration/meta** only (how delegation works, repeating prior subagent output verbatim), run **one** blocking \`delegate_subagent(agent: "steward", ...)\` **before** @oracle, @fixer, or @designer when the work can affect **code, tests, reviews, or repo workflow**. Pure **discovery** ("where is X") may go to @explorer first; still run @steward **before** any @fixer session or mixed implementation handoff.
- **Root agent briefs (\`AGENTS.md\` / \`AGENT.md\`):** Tell steward to **read each that exists at repo root**, **\`AGENTS.md\` before \`AGENT.md\`** when both exist (still read both), then broaden to other **.steward_paths** as needed for the goal—deeper scans are encouraged when rules may apply.
- Steward scans **.steward_paths** (glob/list; existing paths only). Priority order:
${stewardGlobBulletList()}
${STEWARD_DOCS_EXCLUSION}
${STEWARD_VSCODE_OUT_OF_SCOPE}
- Pass the user's goal verbatim plus orchestrator hints (areas: auth, UI, CI). Expect cited bullets only—**merge into @oracle / @fixer / @designer prompts** so downstream agents obey them.
</steward_protocol>

`;
}

// --- Frame ---

export function buildFrameOrchestratorProtocolBlock(): string {
  return `<frame_protocol>
- When the user message includes **images** (including pasted screenshots / clipboard) and the task is **not** explicitly UI redesign/polish, delegate first to \`delegate_subagent(agent: "frame", ...)\` (blocking) so vision runs in the specialist session.
- For explicit UI redesign, accessibility polish, or design-system work, route to @designer instead (may still use @frame earlier only if the screenshot context is ambiguous).
- The UI may show inline placeholders like \`[Image 1]\` or "img clipboard" **while** the host attaches binary parts separately—you often **cannot** see pixels yourself on a text-only orchestrator model; **still delegate to @frame** instead of asking the user to "attach again." If delegation errors about missing parts, treat it as an attachment/host pipeline issue—not users forgetting the image.
- Forward image attachments are handled by delegation plumbing when targeting @frame—do not describe pixels yourself in place of @frame.
</frame_protocol>

`;
}

// --- Librarian ---

export const LIBRARIAN_VARIANT_SCOPE_LINES = [
  'low: answer one focused question with minimal but direct citations',
  'medium: synthesize multiple sources and explain one key caveat',
  'high: provide deep multi-source comparison with explicit version ' +
  'matrix and conflict resolution',
] as const;

// --- Designer ---

export const DESIGNER_VARIANT_SCOPE_LINES = [
  'low: focused tweaks and small style corrections',
  'medium: full-page redesign or new section layout',
  'high: multi-page system-level UI patterns',
  'max: design-system-wide audit, cross-page consistency, and ' +
  'comprehensive accessibility validation',
] as const;

// --- Fixer ---

/** Orchestrator `<constraints>` line for @fixer variant caps. */
export const FIXER_ORCHESTRATOR_DELEGATION_VARIANT_RULE =
  '- ONLY use low or medium variant when delegating to @fixer. For high/max ' +
  'scope, split into multiple low/medium @fixer sessions.';

/** Specialist variant_policy cap line (orchestrator must not send high/max). */
export const FIXER_VARIANT_POLICY_CAP_LINE =
  '- high/max: NOT supported — the orchestrator constrains fixer to low/medium. ' +
  'If high/max scope is needed, split into multiple low/medium fixer sessions.';

// --- Oracle ---

export const ORACLE_VARIANT_OMITTED_DEFAULT_RULE =
  '- If variant is omitted by the caller, default to medium.';

/** Depth labels: shared between orchestrator routing and oracle specialist. */
export const ORACLE_VARIANT_DEPTH_LINES = [
  'low: minimal rationale — **smart model only** (narrow follow-up once ' +
  'smart is warranted)',
  'medium: bounded analysis; 1–3 files; clear problem statement (**minimum ' +
  'depth for default/flash**)',
  'high: multi-file, moderate ambiguity, or flash+medium was incomplete',
  'max: security-critical, data-integrity, systemic risk, or last resort ' +
  'before giving up',
] as const;

export const ORACLE_FLASH_CALLER_VARIANT_RULE =
  '- **Default (flash) oracle:** callers must use **medium–max** only — ' +
  'never pair flash with `low`.';

export const ORACLE_SMART_CALLER_VARIANT_RULE =
  '- **Smart oracle:** callers may use **low–max** depending on reasoning ' +
  'depth required.';

/** Orchestrator headline under `<model_and_variant_selection>`. */
export const ORACLE_ORCHESTRATOR_NEVER_FLASH_LOW =
  'NEVER use **default (flash) + low**.';

export function formatOracleAgentVariantPolicyXml(): string {
  const depth = ORACLE_VARIANT_DEPTH_LINES.map((l) => `- ${l}`).join('\n');
  return `<variant_policy>
${ORACLE_VARIANT_OMITTED_DEFAULT_RULE}
${depth}
${ORACLE_FLASH_CALLER_VARIANT_RULE}
${ORACLE_SMART_CALLER_VARIANT_RULE}
</variant_policy>`;
}

export function formatOrchestratorOracleVariantDepthSection(): string {
  const lines = ORACLE_VARIANT_DEPTH_LINES.map((l) => `- ${l}`).join('\n');
  return `VARIANT (depth):\n${lines}`;
}
