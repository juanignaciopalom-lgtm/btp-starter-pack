/**
 * Comprehensive tests for src/ui-server/wizard-state.ts
 *
 * Covers:
 * - readWizardState: fresh state, persisted state, corrupt file recovery
 * - writeWizardState: persists data, validates schema
 * - updateStepStatus: status transitions, no auto-advance, extras (errorMessage, note)
 * - resetWizardState: full reset
 * - resetStepStatus: per-step reset, other steps untouched
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import {
  readWizardState,
  writeWizardState,
  updateStepStatus,
  resetWizardState,
  resetStepStatus,
  WIZARD_STATE_FILE,
  TOTAL_STEPS,
  STEP_NAMES,
} from '../../src/ui-server/wizard-state';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-wiz-'));
});

afterEach(() => {
  fs.removeSync(tempDir);
});

// ── readWizardState ────────────────────────────────────────────────────────────

describe('readWizardState', () => {
  it('returns a fresh state with 6 pending steps when no file exists', () => {
    const state = readWizardState(tempDir);

    expect(state.currentStep).toBe(1);
    expect(state.steps).toHaveLength(TOTAL_STEPS);
    state.steps.forEach((s, i) => {
      expect(s.id).toBe(i + 1);
      expect(s.status).toBe('pending');
    });
  });

  it('returns persisted state when the file exists', () => {
    // Write a state directly
    const filePath = path.join(tempDir, WIZARD_STATE_FILE);
    fs.writeJsonSync(filePath, {
      currentStep: 3,
      steps: Array.from({ length: TOTAL_STEPS }, (_, i) => ({
        id: i + 1,
        status: i < 2 ? 'completed' : 'pending',
      })),
      lastActiveAt: new Date().toISOString(),
    });

    const state = readWizardState(tempDir);

    expect(state.currentStep).toBe(3);
    expect(state.steps[0].status).toBe('completed');
    expect(state.steps[1].status).toBe('completed');
    expect(state.steps[2].status).toBe('pending');
  });

  it('falls back to a fresh state when the JSON file is corrupt', () => {
    const filePath = path.join(tempDir, WIZARD_STATE_FILE);
    fs.writeFileSync(filePath, '{ this is not valid json >>>');

    const state = readWizardState(tempDir);

    expect(state.currentStep).toBe(1);
    expect(state.steps).toHaveLength(TOTAL_STEPS);
  });

  it('falls back to fresh state when the file contains invalid schema', () => {
    const filePath = path.join(tempDir, WIZARD_STATE_FILE);
    fs.writeJsonSync(filePath, {
      currentStep: 999, // out of range
      steps: [],        // wrong length
    });

    const state = readWizardState(tempDir);

    // Schema parse should fail and return fresh defaults
    expect(state.currentStep).toBeGreaterThanOrEqual(1);
    expect(state.currentStep).toBeLessThanOrEqual(TOTAL_STEPS);
  });

  it('resolves the path correctly — does not require trailing slash', () => {
    const filePath = path.join(tempDir, WIZARD_STATE_FILE);
    fs.writeJsonSync(filePath, {
      currentStep: 2,
      steps: Array.from({ length: TOTAL_STEPS }, (_, i) => ({
        id: i + 1, status: 'pending',
      })),
      lastActiveAt: new Date().toISOString(),
    });

    // With trailing slash
    const withSlash = readWizardState(tempDir + path.sep);
    expect(withSlash.currentStep).toBe(2);

    // Without trailing slash
    const withoutSlash = readWizardState(tempDir);
    expect(withoutSlash.currentStep).toBe(2);
  });
});

// ── writeWizardState ───────────────────────────────────────────────────────────

describe('writeWizardState', () => {
  it('persists state to disk and can be read back', () => {
    const initial = readWizardState(tempDir);
    initial.currentStep = 4;
    initial.steps[3].status = 'running';

    writeWizardState(initial, tempDir);

    const restored = readWizardState(tempDir);
    expect(restored.currentStep).toBe(4);
    expect(restored.steps[3].status).toBe('running');
  });

  it('updates lastActiveAt on write', () => {
    const before = Date.now();
    const state = readWizardState(tempDir);
    writeWizardState(state, tempDir);
    const after = Date.now();

    const restored = readWizardState(tempDir);
    const ts = new Date(restored.lastActiveAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 100);
  });

  it('creates the directory if it does not exist', () => {
    const nested = path.join(tempDir, 'a', 'b', 'c');
    const state = readWizardState(tempDir);
    writeWizardState(state, nested);

    expect(fs.existsSync(path.join(nested, WIZARD_STATE_FILE))).toBe(true);
  });
});

// ── updateStepStatus ───────────────────────────────────────────────────────────

describe('updateStepStatus', () => {
  it('marks a step as completed', () => {
    const updated = updateStepStatus(tempDir, 2, 'completed');

    const step2 = updated.steps.find((s) => s.id === 2)!;
    expect(step2.status).toBe('completed');
    expect(step2.completedAt).toBeDefined();
  });

  it('marks a step as error with a message', () => {
    const updated = updateStepStatus(tempDir, 3, 'error', { errorMessage: 'CF login timed out' });

    const step3 = updated.steps.find((s) => s.id === 3)!;
    expect(step3.status).toBe('error');
    expect(step3.errorMessage).toBe('CF login timed out');
  });

  it('clears errorMessage when transitioning to non-error status', () => {
    // First set to error
    updateStepStatus(tempDir, 1, 'error', { errorMessage: 'bad' });

    // Then set back to running
    const updated = updateStepStatus(tempDir, 1, 'running');
    const step1 = updated.steps.find((s) => s.id === 1)!;
    expect(step1.errorMessage).toBeUndefined();
  });

  it('stores an optional note', () => {
    const updated = updateStepStatus(tempDir, 5, 'completed', { note: 'Generated cap-ui5-approuter' });

    const step5 = updated.steps.find((s) => s.id === 5)!;
    expect(step5.note).toBe('Generated cap-ui5-approuter');
  });

  it('NEVER auto-advances currentStep when a step completes', () => {
    // currentStep starts at 1
    const initial = readWizardState(tempDir);
    expect(initial.currentStep).toBe(1);

    // Complete step 1
    const after = updateStepStatus(tempDir, 1, 'completed');

    // currentStep must remain 1 — auto-advance was intentionally removed
    expect(after.currentStep).toBe(1);
  });

  it('NEVER auto-advances even when completing the currentStep', () => {
    // Set currentStep to 3
    const state = readWizardState(tempDir);
    state.currentStep = 3;
    writeWizardState(state, tempDir);

    // Complete step 3
    const updated = updateStepStatus(tempDir, 3, 'completed');

    // currentStep must remain 3 — not jump to 4
    expect(updated.currentStep).toBe(3);
  });

  it('only updates the targeted step; other steps stay unchanged', () => {
    // Pre-mark steps 1 and 2 as completed
    updateStepStatus(tempDir, 1, 'completed');
    updateStepStatus(tempDir, 2, 'completed');

    // Now update step 3 to running
    const updated = updateStepStatus(tempDir, 3, 'running');

    expect(updated.steps.find((s) => s.id === 1)!.status).toBe('completed');
    expect(updated.steps.find((s) => s.id === 2)!.status).toBe('completed');
    expect(updated.steps.find((s) => s.id === 3)!.status).toBe('running');
    expect(updated.steps.find((s) => s.id === 4)!.status).toBe('pending');
  });

  it('persists changes to disk', () => {
    updateStepStatus(tempDir, 6, 'completed');

    // Read fresh from disk
    const fresh = readWizardState(tempDir);
    expect(fresh.steps.find((s) => s.id === 6)!.status).toBe('completed');
  });
});

// ── resetWizardState ───────────────────────────────────────────────────────────

describe('resetWizardState', () => {
  it('resets all steps to pending and currentStep to 1', () => {
    // Dirty the state first
    updateStepStatus(tempDir, 1, 'completed');
    updateStepStatus(tempDir, 2, 'completed');
    const dirty = readWizardState(tempDir);
    expect(dirty.steps[0].status).toBe('completed');

    // Full reset
    const fresh = resetWizardState(tempDir);

    expect(fresh.currentStep).toBe(1);
    fresh.steps.forEach((s) => {
      expect(s.status).toBe('pending');
      expect(s.completedAt).toBeUndefined();
      expect(s.errorMessage).toBeUndefined();
    });
  });

  it('persists the reset to disk', () => {
    updateStepStatus(tempDir, 4, 'completed');
    resetWizardState(tempDir);

    const fromDisk = readWizardState(tempDir);
    expect(fromDisk.steps[3].status).toBe('pending');
  });
});

// ── resetStepStatus ────────────────────────────────────────────────────────────

describe('resetStepStatus', () => {
  it('resets only the specified step to pending', () => {
    // Complete steps 1, 2, 3
    updateStepStatus(tempDir, 1, 'completed');
    updateStepStatus(tempDir, 2, 'completed');
    updateStepStatus(tempDir, 3, 'completed');

    // Reset step 2 only
    const updated = resetStepStatus(tempDir, 2);

    expect(updated.steps.find((s) => s.id === 1)!.status).toBe('completed');
    expect(updated.steps.find((s) => s.id === 2)!.status).toBe('pending');
    expect(updated.steps.find((s) => s.id === 3)!.status).toBe('completed');
  });

  it('does not change currentStep', () => {
    const state = readWizardState(tempDir);
    state.currentStep = 5;
    writeWizardState(state, tempDir);
    updateStepStatus(tempDir, 5, 'completed');

    const after = resetStepStatus(tempDir, 5);
    expect(after.currentStep).toBe(5);
  });

  it('clears completedAt and errorMessage on reset', () => {
    updateStepStatus(tempDir, 4, 'completed');
    const before = readWizardState(tempDir);
    expect(before.steps[3].completedAt).toBeDefined();

    const after = resetStepStatus(tempDir, 4);
    expect(after.steps[3].completedAt).toBeUndefined();
    expect(after.steps[3].errorMessage).toBeUndefined();
  });

  it('persists the single-step reset to disk', () => {
    updateStepStatus(tempDir, 3, 'completed');
    resetStepStatus(tempDir, 3);

    const fromDisk = readWizardState(tempDir);
    expect(fromDisk.steps[2].status).toBe('pending');
  });

  it('handles resetting a step that is already pending (no-op)', () => {
    const initial = readWizardState(tempDir);
    expect(initial.steps[0].status).toBe('pending');

    // Resetting an already-pending step should not throw
    const after = resetStepStatus(tempDir, 1);
    expect(after.steps[0].status).toBe('pending');
  });
});

// ── Constants ──────────────────────────────────────────────────────────────────

describe('STEP_NAMES and TOTAL_STEPS', () => {
  it('defines exactly 6 steps', () => {
    expect(TOTAL_STEPS).toBe(6);
    expect(Object.keys(STEP_NAMES)).toHaveLength(6);
  });

  it('step names cover IDs 1–6', () => {
    for (let i = 1; i <= 6; i++) {
      expect(STEP_NAMES[i]).toBeDefined();
      expect(typeof STEP_NAMES[i]).toBe('string');
    }
  });
});
