import { describe, expect, test } from 'bun:test';
import { buildOrchestratorPrompt, resolvePrompt } from './orchestrator';

describe('resolvePrompt', () => {
  test('returns base when neither custom nor append provided', () => {
    const result = resolvePrompt('BASE PROMPT');
    expect(result).toBe('BASE PROMPT');
  });

  test('custom prompt replaces base entirely', () => {
    const result = resolvePrompt('BASE', 'CUSTOM');
    expect(result).toBe('CUSTOM');
  });

  test('append prompt is appended to base', () => {
    const result = resolvePrompt('BASE', undefined, 'APPEND');
    expect(result).toBe('BASE\n\nAPPEND');
  });

  test('custom prompt wins over append (both provided)', () => {
    const result = resolvePrompt('BASE', 'CUSTOM', 'APPEND');
    expect(result).toBe('CUSTOM');
  });

  test('empty string custom prompt replaces base with empty', () => {
    const result = resolvePrompt('BASE', '');
    expect(result).toBe('');
  });

  test('empty string append adds extra newline', () => {
    const result = resolvePrompt('BASE', undefined, '');
    expect(result).toBe('BASE\n\n');
  });

  test('base is undefined', () => {
    const result = resolvePrompt(undefined as unknown as string, 'CUSTOM');
    expect(result).toBe('CUSTOM');
  });
});

describe('buildOrchestratorPrompt', () => {
  test('includes all agent descriptions when no agents disabled', () => {
    const prompt = buildOrchestratorPrompt();
    expect(prompt).toContain('@explorer');
    expect(prompt).toContain('@librarian');
    expect(prompt).toContain('@oracle');
    expect(prompt).toContain('@designer');
    expect(prompt).toContain('@fixer');
    expect(prompt).toContain('@steward');
    expect(prompt).toContain('@frame');
  });

  test('includes routing priority, question tool, oracle matrix, steward/frame', () => {
    const prompt = buildOrchestratorPrompt();
    expect(prompt).toContain('<routing_priority>');
    expect(prompt).toContain('<user_clarification>');
    expect(prompt).toContain('`question` tool');
    expect(prompt).toContain('NEVER use **default (flash) + low**');
    expect(prompt).toContain('<steward_protocol>');
    expect(prompt).toContain('<frame_protocol>');
  });

  test('omits steward_protocol when steward disabled', () => {
    const prompt = buildOrchestratorPrompt(new Set(['steward']));
    expect(prompt).not.toContain('</steward_protocol>');
    expect(prompt).toContain('<frame_protocol>');
  });

  test('omits frame_protocol when frame disabled', () => {
    const prompt = buildOrchestratorPrompt(new Set(['frame']));
    expect(prompt).toContain('<steward_protocol>');
    expect(prompt).not.toContain('<frame_protocol>');
  });

  test('filters out disabled agent from description block', () => {
    const prompt = buildOrchestratorPrompt(new Set(['designer']));
    expect(prompt).toContain('@explorer');
    expect(prompt).not.toContain('name="@designer"');
  });

  test('filters validation routing lines for disabled agents', () => {
    const prompt = buildOrchestratorPrompt(new Set(['designer']));
    expect(prompt).not.toContain('Route UI/UX validation');
    // Other validation lines that don't mention designer still present
    expect(prompt).toContain('Route code review');
  });

  test('filters parallel delegation examples', () => {
    const prompt = buildOrchestratorPrompt(new Set(['fixer']));
    expect(prompt).not.toContain('Multiple @fixer instances');
    expect(prompt).toContain('Multiple @explorer');
  });

  test('all agents disabled, prompt still has structure', () => {
    const prompt = buildOrchestratorPrompt(
      new Set([
        'explorer',
        'librarian',
        'oracle',
        'designer',
        'fixer',
        'steward',
        'frame',
      ]),
    );
    expect(prompt).toContain('<role>');
    expect(prompt).toContain('<constraints>');
    expect(prompt).toContain('<agents>');
  });

  test('filters validation routing when steward disabled', () => {
    const prompt = buildOrchestratorPrompt(new Set(['steward']));
    expect(prompt).not.toContain('Route in-repo agent');
  });

  test('filters steward parallel example when steward disabled', () => {
    const prompt = buildOrchestratorPrompt(new Set(['steward']));
    expect(prompt).not.toContain('@steward + @explorer');
  });

  test('injects oracle model names when provided', () => {
    const prompt = buildOrchestratorPrompt(
      undefined,
      'openai/gpt-5.5',
      'openai/gpt-5.5-pro',
    );
    expect(prompt).toContain('openai/gpt-5.5-pro');
    expect(prompt).toContain('openai/gpt-5.5');
    expect(prompt).not.toContain('{{ORACLE_DEFAULT_MODEL}}');
    expect(prompt).not.toContain('{{ORACLE_SMART_MODEL_OR_FALLBACK}}');
  });

  test('empty model names do not break prompt', () => {
    const prompt = buildOrchestratorPrompt(undefined, '', '');
    // Should still produce valid prompt without template placeholders
    expect(prompt).not.toContain('{{');
  });
});
