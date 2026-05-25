/**
 * Command runner module — safe execution of external CLI tools.
 *
 * Security:
 * - CWE-78 / CWE-88: ALL external commands are executed via execa with
 *   arguments as an array, NEVER via shell string interpolation.
 *   `shell: true` is permanently disabled.
 * - CWE-532: Commands are logged without sensitive argument values.
 * - Any argument that comes from user input is validated before use.
 */

import execa, { type ExecaChildProcess } from 'execa';
import chalk from 'chalk';
import { logger, sanitizeForLog } from './logger';

// ── Allowed CLI tools whitelist ───────────────────────────────────────────────
// CWE-78: Only these executable names can be run by the runner.
export const ALLOWED_EXECUTABLES = new Set([
  'btp',
  'cf',
  'node',
  'npm',
  'npx',
  'git',
  'docker',
  'cds',
  'ui5',
  'mbt',
  'yo',
] as const);

export type AllowedExecutable = 'btp' | 'cf' | 'node' | 'npm' | 'npx' | 'git' | 'docker' | 'cds' | 'ui5' | 'mbt' | 'yo';

// ── Argument validation ───────────────────────────────────────────────────────
// CWE-88: Validates that an argument value does not contain shell metacharacters.
// This is a defense-in-depth measure — execa already prevents shell injection
// (shell: false is permanent), but this catches accidental injection at the data layer.
//
// The pattern intentionally includes characters common in Windows/Linux file paths:
//   - Backslash (\) — Windows path separator
//   - Parentheses (()) — common in "Program Files (x86)" and similar paths
//   - Exclamation (!) — valid in some directory/file names
//   - Single quote (') — valid in usernames and directory names
//   - Tilde (~) — Unix home shorthand
//
// Characters NOT allowed: | ` $ > < ; & ^ (shell control operators)
const SAFE_ARG_PATTERN = /^[a-zA-Z0-9@._\-/:=+%,{}[\]"\\() !'~#]*$/;

export function isSafeArg(arg: string): boolean {
  return SAFE_ARG_PATTERN.test(arg);
}

function assertSafeArg(arg: string, context: string): void {
  if (!isSafeArg(arg)) {
    throw new Error(
      `[runner] Unsafe argument detected in context '${context}': value contains shell metacharacters. ` +
      `This is a security guard — do not pass user input directly as CLI arguments.`
    );
  }
}

// ── Run result ────────────────────────────────────────────────────────────────
export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

// ── Runner options ────────────────────────────────────────────────────────────
export interface RunOptions {
  /** Current working directory for the process */
  cwd?: string;
  /** If true, print the command but do NOT execute it */
  dryRun?: boolean;
  /** If true, suppress console output of the command itself (still logs to file) */
  silent?: boolean;
  /** Environment variables to inject (merged with current process.env) */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** If true, throw when exit code != 0 (default: true) */
  throwOnError?: boolean;
  /**
   * Arguments that contain sensitive values (e.g. service key JSON).
   * These will be REDACTED in log output.
   * They are still passed correctly to the process.
   */
  sensitiveArgIndices?: number[];
  /**
   * Indices of arguments that are file paths derived from our own code
   * (not raw user input). These bypass the SAFE_ARG_PATTERN metacharacter
   * check because:
   *   1. execa shell:false makes ALL characters safe in argv — nothing is
   *      ever interpreted by a shell.
   *   2. CWE-22 (path traversal) validation is already enforced at the call site.
   * Only use this for paths built via path.resolve/path.join on already-validated
   * server inputs — never for strings that come directly from browser requests.
   */
  trustedArgIndices?: number[];
}

// ── Core runner function ──────────────────────────────────────────────────────
/**
 * Executes an external CLI tool safely.
 *
 * @param executable - One of the ALLOWED_EXECUTABLES
 * @param args - Arguments as an ARRAY (never a string). CWE-78 mitigation.
 * @param options - Run options
 */
export async function run(
  executable: AllowedExecutable,
  args: string[],
  options: RunOptions = {}
): Promise<RunResult> {
  // CWE-78: Verify executable is whitelisted
  if (!ALLOWED_EXECUTABLES.has(executable)) {
    throw new Error(`[runner] Executable '${executable}' is not in the allowed list.`);
  }

  const {
    cwd = process.cwd(),
    dryRun = false,
    silent = false,
    env,
    timeout = 60_000,
    throwOnError = true,
    sensitiveArgIndices = [],
    trustedArgIndices = [],
  } = options;

  // CWE-88: Validate each argument
  // Skip check for sensitive args (redacted in logs) and trusted path args
  // (derived from validated server-side paths, not raw browser input).
  args.forEach((arg, idx) => {
    if (!sensitiveArgIndices.includes(idx) && !trustedArgIndices.includes(idx)) {
      assertSafeArg(arg, `${executable} arg[${idx}]`);
    }
  });

  // Build log-safe version of the command (redact sensitive args)
  const logSafeArgs = args.map((arg, idx) =>
    sensitiveArgIndices.includes(idx) ? '[SENSITIVE]' : arg
  );
  const logCommand = `${executable} ${logSafeArgs.join(' ')}`;

  if (!silent) {
    logger.debug(`→ ${sanitizeForLog(logCommand)}`);
  }

  // ── DRY RUN mode ────────────────────────────────────────────────────────────
  if (dryRun) {
    logger.info(chalk.yellow(`[dry-run] Would execute: ${sanitizeForLog(logCommand)}`));
    return { stdout: '', stderr: '', exitCode: 0, success: true };
  }

  // ── Execute (shell: false is the default in execa — never override this) ────
  let proc: ExecaChildProcess;
  try {
    proc = execa(executable, args, {
      cwd,
      // CWE-78: shell is NEVER set to true
      shell: false,
      timeout,
      env: env ? { ...process.env, ...env } : undefined,
      reject: false, // We handle errors ourselves
    }) as ExecaChildProcess;

    const result = await proc;

    const runResult: RunResult = {
      stdout: String(result.stdout ?? '').trim(),
      stderr: String(result.stderr ?? '').trim(),
      exitCode: result.exitCode ?? 0,
      success: (result.exitCode ?? 0) === 0,
    };

    if (!runResult.success) {
      const safeStderr = sanitizeForLog(runResult.stderr);
      logger.debug(`Command failed (exit ${runResult.exitCode}): ${safeStderr.substring(0, 500)}`);
      if (throwOnError) {
        throw new CommandError(
          `Command '${executable}' failed with exit code ${runResult.exitCode}`,
          runResult
        );
      }
    }

    return runResult;
  } catch (err) {
    if (err instanceof CommandError) throw err;

    // CWE-209: Do not expose raw system error to user output
    logger.error(`Failed to run '${executable}'. Is it installed and accessible from PATH?`);
    if (err instanceof Error) {
      logger.debug(`System error detail: ${sanitizeForLog(err.message)}`);
    }

    if (throwOnError) throw err;

    return { stdout: '', stderr: '', exitCode: 1, success: false };
  }
}

// ── Specialized error class ──────────────────────────────────────────────────
export class CommandError extends Error {
  constructor(
    message: string,
    public readonly result: RunResult
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

// ── Convenience: check if a tool exists ─────────────────────────────────────
export async function toolExists(executable: AllowedExecutable): Promise<boolean> {
  const checkCmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    // 'where' / 'which' are not in our allowlist, so we use a direct approach
    const result = await execa(checkCmd, [executable], {
      shell: false,
      reject: false,
      timeout: 5_000,
    });
    return (result.exitCode ?? 1) === 0;
  } catch {
    return false;
  }
}

// ── Interactive runner (TTY-inherited) ───────────────────────────────────────
/**
 * Runs a command with full TTY inheritance — stdin/stdout/stderr are wired
 * directly to the terminal. Use ONLY for commands that:
 *   - Print output before asking for input (e.g. `cf login --sso` shows a URL,
 *     then waits for a passcode).
 *   - Need keyboard interaction that execa buffered mode cannot provide.
 *
 * CWE-78: Executable is still validated against ALLOWED_EXECUTABLES.
 * CWE-88: All arguments are still validated for shell metacharacters.
 * shell: false is permanent — this only changes stdio, not execution mode.
 */
export async function runInteractive(
  executable: AllowedExecutable,
  args: string[],
  options: Pick<RunOptions, 'cwd' | 'env' | 'timeout'> = {}
): Promise<RunResult> {
  if (!ALLOWED_EXECUTABLES.has(executable)) {
    throw new Error(`[runner] Executable '${executable}' is not in the allowed list.`);
  }

  // CWE-88: Validate each argument
  args.forEach((arg, idx) => {
    assertSafeArg(arg, `${executable} arg[${idx}]`);
  });

  const { cwd = process.cwd(), env, timeout = 120_000 } = options;

  try {
    const proc = execa(executable, args, {
      cwd,
      shell: false, // CWE-78: never override
      stdio: 'inherit', // pass terminal directly — needed for interactive prompts
      timeout,
      env: env ? { ...process.env, ...env } : undefined,
      reject: false,
    }) as ExecaChildProcess;

    const result = await proc;
    const exitCode = result.exitCode ?? 0;
    return { stdout: '', stderr: '', exitCode, success: exitCode === 0 };
  } catch (err) {
    logger.error(`Failed to run '${executable}'. Is it installed and accessible from PATH?`);
    if (err instanceof Error) {
      logger.debug(`System error detail: ${sanitizeForLog(err.message)}`);
    }
    return { stdout: '', stderr: '', exitCode: 1, success: false };
  }
}

// ── Convenience: get tool version ─────────────────────────────────────────────
export async function getToolVersion(
  executable: AllowedExecutable,
  versionArg: string = '--version'
): Promise<string | null> {
  try {
    const result = await run(executable, [versionArg], {
      silent: true,
      throwOnError: false,
      timeout: 10_000,
    });
    if (result.success && result.stdout) {
      // Extract first line, first version-like string
      const firstLine = result.stdout.split('\n')[0] ?? '';
      const match = firstLine.match(/(\d+\.\d+[\.\d]*)/);
      return match ? match[1] : firstLine.substring(0, 30);
    }
    return null;
  } catch {
    return null;
  }
}
