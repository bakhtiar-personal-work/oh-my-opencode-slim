/**
 * Centralized agent descriptions used by the orchestrator prompt,
 * SDK registration, and sidebar UI labels.
 */

// XML-formatted agent descriptions for the orchestrator delegation prompt
export const AGENT_DESCRIPTIONS: Record<string, string> = {
  explorer: `<agent name="@explorer">
- Role: codebase search specialist
- Delegate when: locate files, usages, symbols, tests, config links
- Do not use when: exact file is already known and must be read in full
</agent>`,
  librarian: `<agent name="@librarian">
- Role: external docs and API reference specialist
- Delegate when: library behavior, version details, official examples, upstream GitHub issues/PRs/releases
- Do not use when: pure language fundamentals or local code discovery
</agent>`,
  oracle: `<agent name="@oracle">
- Role: strategic analysis and code review specialist
- Delegate when: any technical analysis—debugging, architecture, tradeoffs, risk, code review—including trivial/light asks
- Model/variant: per orchestrator oracle matrix (default flash: medium-max only; smart: low-max; never flash + low)
</agent>`,
  designer: `<agent name="@designer">
- Role: UI and UX specialist
- Delegate when: user-facing design quality, interaction polish, accessibility UX review
- Do not use when: backend-only or non-visual implementation
</agent>`,
  fixer: `<agent name="@fixer">
- Role: implementation specialist
- Delegate when: any code edit, test update, scoped execution task
- Do not use when: discovery or strategy is still unresolved, or repo conventions are unknown—run @steward (or orchestrator fallback) first
</agent>`,
  steward: `<agent name="@steward">
- Role: rules handoff—cite agent/IDE conventions from steward_paths (not application code diagnosis)
- Delegate when: feature/refactor/tooling work where local conventions may apply; ambiguous style or repo policy; before heavy oracle/fixer when rules unknown
- Do not use when: pure codebase symbol search (use @explorer), external docs (use @librarian), or @steward is disabled—then fall back to @explorer globs for AGENTS.md / AGENT.md / .docs only
</agent>`,
  frame: `<agent name="@frame">
- Role: screenshot and attached-image analyst (errors, diagrams, repro captures)
- Delegate when: user message includes images and the task is not explicitly UI redesign/polish-only
- Do not use when: explicit UI/UX redesign review—use @designer; text-only questions with no attachments
</agent>`,
};

// Compact sidebar labels for the TUI agent list
export const AGENT_SIDEBAR_DESCRIPTIONS: Record<string, string> = {
  orchestrator: 'Orchestrates',
  explorer: 'File Search',
  librarian: 'Doc Search',
  oracle: 'Architecture',
  designer: 'Design',
  fixer: 'Implement',
  steward: 'Repo rules',
  frame: 'Vision',
};
