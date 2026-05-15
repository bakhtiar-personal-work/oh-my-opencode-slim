import { describe, expect, test } from 'bun:test';
import {
  buildFrameOrchestratorProtocolBlock,
  buildStewardOrchestratorProtocolBlock,
  DESIGNER_VARIANT_SCOPE_LINES,
  FRAME_VARIANT_SCOPE_LINES,
  formatOrchestratorOracleVariantDepthSection,
  LIBRARIAN_VARIANT_SCOPE_LINES,
  STEWARD_PATH_GLOBS,
  STEWARD_VARIANT_SCOPE_LINES,
  SUBAGENT_USER_CLARIFICATION_HANDOFF,
} from './prompt-blocks';

describe('SUBAGENT_USER_CLARIFICATION_HANDOFF', () => {
  test('defines needs_user handoff for orchestrator question tool', () => {
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain('<needs_user>');
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain('orchestrator');
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain('questions');
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain('QuestionInfo');
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain('header');
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain('label');
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain('picker');
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain('No silent defaults');
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain(
      'Follow-up clarifications',
    );
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain(
      'Option A / Option B',
    );
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain(
      'Teaching vs picker text',
    );
    expect(SUBAGENT_USER_CLARIFICATION_HANDOFF).toContain(
      'Question UI strings',
    );
  });
});

describe('prompt-blocks', () => {
  test('steward protocol lists every configured glob', () => {
    const block = buildStewardOrchestratorProtocolBlock();
    for (const g of STEWARD_PATH_GLOBS) {
      expect(block).toContain(`\`${g}\``);
    }
    expect(block).toContain('Handoff only:');
    expect(block).toContain('Steward prompt:');
    expect(block).toContain('Attribution:');
  });

  test('frame protocol mentions delegate_subagent for frame', () => {
    const block = buildFrameOrchestratorProtocolBlock();
    expect(block).toContain('delegate_subagent(agent: "frame", ...)');
  });

  test('librarian and designer variant lines stay aligned with orchestrator use', () => {
    expect(LIBRARIAN_VARIANT_SCOPE_LINES.length).toBe(4);
    expect(DESIGNER_VARIANT_SCOPE_LINES.length).toBe(4);
  });

  test('frame variant scope lines define low/medium/high', () => {
    expect(FRAME_VARIANT_SCOPE_LINES.length).toBe(3);
    expect(FRAME_VARIANT_SCOPE_LINES[0]).toMatch(/^low:/);
    expect(FRAME_VARIANT_SCOPE_LINES[1]).toMatch(/^medium:/);
    expect(FRAME_VARIANT_SCOPE_LINES[2]).toMatch(/^high:/);
  });

  test('steward variant scope lines define low/medium/high', () => {
    expect(STEWARD_VARIANT_SCOPE_LINES.length).toBe(3);
    expect(STEWARD_VARIANT_SCOPE_LINES[0]).toMatch(/^low:/);
    expect(STEWARD_VARIANT_SCOPE_LINES[1]).toMatch(/^medium:/);
    expect(STEWARD_VARIANT_SCOPE_LINES[2]).toMatch(/^high:/);
  });

  test('oracle variant depth section includes four depth tiers', () => {
    const section = formatOrchestratorOracleVariantDepthSection();
    expect(section).toContain('VARIANT (depth):');
    expect(
      section.split('\n').filter((l) => l.startsWith('- low:')).length,
    ).toBe(1);
  });
});
