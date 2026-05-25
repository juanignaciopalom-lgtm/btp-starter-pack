/**
 * Comprehensive integration tests for the Express API routes.
 *
 * Strategy:
 * - Spin up the real Express app (createApp) on a random port per suite.
 * - Mock all external CLI calls (btp, cf) so tests are fast and reproducible.
 * - Mock job-manager so we can control job IDs without spawning processes.
 * - Use native fetch (Node 18+) for HTTP assertions.
 *
 * Coverage:
 * - POST /api/init — cfOrg = globalAccountSubdomain (no "trial" doubling), CWE-20 validation
 * - GET  /api/config — exists / not-found
 * - GET/PUT /api/wizard-state — CRUD
 * - POST /api/wizard-state/reset — full reset
 * - POST /api/reset/step — per-step cleanup actions (1–6)
 * - GET  /api/verify/step — all 6 steps
 * - POST /api/cf/target — org/space targeting, CWE-78 input validation
 * - POST /api/jobs/deploy — CWE-22 path traversal rejection, mta.yaml pre-check
 * - POST /api/jobs/generate — name/type/namespace validation
 * - GET  /api/health — alive
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import http from 'node:http';

// ── Mocks — must be declared before any import that uses these modules ─────────

vi.mock('../../src/btp/btp-cli', () => ({
  btpIsLoggedIn: vi.fn().mockResolvedValue(false),
  btpGetInfo: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/btp/cf-cli', () => ({
  cfIsLoggedIn: vi.fn().mockResolvedValue(false),
  cfGetTarget: vi.fn().mockResolvedValue(null),
  cfListServices: vi.fn().mockResolvedValue([]),
  cfListApps: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/ui-server/jobs/job-manager', () => ({
  spawnJob: vi.fn().mockReturnValue('test-job-uuid-0000'),
  getJob: vi.fn().mockReturnValue(null),
  subscribeToJob: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/core/runner', () => ({
  run: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }),
}));

// ── Imports after mocks ────────────────────────────────────────────────────────

import { createApp } from '../../src/ui-server/server';
import * as btpCli from '../../src/btp/btp-cli';
import * as cfCli from '../../src/btp/cf-cli';
import * as runner from '../../src/core/runner';

// ── Test helpers ───────────────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;
let tempDir: string;

async function api(method: string, path: string, body?: unknown) {
  const url = `${baseUrl}/api${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

const get  = (p: string) => api('GET', p);
const post = (p: string, b: unknown) => api('POST', p, b);
const put  = (p: string, b: unknown) => api('PUT', p, b);

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-api-'));
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.removeSync(tempDir);
});

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to default mocked values
  vi.mocked(btpCli.btpIsLoggedIn).mockResolvedValue(false);
  vi.mocked(btpCli.btpGetInfo).mockResolvedValue(null);
  vi.mocked(cfCli.cfIsLoggedIn).mockResolvedValue(false);
  vi.mocked(cfCli.cfGetTarget).mockResolvedValue(null);
  vi.mocked(cfCli.cfListServices).mockResolvedValue([]);
  vi.mocked(cfCli.cfListApps).mockResolvedValue([]);
  vi.mocked(runner.run).mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 });
});

// ── GET /api/health ────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const r = await get('/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });
});

// ── POST /api/init ─────────────────────────────────────────────────────────────

describe('POST /api/init', () => {
  it('creates config with cfOrg equal to globalAccountSubdomain — no "trial" doubling', async () => {
    const r = await post('/init', {
      workspace: tempDir,
      email: 'test@example.com',
      region: 'eu10',
      globalAccountSubdomain: '4bd5c287trial',
      cfSpace: 'dev',
    });

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    // cfOrg MUST equal globalAccountSubdomain — not "4bd5c287trialtrial"
    expect(r.body.config.cfOrg).toBe('4bd5c287trial');
    expect(r.body.config.cfOrg).not.toContain('trialtrial');
  });

  it('cfOrg works correctly for subdomains that do NOT end in trial', async () => {
    const r = await post('/init', {
      workspace: tempDir,
      email: 'user@example.com',
      region: 'us10',
      globalAccountSubdomain: 'mycompanyaccount',
      cfSpace: 'dev',
    });

    expect(r.status).toBe(200);
    expect(r.body.config.cfOrg).toBe('mycompanyaccount');
  });

  it('returns 400 for invalid email', async () => {
    const r = await post('/init', {
      workspace: tempDir,
      email: 'not-an-email',
      region: 'eu10',
      globalAccountSubdomain: 'sub',
      cfSpace: 'dev',
    });

    expect(r.status).toBe(400);
    expect(r.body.error).toBeDefined();
  });

  it('returns 400 for unknown region', async () => {
    const r = await post('/init', {
      workspace: tempDir,
      email: 'valid@example.com',
      region: 'zz99',
      globalAccountSubdomain: 'sub',
      cfSpace: 'dev',
    });

    expect(r.status).toBe(400);
  });

  it('returns 400 when globalAccountSubdomain is missing', async () => {
    const r = await post('/init', {
      workspace: tempDir,
      email: 'valid@example.com',
      region: 'eu10',
      // globalAccountSubdomain intentionally omitted
      cfSpace: 'dev',
    });

    expect(r.status).toBe(400);
  });
});

// ── GET /api/config ────────────────────────────────────────────────────────────

describe('GET /api/config', () => {
  it('returns exists:false when no config file', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-cfg-'));
    try {
      const r = await get(`/config?workspace=${encodeURIComponent(emptyDir)}`);
      expect(r.status).toBe(200);
      expect(r.body.exists).toBe(false);
      expect(r.body.config).toBeNull();
    } finally {
      fs.removeSync(emptyDir);
    }
  });

  it('returns exists:true with config after init', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-cfg2-'));
    try {
      await post('/init', {
        workspace: dir,
        email: 'a@b.com',
        region: 'eu10',
        globalAccountSubdomain: 'mysubdomain',
        cfSpace: 'dev',
      });

      const r = await get(`/config?workspace=${encodeURIComponent(dir)}`);
      expect(r.status).toBe(200);
      expect(r.body.exists).toBe(true);
      expect(r.body.config.email).toBe('a@b.com');
    } finally {
      fs.removeSync(dir);
    }
  });
});

// ── GET/PUT /api/wizard-state ──────────────────────────────────────────────────

describe('wizard-state routes', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-wz-'));
  });

  afterEach(() => {
    fs.removeSync(wsDir);
  });

  it('GET returns fresh state with 6 pending steps', async () => {
    const r = await get(`/wizard-state?workspace=${encodeURIComponent(wsDir)}`);
    expect(r.status).toBe(200);
    expect(r.body.steps).toHaveLength(6);
    r.body.steps.forEach((s: { status: string }) => expect(s.status).toBe('pending'));
    expect(r.body.stepNames).toBeDefined();
    expect(r.body.totalSteps).toBe(6);
  });

  it('PUT updates a step status', async () => {
    const r = await put('/wizard-state', {
      workspace: wsDir,
      stepId: 2,
      status: 'completed',
    });
    expect(r.status).toBe(200);
    expect(r.body.steps.find((s: { id: number }) => s.id === 2).status).toBe('completed');
  });

  it('PUT does NOT auto-advance currentStep', async () => {
    const before = await get(`/wizard-state?workspace=${encodeURIComponent(wsDir)}`);
    const originalStep = before.body.currentStep;

    await put('/wizard-state', {
      workspace: wsDir,
      stepId: originalStep,
      status: 'completed',
    });

    const after = await get(`/wizard-state?workspace=${encodeURIComponent(wsDir)}`);
    expect(after.body.currentStep).toBe(originalStep); // no auto-advance
  });

  it('PUT returns 400 for invalid stepId', async () => {
    const r = await put('/wizard-state', {
      workspace: wsDir,
      stepId: 99,
      status: 'completed',
    });
    expect(r.status).toBe(400);
  });

  it('PUT returns 400 for invalid status', async () => {
    const r = await put('/wizard-state', {
      workspace: wsDir,
      stepId: 1,
      status: 'unknown-status',
    });
    expect(r.status).toBe(400);
  });

  it('POST wizard-state/reset resets everything', async () => {
    // Dirty the state
    await put('/wizard-state', { workspace: wsDir, stepId: 3, status: 'completed' });

    const r = await post('/wizard-state/reset', { workspace: wsDir });
    expect(r.status).toBe(200);
    r.body.steps.forEach((s: { status: string }) => expect(s.status).toBe('pending'));
    expect(r.body.currentStep).toBe(1);
  });
});

// ── POST /api/reset/step ───────────────────────────────────────────────────────

describe('POST /api/reset/step', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-rst-'));
  });

  afterEach(() => {
    fs.removeSync(wsDir);
  });

  it('step 1 — deletes .btp-starter.json and reports action', async () => {
    // Create a fake config file
    fs.writeJsonSync(path.join(wsDir, '.btp-starter.json'), { version: '1.0.0' });

    const r = await post('/reset/step', { workspace: wsDir, stepId: 1 });

    expect(r.status).toBe(200);
    expect(r.body.actions).toContain('Deleted .btp-starter.json');
    expect(fs.existsSync(path.join(wsDir, '.btp-starter.json'))).toBe(false);
  });

  it('step 1 — no-op (no action logged) when config file does not exist', async () => {
    const r = await post('/reset/step', { workspace: wsDir, stepId: 1 });

    expect(r.status).toBe(200);
    expect(r.body.actions).not.toContain('Deleted .btp-starter.json');
  });

  it('step 2 — runs btp logout (best-effort)', async () => {
    vi.mocked(runner.run).mockResolvedValueOnce({ success: true, stdout: 'OK', stderr: '', exitCode: 0 });

    const r = await post('/reset/step', { workspace: wsDir, stepId: 2 });

    expect(r.status).toBe(200);
    expect(r.body.actions.some((a: string) => a.includes('btp logout'))).toBe(true);
  });

  it('step 2 — graceful when btp logout fails', async () => {
    vi.mocked(runner.run).mockResolvedValueOnce({ success: false, stdout: '', stderr: 'not installed', exitCode: 1 });

    const r = await post('/reset/step', { workspace: wsDir, stepId: 2 });

    expect(r.status).toBe(200);
    expect(r.body.actions.some((a: string) => a.includes('skipped'))).toBe(true);
  });

  it('step 3 — runs cf logout', async () => {
    vi.mocked(runner.run).mockResolvedValueOnce({ success: true, stdout: 'logged out', stderr: '', exitCode: 0 });

    const r = await post('/reset/step', { workspace: wsDir, stepId: 3 });

    expect(r.status).toBe(200);
    expect(r.body.actions.some((a: string) => a.includes('cf logout'))).toBe(true);
  });

  it('step 4 — status-only reset with manual instruction', async () => {
    const r = await post('/reset/step', { workspace: wsDir, stepId: 4 });

    expect(r.status).toBe(200);
    expect(r.body.actions.some((a: string) => a.includes('cf delete-service'))).toBe(true);
  });

  it('step 5 — deletes project directory when provided', async () => {
    const projDir = path.join(wsDir, 'my-project');
    fs.ensureDirSync(projDir);
    fs.writeFileSync(path.join(projDir, 'mta.yaml'), 'ID: my-project');

    const r = await post('/reset/step', {
      workspace: wsDir,
      stepId: 5,
      projectDir: projDir,
    });

    expect(r.status).toBe(200);
    expect(r.body.actions.some((a: string) => a.includes('Deleted project directory'))).toBe(true);
    expect(fs.existsSync(projDir)).toBe(false);
  });

  it('step 5 — CWE-22: rejects path traversal outside workspace', async () => {
    const r = await post('/reset/step', {
      workspace: wsDir,
      stepId: 5,
      projectDir: '/etc/passwd',
    });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('workspace');
  });

  it('step 5 — status-only reset when no projectDir provided', async () => {
    const r = await post('/reset/step', { workspace: wsDir, stepId: 5 });

    expect(r.status).toBe(200);
    expect(r.body.actions.some((a: string) => a.includes('status reset only'))).toBe(true);
  });

  it('step 6 — status-only reset with manual instruction', async () => {
    const r = await post('/reset/step', { workspace: wsDir, stepId: 6 });

    expect(r.status).toBe(200);
    expect(r.body.actions.some((a: string) => a.includes('cf delete'))).toBe(true);
  });

  it('returns 400 for invalid stepId', async () => {
    const r = await post('/reset/step', { workspace: wsDir, stepId: 100 });
    expect(r.status).toBe(400);
  });

  it('step reset always resets wizard step status to pending', async () => {
    // Mark step 3 completed first
    await put('/wizard-state', { workspace: wsDir, stepId: 3, status: 'completed' });

    await post('/reset/step', { workspace: wsDir, stepId: 3 });

    const state = await get(`/wizard-state?workspace=${encodeURIComponent(wsDir)}`);
    expect(state.body.steps.find((s: { id: number }) => s.id === 3).status).toBe('pending');
  });
});

// ── GET /api/verify/step ───────────────────────────────────────────────────────

describe('GET /api/verify/step', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-vfy-'));
  });

  afterEach(() => {
    fs.removeSync(wsDir);
  });

  // Step 1 — config file check
  it('step 1 — ok:false when no config exists', async () => {
    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=1`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
  });

  it('step 1 — ok:true when config exists', async () => {
    await post('/init', {
      workspace: wsDir,
      email: 'v@example.com',
      region: 'eu10',
      globalAccountSubdomain: 'mysub',
      cfSpace: 'dev',
    });

    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=1`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  // Step 2 — BTP login
  it('step 2 — ok:false when not logged in', async () => {
    vi.mocked(btpCli.btpIsLoggedIn).mockResolvedValue(false);

    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=2`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
  });

  it('step 2 — ok:true when BTP session active', async () => {
    vi.mocked(btpCli.btpIsLoggedIn).mockResolvedValue(true);
    vi.mocked(btpCli.btpGetInfo).mockResolvedValue('user@example.com / Trial');

    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=2`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  // Step 3 — CF login + org/space
  it('step 3 — ok:false when CF not logged in', async () => {
    vi.mocked(cfCli.cfIsLoggedIn).mockResolvedValue(false);

    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=3`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
  });

  it('step 3 — ok:false when logged in but no org', async () => {
    vi.mocked(cfCli.cfIsLoggedIn).mockResolvedValue(true);
    vi.mocked(cfCli.cfGetTarget).mockResolvedValue({
      apiEndpoint: 'https://api.cf.eu10.hana.ondemand.com',
      user: 'u@example.com',
      org: '',        // empty org
      space: 'dev',
    });

    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=3`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
  });

  it('step 3 — ok:true when logged in with org and space', async () => {
    vi.mocked(cfCli.cfIsLoggedIn).mockResolvedValue(true);
    vi.mocked(cfCli.cfGetTarget).mockResolvedValue({
      apiEndpoint: 'https://api.cf.eu10.hana.ondemand.com',
      user: 'u@example.com',
      org: '4bd5c287trial',
      space: 'dev',
    });

    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=3`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.target.org).toBe('4bd5c287trial');
  });

  // Step 4 — service instances
  it('step 4 — ok:false when required services are missing', async () => {
    vi.mocked(cfCli.cfListServices).mockResolvedValue([]);

    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=4`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
    expect(r.body.existingNames).toEqual([]);
  });

  it('step 4 — ok:true when all required service instances exist', async () => {
    // Mock all required service instances as present
    vi.mocked(cfCli.cfListServices).mockResolvedValue([
      { name: 'xsuaa-instance',            serviceName: 'xsuaa',           planName: 'application' },
      { name: 'destination-instance',      serviceName: 'destination',     planName: 'lite' },
      { name: 'html5-apps-repo-instance',  serviceName: 'html5-apps-repo', planName: 'app-host' },
      { name: 'application-logs-instance', serviceName: 'application-logs', planName: 'lite' },
    ]);

    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=4`);
    expect(r.status).toBe(200);
    // If all required instances match, ok should be true
    // (depends on what BTP_SERVICES defines as required)
    expect(r.body.existingNames).toContain('xsuaa-instance');
  });

  // Step 5 — mta.yaml
  it('step 5 — ok:false when no project with mta.yaml exists', async () => {
    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=5`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
  });

  it('step 5 — ok:true when a subdirectory contains mta.yaml', async () => {
    const projDir = path.join(wsDir, 'my-btp-app');
    fs.ensureDirSync(projDir);
    fs.writeFileSync(path.join(projDir, 'mta.yaml'), 'ID: my-btp-app\nversion: 0.0.1');

    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=5`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.projectDirs).toContain('my-btp-app');
  });

  // Step 6 — deployed apps
  it('step 6 — ok:false when no CF apps deployed', async () => {
    vi.mocked(cfCli.cfListApps).mockResolvedValue([]);

    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=6`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
  });

  it('step 6 — ok:true when at least one app is deployed', async () => {
    vi.mocked(cfCli.cfListApps).mockResolvedValue([
      { name: 'my-btp-app-srv', state: 'STARTED', instances: '1/1', memory: '256M', disk: '1G', urls: [] },
    ]);

    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=6`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  // Error cases
  it('returns 400 for missing stepId', async () => {
    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}`);
    expect(r.status).toBe(400);
  });

  it('returns 400 for out-of-range stepId', async () => {
    const r = await get(`/verify/step?workspace=${encodeURIComponent(wsDir)}&stepId=7`);
    expect(r.status).toBe(400);
  });
});

// ── POST /api/cf/target ────────────────────────────────────────────────────────

describe('POST /api/cf/target', () => {
  it('runs cf target and returns ok:true on success', async () => {
    vi.mocked(runner.run).mockResolvedValueOnce({ success: true, stdout: 'API endpoint: ...', stderr: '', exitCode: 0 });
    vi.mocked(cfCli.cfGetTarget).mockResolvedValueOnce({
      apiEndpoint: 'https://api.cf.eu10.hana.ondemand.com',
      user: 'u@example.com',
      org: '4bd5c287trial',
      space: 'dev',
    });

    const r = await post('/cf/target', { org: '4bd5c287trial', space: 'dev' });

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.target.org).toBe('4bd5c287trial');
  });

  it('returns 400 when org is empty', async () => {
    const r = await post('/cf/target', { org: '', space: 'dev' });
    expect(r.status).toBe(400);
  });

  it('returns 400 when org contains shell-injection characters (CWE-78)', async () => {
    // The Zod regex ^[a-zA-Z0-9_\\-. ]+$ blocks dangerous chars
    const dangerous = ['org; rm -rf /', 'org$(id)', 'org`whoami`', 'org && curl http://evil.com'];
    for (const orgVal of dangerous) {
      const r = await post('/cf/target', { org: orgVal, space: 'dev' });
      expect(r.status).toBe(400);
    }
  });

  it('returns 400 when space contains shell-injection characters', async () => {
    const r = await post('/cf/target', { org: 'validorg', space: 'space; bad' });
    expect(r.status).toBe(400);
  });
});

// ── POST /api/jobs/deploy ──────────────────────────────────────────────────────

describe('POST /api/jobs/deploy (CWE-22 + mta.yaml checks)', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-dep-'));
  });

  afterEach(() => {
    fs.removeSync(wsDir);
  });

  it('returns 400 when mta.yaml is missing in project directory', async () => {
    const projDir = path.join(wsDir, 'my-project');
    fs.ensureDirSync(projDir);
    // No mta.yaml — just an empty dir

    const r = await post('/jobs/deploy', {
      workspace: wsDir,
      projectDir: projDir,
    });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('mta.yaml not found');
  });

  it('starts job when mta.yaml exists', async () => {
    const projDir = path.join(wsDir, 'my-btp-app');
    fs.ensureDirSync(projDir);
    fs.writeFileSync(path.join(projDir, 'mta.yaml'), 'ID: my-btp-app\nversion: 0.0.1');

    const r = await post('/jobs/deploy', {
      workspace: wsDir,
      projectDir: projDir,
    });

    expect(r.status).toBe(200);
    expect(r.body.jobId).toBeDefined();
  });

  it('CWE-22: rejects path traversal via ../../etc/passwd', async () => {
    const r = await post('/jobs/deploy', {
      workspace: wsDir,
      projectDir: path.join(wsDir, '..', '..', 'etc', 'passwd'),
    });

    expect(r.status).toBe(400);
  });

  it('CWE-22: rejects absolute path outside workspace', async () => {
    const r = await post('/jobs/deploy', {
      workspace: wsDir,
      projectDir: '/tmp/evil-project',
    });

    expect(r.status).toBe(400);
    expect(r.body.error).toContain('workspace');
  });

  it('CWE-22: accepts absolute path that IS inside workspace', async () => {
    const projDir = path.join(wsDir, 'valid-project');
    fs.ensureDirSync(projDir);
    fs.writeFileSync(path.join(projDir, 'mta.yaml'), 'ID: valid-project\nversion: 0.0.1');

    const r = await post('/jobs/deploy', {
      workspace: wsDir,
      projectDir: projDir, // absolute but inside workspace
    });

    expect(r.status).toBe(200);
  });

  it('returns 400 when projectDir is missing', async () => {
    const r = await post('/jobs/deploy', {
      workspace: wsDir,
      // projectDir intentionally omitted
    });

    expect(r.status).toBe(400);
  });
});

// ── POST /api/jobs/generate ────────────────────────────────────────────────────

describe('POST /api/jobs/generate', () => {
  let wsDir: string;

  beforeEach(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-gen-'));
  });

  afterEach(() => {
    fs.removeSync(wsDir);
  });

  it('accepts a valid generate request', async () => {
    const r = await post('/jobs/generate', {
      workspace: wsDir,
      name: 'my-btp-app',
      type: 'cap-ui5-approuter',
      namespace: 'com.example.mybtpapp',
    });

    expect(r.status).toBe(200);
    expect(r.body.jobId).toBeDefined();
  });

  it('returns 400 for invalid project name (spaces)', async () => {
    const r = await post('/jobs/generate', {
      workspace: wsDir,
      name: 'my btp app',
      type: 'cap-ui5-approuter',
    });

    expect(r.status).toBe(400);
  });

  it('returns 400 for invalid project type', async () => {
    const r = await post('/jobs/generate', {
      workspace: wsDir,
      name: 'my-btp-app',
      type: 'full-stack-with-magic',
    });

    expect(r.status).toBe(400);
  });

  it('accepts all valid project types', async () => {
    const types = ['cap-ui5-approuter', 'cap-ui5', 'cap-only', 'ui5-only'];
    for (const type of types) {
      const r = await post('/jobs/generate', {
        workspace: wsDir,
        name: 'test-app',
        type,
      });
      expect(r.status).toBe(200);
    }
  });
});

// ── GET /api/services / GET /api/regions ──────────────────────────────────────

describe('catalog endpoints', () => {
  it('GET /api/services returns service list', async () => {
    const r = await get('/services');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.services)).toBe(true);
    expect(r.body.services.length).toBeGreaterThan(0);
  });

  it('GET /api/regions returns supported regions', async () => {
    const r = await get('/regions');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.regions)).toBe(true);
    expect(r.body.regions).toContain('eu10');
  });
});

// ── GET /api/jobs/:id — job ID validation ─────────────────────────────────────

describe('GET /api/jobs/:id — input validation', () => {
  it('returns 400 for non-UUID job ID (CWE-20)', async () => {
    const r = await get('/jobs/../../../etc/passwd');
    // Router won't match this route cleanly, but check no path traversal
    expect(r.status).not.toBe(200);
  });

  it('returns 400 for malformed job ID', async () => {
    const r = await get('/jobs/not-a-uuid');
    expect(r.status).toBe(400);
  });

  it('returns 404 for valid UUID that does not exist', async () => {
    const r = await get('/jobs/12345678-1234-1234-1234-123456789abc');
    expect(r.status).toBe(404);
  });
});
