# Agents Directory Codemap

## Responsibility

`src/agents/` defines built-in specialists and converts configuration into
OpenCode SDK registration data.

Responsibilities:

- Build orchestrator and specialist agent definitions from factory functions.
- Resolve overrides for model, variant, temperature, options, and display name.
- Compose permissions, MCP allow-lists, and visibility metadata for OpenCode.

## Core architecture

### Construction flow (`createAgents`)

1. Compute the disabled set via `getDisabledAgents()`:
   - from `config.disabled_agents`
   - with protected-agent guard (`orchestrator` never disabled)
2. Build built-in subagents from `SUBAGENT_FACTORIES` (`SUBAGENT_NAMES`).
3. Load prompt files for each agent:
   - `<agent>.md` replacement prompt
   - `<agent>_append.md` append prompt
4. Apply override handling:
   - string model → `config.model`
   - array model → `agent._modelArray` and clear `config.model`
   - merge `temperature`, `variant`, `options`, `displayName`.
5. Apply permission defaults per agent (`applyDefaultPermissions`).
6. Build orchestrator using prompt files + disabled-agent filtering.
7. Normalize/collect display names and inject `@displayName` references into:
   orchestrator prompt.
8. Validate display-name collisions/agent-name conflicts.
9. Return `[orchestrator, ...subagents]`.

### Runtime model behavior

- `_modelArray` is used as the ordered runtime failover chain when supplied.
- `orchestrator` may start unresolved (`model` undefined) to allow downstream
  runtime resolution.
- `subagent` overrides preserve per-model variants inside `_modelArray` while
  optionally keeping top-level `variant` as default fallback.

## Delegation and registration semantics

- `getAgentConfigs(config)` converts definitions to SDK configs and sets:
  - `orchestrator` → `mode: primary`
  - built-in specialists → `mode: subagent`
- If `displayName` is set:
  - internal key remains registered but hidden
  - host-facing key becomes normalized display name

Permission defaults:

- `question` defaults to `allow` unless existing explicit deny.
- Nested `skill` permissions come from `getSkillPermissionsForAgent` and are
  merged with existing permission maps.

## Capability and policy inputs

- MCP allow-lists:
  - `getAgentMcpList(name, config)` from `src/config/agent-mcps.ts`
  - `agent-mcps` defaults in `src/config/agent-mcps.ts`
- Agent metadata/aliases:
  - `AGENT_ALIASES`, `SUBAGENT_NAMES`, `PROTECTED_AGENTS`
  - `getAgentOverride` from `src/config/utils.ts`
- Skills:
  - `cli/skills.ts`

## Flow and integration

```text
src/index.ts
  └─> loadPluginConfig()
      └─> createAgents(config) / getAgentConfigs(config)
          └─> registration + runtime chat hooks

  loadPluginConfig()
    └─> prompt overrides + presets
        └─> createAgents/orchestrator prompt
```

## Utilities and helpers

- `isSubagent(name)` — type guard for subagent names.
- `getDisabledAgents(config)` and `getEnabledAgentNames(config)`.
- `resolvePrompt()` in `orchestrator.ts` centralizes replacement vs append behavior.

## File structure

- `index.ts` (agent registry, classification)
- `orchestrator.ts` (base prompts, prompt resolution, model-array type)
- `explorer.ts`, `librarian.ts`, `oracle.ts`, `designer.ts`, `fixer.ts` (specialist factory prompts/config)
- `overrides.ts` (agent override and permission application)
- `descriptions.ts` (centralized agent descriptions and sidebar labels)
