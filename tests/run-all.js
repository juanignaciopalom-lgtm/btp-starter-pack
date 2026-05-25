/**
 * Standalone test runner for btp-starter-pack.
 *
 * Runs against the compiled dist/ output — no vitest/ESM dependency.
 * Execute after `npm run build`:
 *
 *   NODE_PATH=./node_modules node tests/run-all.js
 *
 * Covers:
 *   - wizard-state.ts: readWizardState, writeWizardState, updateStepStatus,
 *     resetWizardState, resetStepStatus
 *   - API routes: POST /api/init (cfOrg), GET/PUT /api/wizard-state,
 *     POST /api/wizard-state/reset, POST /api/reset/step (CWE-22),
 *     GET /api/verify/step, POST /api/cf/target (CWE-78),
 *     POST /api/jobs/deploy (CWE-22 + mta.yaml), POST /api/jobs/generate,
 *     GET /api/jobs/:id validation
 */
'use strict';

// ── Cross-platform NODE_PATH setup ────────────────────────────────────────────
// Ensures require('fs-extra') etc. resolve correctly on Windows (PowerShell/CMD)
// where the caller cannot set NODE_PATH inline as on Unix.
const Module = require('module');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
process.env.NODE_PATH = path.join(ROOT, 'node_modules');
Module._initPaths();
// ─────────────────────────────────────────────────────────────────────────────

const http = require('http');
const fs   = require('fs-extra');
const os   = require('os');

// ── Assertion helper ──────────────────────────────────────────────────────────
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── Simple test runner ────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const errors = [];

async function test(name, fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-t-'));
  try {
    await fn(tempDir);
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    failed++;
    errors.push({ name, message: e.message });
  } finally {
    fs.removeSync(tempDir);
  }
}

// ── HTTP helpers (using compiled Express app) ─────────────────────────────────
let baseUrl;

async function api(method, urlPath, body) {
  const url = `${baseUrl}/api${urlPath}`;
  const options = { method, headers: { 'Content-Type': 'application/json', 'Connection': 'close' } };
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

const get  = (p)    => api('GET',  p);
const post = (p, b) => api('POST', p, b);
const put  = (p, b) => api('PUT',  p, b);

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — wizard-state.ts (pure functions)
// ═══════════════════════════════════════════════════════════════════════════════
async function runWizardStateTests() {
  const {
    readWizardState, writeWizardState,
    updateStepStatus, resetWizardState, resetStepStatus,
    WIZARD_STATE_FILE, TOTAL_STEPS, STEP_NAMES,
  } = require(path.join(ROOT, 'dist/ui-server/wizard-state'));

  console.log('\n▶ wizard-state.ts');

  await test('fresh state: currentStep=1, all 6 steps pending', (d) => {
    const s = readWizardState(d);
    assert(s.currentStep === 1, `currentStep=${s.currentStep}`);
    assert(s.steps.length === TOTAL_STEPS, `steps.length=${s.steps.length}`);
    s.steps.forEach(st => assert(st.status === 'pending', `step ${st.id} not pending`));
  });

  await test('persists and restores state', (d) => {
    const s = readWizardState(d);
    s.currentStep = 4;
    s.steps[3].status = 'running';
    writeWizardState(s, d);
    const r = readWizardState(d);
    assert(r.currentStep === 4, `currentStep=${r.currentStep}`);
    assert(r.steps[3].status === 'running', `step 4 status=${r.steps[3].status}`);
  });

  await test('corrupt JSON falls back to fresh state', (d) => {
    fs.writeFileSync(path.join(d, WIZARD_STATE_FILE), '{bad json');
    const s = readWizardState(d);
    assert(s.currentStep === 1, 'should be 1');
  });

  await test('updateStepStatus: marks step completed with completedAt', (d) => {
    const u = updateStepStatus(d, 2, 'completed');
    const s2 = u.steps.find(s => s.id === 2);
    assert(s2.status === 'completed', 'status should be completed');
    assert(s2.completedAt, 'completedAt should be set');
  });

  await test('updateStepStatus: stores errorMessage', (d) => {
    const u = updateStepStatus(d, 3, 'error', { errorMessage: 'CF login timed out' });
    assert(u.steps.find(s=>s.id===3).errorMessage === 'CF login timed out', 'errorMessage not set');
  });

  await test('updateStepStatus: clears errorMessage on non-error transition', (d) => {
    updateStepStatus(d, 1, 'error', { errorMessage: 'bad' });
    const u = updateStepStatus(d, 1, 'running');
    assert(!u.steps.find(s=>s.id===1).errorMessage, 'errorMessage should be cleared');
  });

  await test('CRITICAL: updateStepStatus NEVER auto-advances currentStep', (d) => {
    const before = readWizardState(d);
    assert(before.currentStep === 1, 'initial currentStep should be 1');
    const after = updateStepStatus(d, 1, 'completed');
    assert(after.currentStep === 1,
      `REGRESSION: currentStep auto-advanced to ${after.currentStep}`);
  });

  await test('CRITICAL: no auto-advance even when completing currentStep (step 3)', (d) => {
    const s = readWizardState(d);
    s.currentStep = 3;
    writeWizardState(s, d);
    const after = updateStepStatus(d, 3, 'completed');
    assert(after.currentStep === 3,
      `REGRESSION: currentStep jumped to ${after.currentStep}`);
  });

  await test('updateStepStatus: only updates targeted step', (d) => {
    updateStepStatus(d, 1, 'completed');
    updateStepStatus(d, 2, 'completed');
    const u = updateStepStatus(d, 3, 'running');
    assert(u.steps.find(s=>s.id===1).status === 'completed', 'step 1 should remain completed');
    assert(u.steps.find(s=>s.id===2).status === 'completed', 'step 2 should remain completed');
    assert(u.steps.find(s=>s.id===3).status === 'running', 'step 3 should be running');
    assert(u.steps.find(s=>s.id===4).status === 'pending', 'step 4 should remain pending');
  });

  await test('resetWizardState: all steps to pending, currentStep to 1', (d) => {
    updateStepStatus(d, 1, 'completed');
    updateStepStatus(d, 2, 'completed');
    const f = resetWizardState(d);
    assert(f.currentStep === 1, `currentStep=${f.currentStep}`);
    f.steps.forEach(s => assert(s.status === 'pending', `step ${s.id} not pending`));
  });

  await test('resetStepStatus: resets only the specified step', (d) => {
    updateStepStatus(d, 1, 'completed');
    updateStepStatus(d, 2, 'completed');
    updateStepStatus(d, 3, 'completed');
    const u = resetStepStatus(d, 2);
    assert(u.steps.find(s=>s.id===1).status === 'completed', 'step 1 should remain completed');
    assert(u.steps.find(s=>s.id===2).status === 'pending', 'step 2 should be pending');
    assert(u.steps.find(s=>s.id===3).status === 'completed', 'step 3 should remain completed');
  });

  await test('resetStepStatus: does not change currentStep', (d) => {
    const s = readWizardState(d);
    s.currentStep = 5;
    writeWizardState(s, d);
    updateStepStatus(d, 5, 'completed');
    const u = resetStepStatus(d, 5);
    assert(u.currentStep === 5, `currentStep=${u.currentStep}`);
  });

  await test('resetStepStatus: clears completedAt', (d) => {
    updateStepStatus(d, 4, 'completed');
    const u = resetStepStatus(d, 4);
    assert(!u.steps[3].completedAt, 'completedAt should be cleared');
  });

  await test('resetStepStatus: no-op on already-pending step', (d) => {
    const u = resetStepStatus(d, 1);
    assert(u.steps[0].status === 'pending', 'step 1 should remain pending');
  });

  await test('TOTAL_STEPS is 6', () => {
    assert(TOTAL_STEPS === 6, `TOTAL_STEPS=${TOTAL_STEPS}`);
  });

  await test('STEP_NAMES covers IDs 1–6', () => {
    for (let i = 1; i <= 6; i++) {
      assert(STEP_NAMES[i] && typeof STEP_NAMES[i] === 'string',
        `STEP_NAMES[${i}] missing`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 2 — API routes (via compiled Express server)
// ═══════════════════════════════════════════════════════════════════════════════
async function runApiTests() {
  const { createApp } = require(path.join(ROOT, 'dist/ui-server/server'));
  const app    = createApp();
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  console.log(`\n▶ API routes (${baseUrl})`);

  try {
    await test('GET /api/health returns ok', async () => {
      const r = await get('/health');
      assert(r.status === 200, `status=${r.status}`);
      assert(r.body.status === 'ok', `body.status=${r.body.status}`);
    });

    // cfOrg construction
    await test('POST /api/init: cfOrg = globalAccountSubdomain (no trial doubling)', async (d) => {
      const r = await post('/init', {
        workspace: d, email: 'a@b.com', region: 'eu10',
        globalAccountSubdomain: '4bd5c287trial', cfSpace: 'dev'
      });
      assert(r.status === 200, `status=${r.status}: ${JSON.stringify(r.body)}`);
      assert(r.body.config.cfOrg === '4bd5c287trial',
        `cfOrg='${r.body.config.cfOrg}' should be '4bd5c287trial'`);
      assert(!r.body.config.cfOrg.includes('trialtrial'),
        `cfOrg must not contain 'trialtrial'`);
    });

    await test('POST /api/init: cfOrg works for non-trial subdomains', async (d) => {
      const r = await post('/init', {
        workspace: d, email: 'b@c.com', region: 'us10',
        globalAccountSubdomain: 'mycompany', cfSpace: 'dev'
      });
      assert(r.status === 200, `status=${r.status}`);
      assert(r.body.config.cfOrg === 'mycompany', `cfOrg='${r.body.config.cfOrg}'`);
    });

    await test('POST /api/init: 400 for invalid email', async (d) => {
      const r = await post('/init', { workspace: d, email: 'notanemail', region: 'eu10', globalAccountSubdomain: 'sub', cfSpace: 'dev' });
      assert(r.status === 400, `status=${r.status}`);
    });

    await test('POST /api/init: 400 for unknown region', async (d) => {
      const r = await post('/init', { workspace: d, email: 'a@b.com', region: 'zz99', globalAccountSubdomain: 'sub', cfSpace: 'dev' });
      assert(r.status === 400, `status=${r.status}`);
    });

    await test('POST /api/init: 400 when subdomain is missing', async (d) => {
      const r = await post('/init', { workspace: d, email: 'a@b.com', region: 'eu10', cfSpace: 'dev' });
      assert(r.status === 400, `status=${r.status}`);
    });

    await test('GET /api/config: exists:false when no config', async (d) => {
      const r = await get(`/config?workspace=${encodeURIComponent(d)}`);
      assert(r.status === 200 && r.body.exists === false, `exists=${r.body.exists}`);
    });

    await test('GET /api/config: exists:true after init', async (d) => {
      await post('/init', { workspace: d, email: 'x@y.com', region: 'eu10', globalAccountSubdomain: 'abc', cfSpace: 'dev' });
      const r = await get(`/config?workspace=${encodeURIComponent(d)}`);
      assert(r.status === 200 && r.body.exists === true, `exists=${r.body.exists}`);
    });

    await test('GET /api/wizard-state: fresh 6-step state with stepNames', async (d) => {
      const r = await get(`/wizard-state?workspace=${encodeURIComponent(d)}`);
      assert(r.status === 200, `status=${r.status}`);
      assert(r.body.steps.length === 6, `steps.length=${r.body.steps.length}`);
      assert(r.body.stepNames, 'stepNames should be present');
      assert(r.body.totalSteps === 6, 'totalSteps should be 6');
    });

    await test('PUT /api/wizard-state: updates step status', async (d) => {
      const r = await put('/wizard-state', { workspace: d, stepId: 2, status: 'completed' });
      assert(r.status === 200, `status=${r.status}`);
      assert(r.body.steps.find(s => s.id === 2).status === 'completed', 'step 2 not completed');
    });

    await test('CRITICAL: PUT /api/wizard-state does NOT auto-advance currentStep', async (d) => {
      const before = await get(`/wizard-state?workspace=${encodeURIComponent(d)}`);
      const orig = before.body.currentStep;
      await put('/wizard-state', { workspace: d, stepId: orig, status: 'completed' });
      const after = await get(`/wizard-state?workspace=${encodeURIComponent(d)}`);
      assert(after.body.currentStep === orig,
        `REGRESSION: currentStep jumped from ${orig} to ${after.body.currentStep}`);
    });

    await test('PUT /api/wizard-state: 400 for invalid stepId', async (d) => {
      const r = await put('/wizard-state', { workspace: d, stepId: 99, status: 'completed' });
      assert(r.status === 400, `status=${r.status}`);
    });

    await test('POST /api/wizard-state/reset: resets all steps', async (d) => {
      await put('/wizard-state', { workspace: d, stepId: 3, status: 'completed' });
      const r = await post('/wizard-state/reset', { workspace: d });
      assert(r.status === 200, `status=${r.status}`);
      r.body.steps.forEach(s => assert(s.status === 'pending', `step ${s.id} not pending after reset`));
    });

    // reset/step
    await test('POST /api/reset/step 1: deletes .btp-starter.json', async (d) => {
      fs.writeJsonSync(path.join(d, '.btp-starter.json'), { v: 1 });
      const r = await post('/reset/step', { workspace: d, stepId: 1 });
      assert(r.status === 200, `status=${r.status}`);
      assert(r.body.actions.some(a => a.includes('Deleted .btp-starter.json')),
        `actions=${JSON.stringify(r.body.actions)}`);
      assert(!fs.existsSync(path.join(d, '.btp-starter.json')), 'file should be gone');
    });

    await test('POST /api/reset/step 5 CWE-22: rejects /etc/passwd', async (d) => {
      const r = await post('/reset/step', { workspace: d, stepId: 5, projectDir: '/etc/passwd' });
      assert(r.status === 400, `status=${r.status}`);
      assert(r.body.error && r.body.error.includes('workspace'), `error=${r.body.error}`);
    });

    await test('POST /api/reset/step 5: deletes project dir within workspace', async (d) => {
      const proj = path.join(d, 'my-proj');
      fs.ensureDirSync(proj);
      fs.writeFileSync(path.join(proj, 'mta.yaml'), 'ID: x');
      const r = await post('/reset/step', { workspace: d, stepId: 5, projectDir: proj });
      assert(r.status === 200, `status=${r.status}`);
      assert(!fs.existsSync(proj), 'proj dir should be deleted');
    });

    await test('POST /api/reset/step: 400 for stepId 0', async (d) => {
      const r = await post('/reset/step', { workspace: d, stepId: 0 });
      assert(r.status === 400, `status=${r.status}`);
    });

    // verify/step
    await test('GET /api/verify/step 1: ok:false when no config', async (d) => {
      const r = await get(`/verify/step?workspace=${encodeURIComponent(d)}&stepId=1`);
      assert(r.status === 200 && r.body.ok === false, `ok=${r.body.ok}`);
    });

    await test('GET /api/verify/step 1: ok:true after init', async (d) => {
      await post('/init', { workspace: d, email: 'v@x.com', region: 'eu10', globalAccountSubdomain: 'sub', cfSpace: 'dev' });
      const r = await get(`/verify/step?workspace=${encodeURIComponent(d)}&stepId=1`);
      assert(r.status === 200 && r.body.ok === true, `ok=${r.body.ok}`);
    });

    await test('GET /api/verify/step 5: ok:false when no mta.yaml project', async (d) => {
      const r = await get(`/verify/step?workspace=${encodeURIComponent(d)}&stepId=5`);
      assert(r.status === 200 && r.body.ok === false, `ok=${r.body.ok}`);
    });

    await test('GET /api/verify/step 5: ok:true when subdirectory has mta.yaml', async (d) => {
      const proj = path.join(d, 'my-btp-app');
      fs.ensureDirSync(proj);
      fs.writeFileSync(path.join(proj, 'mta.yaml'), 'ID: x\nversion: 0.0.1');
      const r = await get(`/verify/step?workspace=${encodeURIComponent(d)}&stepId=5`);
      assert(r.status === 200 && r.body.ok === true, `ok=${r.body.ok}`);
      assert(r.body.projectDirs && r.body.projectDirs.includes('my-btp-app'),
        `projectDirs=${JSON.stringify(r.body.projectDirs)}`);
    });

    await test('GET /api/verify/step: 400 for missing stepId', async (d) => {
      const r = await get(`/verify/step?workspace=${encodeURIComponent(d)}`);
      assert(r.status === 400, `status=${r.status}`);
    });

    await test('GET /api/verify/step: 400 for stepId=7', async (d) => {
      const r = await get(`/verify/step?workspace=${encodeURIComponent(d)}&stepId=7`);
      assert(r.status === 400, `status=${r.status}`);
    });

    // cf/target CWE-78
    await test('POST /api/cf/target: 400 for shell-injection in org (CWE-78)', async (d) => {
      for (const orgVal of ['org; rm -rf /', 'org$(id)', 'org`whoami`']) {
        const r = await post('/cf/target', { org: orgVal, space: 'dev' });
        assert(r.status === 400, `org='${orgVal}' should be 400, got ${r.status}`);
      }
    });

    await test('POST /api/cf/target: 400 for empty org', async (d) => {
      const r = await post('/cf/target', { org: '', space: 'dev' });
      assert(r.status === 400, `status=${r.status}`);
    });

    // jobs/deploy CWE-22 + mta.yaml
    await test('POST /api/jobs/deploy: 400 when mta.yaml missing', async (d) => {
      const proj = path.join(d, 'no-mta');
      fs.ensureDirSync(proj);
      const r = await post('/jobs/deploy', { workspace: d, projectDir: proj });
      assert(r.status === 400, `status=${r.status}`);
      assert(r.body.error && r.body.error.includes('mta.yaml'), `error=${r.body.error}`);
    });

    await test('POST /api/jobs/deploy CWE-22: rejects /etc/passwd', async (d) => {
      const r = await post('/jobs/deploy', { workspace: d, projectDir: '/etc/passwd' });
      assert(r.status === 400, `status=${r.status}`);
      assert(r.body.error && r.body.error.includes('workspace'), `error=${r.body.error}`);
    });

    await test('POST /api/jobs/deploy CWE-22: rejects ../../outside path', async (d) => {
      const evil = path.join(d, '..', '..', 'tmp', 'evil');
      const r = await post('/jobs/deploy', { workspace: d, projectDir: evil });
      assert(r.status === 400, `status=${r.status}`);
    });

    await test('POST /api/jobs/deploy: 400 when projectDir missing', async (d) => {
      const r = await post('/jobs/deploy', { workspace: d });
      assert(r.status === 400, `status=${r.status}`);
    });

    // jobs/generate validation
    await test('POST /api/jobs/generate: 400 for name with spaces', async (d) => {
      const r = await post('/jobs/generate', { workspace: d, name: 'my btp app', type: 'cap-ui5-approuter' });
      assert(r.status === 400, `status=${r.status}`);
    });

    await test('POST /api/jobs/generate: 400 for unknown type', async (d) => {
      const r = await post('/jobs/generate', { workspace: d, name: 'valid-name', type: 'full-magic' });
      assert(r.status === 400, `status=${r.status}`);
    });

    // catalog endpoints
    await test('GET /api/services: returns service list', async () => {
      const r = await get('/services');
      assert(r.status === 200, `status=${r.status}`);
      assert(Array.isArray(r.body.services) && r.body.services.length > 0, 'should have services');
    });

    await test('GET /api/regions: includes eu10', async () => {
      const r = await get('/regions');
      assert(r.status === 200, `status=${r.status}`);
      assert(r.body.regions.includes('eu10'), 'should include eu10');
    });

    // job ID validation
    await test('GET /api/jobs/:id: 400 for non-UUID', async () => {
      const r = await get('/jobs/not-a-uuid');
      assert(r.status === 400, `status=${r.status}`);
    });

    await test('GET /api/jobs/:id: 404 for valid UUID that does not exist', async () => {
      const r = await get('/jobs/12345678-1234-1234-1234-123456789abc');
      assert(r.status === 404, `status=${r.status}`);
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

// ── Run all suites ────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     btp-starter-pack — Test Suite                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  await runWizardStateTests();
  await runApiTests();

  const total = passed + failed;
  console.log(`\n${'═'.repeat(54)}`);
  console.log(`  ${passed}/${total} passed   ${failed > 0 ? `${failed} FAILED` : 'all green ✓'}`);
  console.log('═'.repeat(54));

  if (errors.length) {
    console.log('\nFailed tests:');
    errors.forEach(e => console.error(`  ✗ ${e.name}\n    ${e.message}`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nTest runner error:', err);
  process.exit(1);
});
