/**
 * Shared prompt fragments for the orchestrator and specialist agents.
 * Single source of truth for duplicated routing and variant policy copy.
 */

/**
 * Subagents use `<needs_user>`; orchestrator runs host `question` once and re-delegates.
 * Shape matches OpenCode SDK `QuestionRequest.questions` / `QuestionInfo` (see
 * `@opencode-ai/sdk` v2 types: `QuestionInfo`, `QuestionOption`).
 */
export const SUBAGENT_USER_CLARIFICATION_HANDOFF = `<orchestrator_clarification>
If user intent, scope, or preference is ambiguous and blocks you: output <needs_user> with:
- \`reason\` — one line why you cannot proceed without human input
- \`questions\` — one or more items in one handoff (batch every clarification this turn so the UI does not ping-pong). Each item follows OpenCode \`QuestionInfo\`:
  - \`header\` — very short UI label (≤30 chars)
  - \`question\` — full question text
  - \`options\` — 2–5 choices; each has \`label\` (1–5 words) and \`description\` (what choosing it means)
  - optional \`multiple\`: true if the user may select more than one option for that question
  - optional \`custom\`: set \`false\` only if free-typed answers must be disabled for that question

- Question UI strings (plain text only): In every \`QuestionInfo\` you emit for <needs_user>, \`header\`, \`question\`, and each option \`label\` / \`description\` must be plain text—no markdown emphasis (\`*\` / \`**\`), no headings (\`#\`), no links. OpenCode question TUI does not render markdown.

- No silent defaults: If two or more reasonable paths exist and the pick depends on user/product taste or priorities (not a single verifiable repo or docs fact), do not choose the winner yourself—use <needs_user> and give every option a \`description\` that says what that choice does (UX outcome, tradeoff, maintenance, or product implication). When one path is objectively required (only API, security mandate, linter rule) or there is one clear evidence-backed winner, state it without asking.

- Follow-up clarifications (multi-round): When the orchestrator resumes with User answered: and any line is not a plain choice among your prior \`options\`—e.g. the user asks a nested question (\`?\` in the prose), proposes a new hybrid ("can we do X instead?"), or names a pattern / approach not in your last \`options\`—treat that line as still unresolved. Output <needs_user> again: restate their concern in \`question\` or \`reason\`, add \`options\` that cover their idea explicitly (plus prior forks if still relevant) with clear \`description\`s. Do not "finalize" with a Recommendation, a default pick, or a long prose breakdown (Option A / Option B / Option C + "we recommend…") and act as if the fork is closed—that bypasses the \`question\` UI. Those follow-ups must be answered via another \`question\` round (or the user clearly confirms in plain language with no open ?). Same rule after every resume: if ambiguity remains, <needs_user> again—not a lecturing markdown list in place of the picker.

- Teaching vs picker text: The \`question\` UI surfaces QuestionInfo only. If you add definitions or teaching in normal assistant prose before <needs_user>, fold the essential gist into the follow-up \`question\` string when you can (brief context + the actual ask) so the picker is self-contained; the orchestrator is also instructed to relay non-picker prose, but do not rely on relay alone for must-read context.

Do not call \`question\` yourself—the orchestrator must pass your fields into the host \`question\` tool (that call drives OpenCode's picker). Reply only with <needs_user> in your output; do not address the human with a parallel bullet list of choices meant for manual chat reply (or they will bypass the UI). Missing tools/files or MCP failures → <blocked>, not <needs_user>.
</orchestrator_clarification>
`;

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
  'Excluded: wholesale `docs/**` (no leading dot) unless the ' +
  'user explicitly referenced a specific file within it. ' +
  '(`AGENTS.md` / `AGENT.md` at repo root are always read per step 1.)';

export const STEWARD_VSCODE_OUT_OF_SCOPE =
  'Out of scope: `.vscode/**` (workspace noise).';

function stewardGlobBulletList(): string {
  return STEWARD_PATH_GLOBS.map((g) => `- \`${g}\``).join('\n');
}

/** Inner body for the steward agent `<steward_paths>` section. */
export function formatStewardAgentStewardPathsBody(): string {
  return [
    'Scan existing paths only (use glob/list tools). Priority order:',
    stewardGlobBulletList(),
    STEWARD_DOCS_EXCLUSION,
    STEWARD_VSCODE_OUT_OF_SCOPE,
  ].join('\n');
}

export function buildStewardOrchestratorProtocolBlock(): string {
  return `<steward_protocol>
- Same triggers as <first_gate> item 1: one blocking \`delegate_subagent(agent: "steward", ...)\` before @oracle / @fixer / @designer when work touches code, tests, reviews, or repo workflow; pure "where is X" may use @explorer first, but @steward before any @fixer (or mixed implementation).
- Steward prompt: State the goal; require \`AGENTS.md\` then \`AGENT.md\` at root when present, then other steward_paths—no vague "check rules" delegations.
- Steward scans .steward_paths (glob/list; existing paths only). Priority order:
${stewardGlobBulletList()}
${STEWARD_DOCS_EXCLUSION}
${STEWARD_VSCODE_OUT_OF_SCOPE}
- Goal + hints in prompt; cited bullets only—merge into @oracle / @fixer / @designer.
- Handoff only: cites .steward_paths—not traces, product reads, @explorer search, or @oracle analysis.
- Attribution: Rules need \`path\` + quote; do not claim steward *proved* code root cause unless the doc says so verbatim—@explorer / @oracle own diagnosis otherwise.
</steward_protocol>

`;
}

// --- Frame ---

export function buildFrameOrchestratorProtocolBlock(): string {
  return `<frame_protocol>
- When the user message includes images (including pasted screenshots / clipboard) and the task is not explicitly UI redesign/polish, delegate first to \`delegate_subagent(agent: "frame", ...)\` (blocking) so vision runs in the specialist session.
- For explicit UI redesign, accessibility polish, or design-system work, route to @designer instead (may still use @frame earlier only if the screenshot context is ambiguous).
- The UI may show inline placeholders like \`[Image 1]\` or "img clipboard" while the host attaches binary parts separately—you often cannot see pixels yourself on a text-only orchestrator model; still delegate to @frame instead of asking the user to "attach again." If delegation errors about missing parts, treat it as an attachment/host pipeline issue—not users forgetting the image.
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
  'low: minimal rationale — smart model only (narrow follow-up once ' +
  'smart is warranted)',
  'medium: bounded analysis; 1-3 files; clear problem statement (minimum ' +
  'depth for default/flash)',
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
- default (flash): standard debugging, scoped reviews, bounded analysis, no security impact — expects variant medium-max.
- smart (pro): novel architecture, unclear root cause, cross-framework subtlety, security/concurrency risk, or escalation after a flash attempt was wrong or low-confidence — supports variant low-max.

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
  'NEVER use default (flash) + low.';

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
