/**
 * Wizard state persistence — tracks progress across UI sessions.
 *
 * Security:
 * - CWE-22: file path is resolved from workspaceDir, never from user input.
 * - No credentials stored in wizard state.
 */

import path from 'path';
import fs from 'fs-extra';
import { z } from 'zod';

export const WIZARD_STATE_FILE = '.btp-wizard.json';

export const STEP_NAMES: Record<number, string> = {
  1: 'Prerequisites',
  2: 'BTP Login',
  3: 'CF Login',
  4: 'Service Setup',
  5: 'Generate Project',
  6: 'Deploy to CF',
};

export const TOTAL_STEPS = 6;

const StepStatusSchema = z.enum(['pending', 'running', 'completed', 'error', 'skipped']);
export type StepStatus = z.infer<typeof StepStatusSchema>;

const StepStateSchema = z.object({
  id: z.number(),
  status: StepStatusSchema.default('pending'),
  completedAt: z.string().optional(),
  errorMessage: z.string().optional(),
  note: z.string().optional(),
});

export type StepState = z.infer<typeof StepStateSchema>;

const WizardStateSchema = z.object({
  currentStep: z.number().min(1).max(TOTAL_STEPS).default(1),
  steps: z
    .array(StepStateSchema)
    .default(() =>
      Array.from({ length: TOTAL_STEPS }, (_, i) => ({ id: i + 1, status: 'pending' as StepStatus }))
    ),
  lastActiveAt: z.string().default(() => new Date().toISOString()),
  workspaceDir: z.string().optional(),
});

export type WizardState = z.infer<typeof WizardStateSchema>;

function resolveWizardPath(workspaceDir: string): string {
  // CWE-22: normalize path — never allow traversal
  return path.join(path.resolve(workspaceDir), WIZARD_STATE_FILE);
}

export function readWizardState(workspaceDir: string): WizardState {
  const filePath = resolveWizardPath(workspaceDir);

  if (!fs.existsSync(filePath)) {
    return WizardStateSchema.parse({});
  }

  try {
    const raw = fs.readJsonSync(filePath) as unknown;
    const result = WizardStateSchema.safeParse(raw);
    if (!result.success) return WizardStateSchema.parse({});
    return result.data;
  } catch {
    return WizardStateSchema.parse({});
  }
}

export function writeWizardState(state: WizardState, workspaceDir: string): void {
  const filePath = resolveWizardPath(workspaceDir);
  const validated = WizardStateSchema.parse({
    ...state,
    lastActiveAt: new Date().toISOString(),
  });
  fs.ensureDirSync(path.dirname(filePath));
  fs.writeJsonSync(filePath, validated, { spaces: 2 });
}

export function updateStepStatus(
  workspaceDir: string,
  stepId: number,
  status: StepStatus,
  extras?: { errorMessage?: string; note?: string }
): WizardState {
  const state = readWizardState(workspaceDir);

  const steps = state.steps.map((s) => {
    if (s.id !== stepId) return s;
    return {
      ...s,
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : s.completedAt,
      errorMessage: extras?.errorMessage ?? (status !== 'error' ? undefined : s.errorMessage),
      note: extras?.note ?? s.note,
    };
  });

  // Never auto-advance currentStep — only goToStep / explicit navigation should
  // change the active step. Auto-advancing jumps past steps without user action
  // and creates false "completed" states when the wizard restores from disk.
  const updated: WizardState = { ...state, steps, currentStep: state.currentStep };
  writeWizardState(updated, workspaceDir);
  return updated;
}

export function resetWizardState(workspaceDir: string): WizardState {
  const fresh = WizardStateSchema.parse({});
  writeWizardState(fresh, workspaceDir);
  return fresh;
}

/**
 * Resets a single step to 'pending' without touching other steps or currentStep.
 * Used by per-step Reset buttons in the UI.
 */
export function resetStepStatus(workspaceDir: string, stepId: number): WizardState {
  const state = readWizardState(workspaceDir);
  const steps = state.steps.map((s) =>
    s.id === stepId
      ? { id: s.id, status: 'pending' as StepStatus }
      : s
  );
  const updated: WizardState = { ...state, steps };
  writeWizardState(updated, workspaceDir);
  return updated;
}
