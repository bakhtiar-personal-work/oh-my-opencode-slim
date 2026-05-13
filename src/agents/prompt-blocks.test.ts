import { describe, expect, test } from 'bun:test';
import {
  buildFrameOrchestratorProtocolBlock,
  buildStewardOrchestratorProtocolBlock,
  DESIGNER_VARIANT_SCOPE_LINES,
  formatOrchestratorOracleVariantDepthSection,
  LIBRARIAN_VARIANT_SCOPE_LINES,
  STEWARD_PATH_GLOBS,
} from './prompt-blocks';

describe('prompt-blocks', () => {
  test('steward protocol lists every configured glob', () => {
    const block = buildStewardOrchestratorProtocolBlock();
    for (const g of STEWARD_PATH_GLOBS) {
      expect(block).toContain(`\`${g}\``);
    }
  });

  test('frame protocol mentions delegate_subagent for frame', () => {
    const block = buildFrameOrchestratorProtocolBlock();
    expect(block).toContain('delegate_subagent(agent: "frame", ...)');
  });

  test('librarian and designer variant lines stay aligned with orchestrator use', () => {
    expect(LIBRARIAN_VARIANT_SCOPE_LINES.length).toBe(3);
    expect(DESIGNER_VARIANT_SCOPE_LINES.length).toBe(4);
  });

  test('oracle variant depth section includes four depth tiers', () => {
    const section = formatOrchestratorOracleVariantDepthSection();
    expect(section).toContain('VARIANT (depth):');
    expect(
      section.split('\n').filter((l) => l.startsWith('- low:')).length,
    ).toBe(1);
  });
});
