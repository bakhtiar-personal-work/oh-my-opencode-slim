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
- Delegate when: debugging, architecture, tradeoffs, risk review
- Do not use when: pure factual answer with zero analysis required
</agent>`,
  designer: `<agent name="@designer">
- Role: UI and UX specialist
- Delegate when: user-facing design quality, interaction polish, accessibility UX review
- Do not use when: backend-only or non-visual implementation
</agent>`,
  fixer: `<agent name="@fixer">
- Role: implementation specialist
- Delegate when: any code edit, test update, scoped execution task
- Do not use when: discovery or strategy is still unresolved
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
};
