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
- Role: technical analysis and code review (\`thinker\`); uses orchestrator \`model\` + \`variant\` matrix
- Delegate when: debugging, architecture, tradeoffs, risk, any review depth
- Do not use when: pure local discovery (@explorer) or docs-only (@librarian)
</agent>`,
  designer: `<agent name="@designer">
- Role: UI/UX specialist for new or redesigned surfaces before @fixer implements
- Delegate when: screens, flows, layout, components, a11y polish—when @fixer must not invent UI
- Do not use when: backend-only or non-visual work
</agent>`,
  fixer: `<agent name="@fixer">
- Role: implementation specialist
- Delegate when: edits, tests, scoped commands—after gates in <first_gate> when applicable
- Do not use when: strategy/conventions/UI design still unresolved—delegate upward first
</agent>`,
  steward: `<agent name="@steward">
- Role: rules handoff from steward_paths (no app diagnosis)
- Delegate when: repo conventions needed before oracle/fixer (see <first_gate> 1)
- Do not use when: pure symbol search (@explorer); if disabled, orchestrator uses explorer globs for agent briefs
</agent>`,
  frame: `<agent name="@frame">
- Role: screenshot / attached-image analyst
- Delegate when: user message has images and task is not redesign-only
- Do not use when: redesign-only—use @designer; text-only prompts
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
