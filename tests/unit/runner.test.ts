/**
 * Tests for core/runner.ts
 * Verifies security constraints: CWE-78, CWE-88
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSafeArg, CommandError } from '../../src/core/runner';

// vi.mock() calls are hoisted to the top of the file by Vitest.
// Variables declared with const/let are NOT available at hoist time.
// vi.hoisted() creates variables that ARE available when the factory runs.
const mockExeca = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ stdout: 'mock output', stderr: '', exitCode: 0 })
);

vi.mock('execa', () => ({
  default: mockExeca,
  execa: mockExeca,
}));

// Mock logger to avoid file system writes
vi.mock('../../src/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
    blank: vi.fn(),
    section: vi.fn(),
    logFile: vi.fn().mockReturnValue(null),
  },
  sanitizeForLog: (s: string) => s,
  initLogger: vi.fn(),
}));

describe('runner — isSafeArg (CWE-88 guard)', () => {
  it('allows alphanumeric args', () => {
    expect(isSafeArg('hello123')).toBe(true);
  });

  it('allows email-like args (for --email flag values)', () => {
    expect(isSafeArg('user@example.com')).toBe(true);
  });

  it('allows UUIDs', () => {
    expect(isSafeArg('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('allows CF service plans', () => {
    expect(isSafeArg('lite')).toBe(true);
    expect(isSafeArg('application')).toBe(true);
    expect(isSafeArg('app-host')).toBe(true);
  });

  it('allows BTP CLI group/object notation', () => {
    expect(isSafeArg('accounts/subaccount')).toBe(true);
    expect(isSafeArg('services/instance')).toBe(true);
  });

  it('blocks semicolons — command chaining attempt', () => {
    expect(isSafeArg('value; rm -rf /')).toBe(false);
  });

  it('blocks pipe character', () => {
    expect(isSafeArg('value | cat /etc/passwd')).toBe(false);
  });

  it('blocks backtick — command substitution', () => {
    expect(isSafeArg('`whoami`')).toBe(false);
  });

  it('blocks dollar sign — variable expansion', () => {
    expect(isSafeArg('$HOME')).toBe(false);
  });

  it('blocks newlines', () => {
    expect(isSafeArg('value\ncmd')).toBe(false);
  });

  it('blocks null bytes', () => {
    expect(isSafeArg('value\x00')).toBe(false);
  });
});

describe('runner — run() CWE-78 guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-whitelisted executables', async () => {
    const { run } = await import('../../src/core/runner');
    // @ts-expect-error Testing invalid executable
    await expect(run('bash', ['-c', 'whoami'])).rejects.toThrow('not in the allowed list');
  });

  it('rejects non-whitelisted executables — rm', async () => {
    const { run } = await import('../../src/core/runner');
    // @ts-expect-error Testing invalid executable
    await expect(run('rm', ['-rf', '/'])).rejects.toThrow('not in the allowed list');
  });

  it('returns dry-run result without calling execa when dryRun=true', async () => {
    const { run } = await import('../../src/core/runner');

    const result = await run('btp', ['--version'], { dryRun: true, silent: true });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('rejects unsafe argument with shell metacharacter', async () => {
    const { run } = await import('../../src/core/runner');

    await expect(
      run('cf', ['services; echo pwned'])
    ).rejects.toThrow(/unsafe argument/i);
  });
});

describe('CommandError', () => {
  it('creates a CommandError with result', () => {
    const result = { stdout: '', stderr: 'error', exitCode: 1, success: false };
    const err = new CommandError('test error', result);
    expect(err.name).toBe('CommandError');
    expect(err.result).toBe(result);
    expect(err.message).toBe('test error');
  });
});
