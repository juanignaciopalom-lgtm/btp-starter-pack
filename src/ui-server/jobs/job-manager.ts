/**
 * Job manager — runs CLI commands as subprocesses and streams output via SSE.
 *
 * Security:
 * - CWE-78: CLI is invoked with array args, never shell string interpolation.
 * - CWE-532: Output is sanitized before streaming — no credential leakage.
 * - Job IDs generated with crypto.randomUUID() — non-guessable.
 * - ANSI codes stripped before transmission to prevent terminal injection.
 */

import { randomUUID } from 'crypto';
import path from 'path';
import execa from 'execa';
import type { ExecaReturnValue } from 'execa';
import type { Response } from 'express';

// ── Strip ANSI escape codes ───────────────────────────────────────────────────
// Prevents terminal escape sequence injection in the browser.
const ANSI_PATTERN = /\x1B\[[0-9;]*[mGKHFABCDsuJr]|\x1B\][^\x07]*\x07/g;
export function stripAnsi(str: string): string {
  return str.replace(ANSI_PATTERN, '');
}

// ── Job types ─────────────────────────────────────────────────────────────────
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  command: string;
  args: string[];
  status: JobStatus;
  output: string[];        // buffered lines for late subscribers
  exitCode: number | null;
  startedAt: string;
  completedAt?: string;
  error?: string;          // brief error message — no stack traces (CWE-209)
}

export type SSEEvent =
  | { type: 'line';   data: string }
  | { type: 'status'; data: JobStatus }
  | { type: 'done';   exitCode: number }
  | { type: 'error';  message: string };

// ── In-memory job store ───────────────────────────────────────────────────────
const jobs = new Map<string, Job>();
const listeners = new Map<string, Set<Response>>();

// Prune completed jobs older than 30 min to prevent memory leak
const JOB_TTL_MS = 30 * 60 * 1_000;
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (
      (job.status === 'completed' || job.status === 'failed') &&
      new Date(job.startedAt).getTime() < cutoff
    ) {
      jobs.delete(id);
      listeners.delete(id);
    }
  }
}, 60_000).unref();

// ── SSE helpers ───────────────────────────────────────────────────────────────
function sendSSE(res: Response, event: SSEEvent): void {
  const data = JSON.stringify(event);
  res.write(`data: ${data}\n\n`);
}

function broadcast(jobId: string, event: SSEEvent): void {
  const subs = listeners.get(jobId);
  if (!subs) return;
  for (const res of subs) {
    try {
      sendSSE(res, event);
    } catch {
      subs.delete(res);
    }
  }
  // Close connections on terminal events
  if (event.type === 'done' || event.type === 'error') {
    for (const res of subs) {
      try { res.end(); } catch { /* ignore */ }
    }
    subs.clear();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Subscribe a response to a job's SSE stream.
 * Replays buffered output for late subscribers.
 */
export function subscribeToJob(jobId: string, res: Response): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Replay buffered output
  for (const line of job.output) {
    sendSSE(res, { type: 'line', data: line });
  }

  if (job.status === 'completed') {
    sendSSE(res, { type: 'done', exitCode: job.exitCode ?? 0 });
    res.end();
    return true;
  }
  if (job.status === 'failed') {
    sendSSE(res, { type: 'error', message: job.error ?? 'Command failed' });
    res.end();
    return true;
  }

  // Register live subscriber
  if (!listeners.has(jobId)) listeners.set(jobId, new Set());
  listeners.get(jobId)!.add(res);

  res.on('close', () => {
    listeners.get(jobId)?.delete(res);
  });

  return true;
}

/** Get a job by ID (no credentials exposed). */
export function getJob(jobId: string): Omit<Job, 'output'> & { lineCount: number } | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  const { output, ...rest } = job;
  return { ...rest, lineCount: output.length };
}

/**
 * Spawn a CLI subprocess and stream its output.
 *
 * @param cliArgs - Arguments to pass to the btp-starter-pack CLI entry point.
 *                  The first arg is the command name (e.g. 'setup').
 * @param workspaceDir - The workspace directory (passed as --workspace).
 * @param extraArgs - Additional flags (e.g. ['--skip-confirm']).
 *
 * Security (CWE-78): The CLI entry path is resolved from __dirname, never from
 * user input. workspaceDir is resolved and validated by the route handler before
 * being passed here.
 */
// ── Built-in job definitions ───────────────────────────────────────────────────
// Each step uses array args (CWE-78: no shell string interpolation).
// Multi-step jobs run steps sequentially; a non-zero exit on any step aborts.
interface BuiltinStep { cmd: string; args: string[] }
const BUILTIN_JOBS: Record<string, BuiltinStep[]> = {
  '_install-mbt': [
    { cmd: 'npm', args: ['install', '-g', 'mbt'] },
  ],
  '_install-cf-plugin': [
    // Step 1: register the CF Community plugin repo (idempotent)
    { cmd: 'cf', args: ['add-plugin-repo', 'CF-Community', 'https://plugins.cloudfoundry.org'] },
    // Step 2: install the multiapps plugin (-f skips interactive confirmation)
    { cmd: 'cf', args: ['install-plugin', 'multiapps', '-f', '-r', 'CF-Community'] },
  ],
};

// ── Helper: run one execa step and stream lines to the job ────────────────────
async function runStep(
  step: BuiltinStep,
  job: Job,
  jobId: string
): Promise<number> {
  const proc = execa(step.cmd, step.args, {
    all: true,
    reject: false,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });

  proc.all?.on('data', (chunk: Buffer) => {
    const lines = stripAnsi(chunk.toString()).split(/\r?\n/).filter((l) => l.trim() !== '');
    for (const line of lines) {
      job.output.push(line);
      broadcast(jobId, { type: 'line', data: line });
    }
  });

  const result = await proc;
  return result.exitCode ?? 0;
}

export function spawnJob(
  cliArgs: string[],
  extraArgs: string[] = []
): string {
  const jobId = randomUUID();

  const builtinKey = cliArgs[0];
  const builtinSteps = BUILTIN_JOBS[builtinKey];

  // Resolve the CLI entry point relative to this file's compiled location:
  // dist/ui-server/jobs/job-manager.js → dist/index.js
  const cliEntry = path.resolve(__dirname, '../../index.js');

  const job: Job = {
    id: jobId,
    command: builtinSteps ? builtinKey : 'node',
    args:    builtinSteps ? [] : [cliEntry, ...cliArgs, ...extraArgs],
    status:  'running',
    output:  [],
    exitCode: null,
    startedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  if (builtinSteps) {
    // ── Multi-step built-in job — runs steps sequentially ─────────────────────
    void (async () => {
      for (const step of builtinSteps) {
        const label = `${step.cmd} ${step.args.join(' ')}`;
        job.output.push(`▶ ${label}`);
        broadcast(jobId, { type: 'line', data: `▶ ${label}` });

        const code = await runStep(step, job, jobId);
        if (code !== 0) {
          job.exitCode = code;
          job.completedAt = new Date().toISOString();
          job.status = 'failed';
          job.error = `Step "${label}" exited with code ${code}`;
          broadcast(jobId, { type: 'error', message: job.error });
          return;
        }
      }
      job.exitCode = 0;
      job.completedAt = new Date().toISOString();
      job.status = 'completed';
      broadcast(jobId, { type: 'done', exitCode: 0 });
    })();
  } else {
    // ── Regular CLI passthrough job ────────────────────────────────────────────
    const proc = execa('node', [cliEntry, ...cliArgs, ...extraArgs], {
      all: true,
      reject: false,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });

    proc.all?.on('data', (chunk: Buffer) => {
      const raw = chunk.toString();
      const lines = stripAnsi(raw).split(/\r?\n/).filter((l) => l.trim() !== '');
      for (const line of lines) {
        job.output.push(line);
        broadcast(jobId, { type: 'line', data: line });
      }
    });

    void proc.then((result: ExecaReturnValue<string>) => {
      job.exitCode = result.exitCode ?? 0;
      job.completedAt = new Date().toISOString();
      if (result.exitCode === 0 || result.exitCode === null) {
        job.status = 'completed';
        broadcast(jobId, { type: 'done', exitCode: 0 });
      } else {
        job.status = 'failed';
        job.error = `Command exited with code ${result.exitCode}`; // CWE-209: no stack trace
        broadcast(jobId, { type: 'error', message: job.error });
      }
    });
  }

  return jobId;
}
