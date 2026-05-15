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
  'user explicitly referenced a specific file within it. ' +
  '(`AGENTS.md` / `AGENT.md` at repo root are always read per step 1.)';

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
- **Rules handoff only:** Steward cites **.steward_paths** for downstream prompts. It does **not** replace opening stack-trace files/lines, product source inspection, **@explorer** location work, or **@oracle** technical analysis.
- **Attribution:** Credit steward only for **cited** rules. Do not summarize steward as proving code-level root cause unless a steward_path doc states it verbatim (\`path\` + quoted excerpt)—otherwise **@explorer** / **@oracle** own diagnosis.
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
  'max: exhaustive cross-source research with full version matrix, ' +
    'competing implementations, and ecosystem-wide context',
] as const;

// --- Frame ---

export const FRAME_VARIANT_SCOPE_LINES = [
  'low: single image — identify key elements and suggest one routing agent',
  'medium: multi-image or complex diagram — cross-reference visible artifacts ' +
    'and produce a structured routing recommendation',
  'high: detailed technical breakdown of multiple screenshots or diagrams with ' +
    'annotated findings and ordered routing chain',
] as const;

// --- Steward ---

export const STEWARD_VARIANT_SCOPE_LINES = [
  'low: check AGENTS.md / AGENT.md only; stop after root anchor files',
  'medium: root anchor files plus ranked steward_paths relevant to the stated ' +
    'goal (up to ~6 deep reads)',
  'high: exhaustive scan of all steward_paths including .cursor/rules, ' +
    '.opencode, .docs, and any secondary convention shards',
] as const;

// --- Designer ---

export const DESIGNER_VARIANT_SCOPE_LINES = [
  'low: focused tweaks and small style corrections',
  'medium: full-page redesign or new section layout',
  'high: multi-page system-level UI patterns',
  'max: design-system-wide audit, cross-page consistency, and ' +
    'comprehensive accessibility validation',
] as const;

// --- Explorer ---

export const EXPLORER_VARIANT_SCOPE_LINES = [
  'low: locate one file/pattern in a known directory; single-concept search',
  'medium: multi-directory cross-reference; find all callers/usages of a symbol',
  'high: exhaustive codebase-wide usage analysis across all directories; ' +
    'comprehensive dependency mapping (round cap does not apply; state coverage upfront)',
  'max: not supported — explorer is a search and location agent; ' +
    'use @oracle for deep analysis of discovered results',
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
  'medium: bounded analysis; 1-3 files; clear problem statement (**minimum ' +
    'depth for default/flash**)',
  'high: multi-file, moderate ambiguity, or flash+medium was incomplete',
  'max: security-critical, data-integrity, systemic risk, or last resort ' +
    'before giving up',
] as const;

export const ORACLE_SELF_AWARENESS_NOTE =
  '- If you receive `variant: low` and your session model is a standard/flash ' +
  'tier (not the smart/pro tier configured by the orchestrator), the depth may ' +
  'be insufficient. Proceed at minimal depth and note the limitation in ' +
  '`<confidence>` rather than refusing or stalling. If you infer you are the ' +
  'smart tier but your capabilities feel limited for the task, surface that ' +
  'discrepancy in `<confidence>` as well.';

/**
 * Model-tier context block injected into oracle\'s own prompt.
 * Explains when each tier is used so oracle can calibrate confidence and depth.
 */
export const ORACLE_MODEL_TIER_BLOCK = `<model_tier>
The orchestrator operates two oracle tiers and selects one before delegating:
- **default (flash):** standard debugging, scoped reviews, bounded analysis, no security impact — expects variant medium-max.
- **smart (pro):** novel architecture, unclear root cause, cross-framework subtlety, security/concurrency risk, or escalation after a flash attempt was wrong or low-confidence — supports variant low-max.

Deciding factors the orchestrator uses to pick the tier:
1. Security or data-integrity risk → always smart.
2. Novel/unclear root cause, concurrency, cross-framework subtlety → smart.
3. Prior flash result was wrong or explicitly low-confidence → escalate to smart.
4. Standard scoped debugging or review with no ambiguity → default.

You cannot observe your own model name. Infer your likely tier from the variant received:
- variant low → you are almost certainly the smart tier (flash + low is a misconfiguration).
- variant max → high-stakes task; calibrate for security/systemic risk regardless of tier.
- variant medium/high on a focused task → likely default tier; proceed at appropriate depth.
</model_tier>`;

/** Orchestrator headline under `<model_and_variant_selection>`. */
export const ORACLE_ORCHESTRATOR_NEVER_FLASH_LOW =
  'NEVER use **default (flash) + low**.';

export function formatOracleAgentVariantPolicyXml(): string {
  const depth = ORACLE_VARIANT_DEPTH_LINES.map((l) => `- ${l}`).join('\n');
  return `<variant_policy>
${ORACLE_VARIANT_OMITTED_DEFAULT_RULE}
${depth}
${ORACLE_SELF_AWARENESS_NOTE}
</variant_policy>`;
}

export function formatOrchestratorOracleVariantDepthSection(): string {
  const lines = ORACLE_VARIANT_DEPTH_LINES.map((l) => `- ${l}`).join('\n');
  return `VARIANT (depth):\n${lines}`;
}
