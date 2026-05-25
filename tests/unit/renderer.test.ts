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

  it('does NOT process nested or computed expressions', () => {
    // Template engine is intentionally simple — no code execution
    const result = renderTemplate('{{1+1}}', {});
    expect(result).toBe('');
  });
});
