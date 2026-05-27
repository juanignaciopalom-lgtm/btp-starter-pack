/**
 * Tests for templates/renderer.ts
 */

import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../src/templates/renderer';

describe('renderTemplate', () => {
  it('replaces a single variable', () => {
    const result = renderTemplate('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('replaces multiple variables', () => {
    const result = renderTemplate('{{greeting}} {{name}}!', {
      greeting: 'Hello',
      name: 'SAP BTP',
    });
    expect(result).toBe('Hello SAP BTP!');
  });

  it('replaces the same variable multiple times', () => {
    const result = renderTemplate('{{x}} and {{x}}', { x: 'BTP' });
    expect(result).toBe('BTP and BTP');
  });

  it('replaces nothing when no variables in template', () => {
    const result = renderTemplate('No variables here', { x: 'BTP' });
    expect(result).toBe('No variables here');
  });

  it('replaces with empty string for missing variables', () => {
    const result = renderTemplate('Hello {{missing}}!', {});
    expect(result).toBe('Hello !');
  });

  it('handles numeric values', () => {
    const result = renderTemplate('Year: {{year}}', { year: 2025 });
    expect(result).toBe('Year: 2025');
  });

  it('does NOT process computed expressions — leaves them unchanged', () => {
    // Template engine is intentionally simple — no code execution.
    // The regex \w+ only matches word chars ([a-zA-Z0-9_]); operators like + are not
    // word chars, so {{1+1}} is never matched and is returned verbatim.
    // This is the correct safe behavior: unrecognized patterns are left as-is,
    // NOT evaluated as JavaScript or replaced with empty string.
    const result = renderTemplate('{{1+1}}', {});
    expect(result).toBe('{{1+1}}');
  });

  it('does NOT process dot-access expressions — leaves them unchanged', () => {
    // {{obj.key}} contains a dot (not a word char), so it is NOT matched.
    const result = renderTemplate('{{obj.key}}', {});
    expect(result).toBe('{{obj.key}}');
  });
});
