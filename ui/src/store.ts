/**
 * Global wizard state — Zustand store.
 * Reads workspace from URL query param (?workspace=...) set by the CLI.
 */

import { create } from 'zustand';
import type { WizardState, Config, DoctorResult, StepStatus } from './types';
import * as api from './api';
import type { DetectedState } from './api';

// Extract workspace from URL (set by `btp-starter-pack ui`)
function getWorkspace(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('workspace') ?? '.';
}

interface Store {
  // Workspace
  workspace: string;

  // Wizard
  wizard: WizardState | null;
  wizardLoading: boolean;

  // Config
  config: Config | null;
  configLoading: boolean;

  // Doctor
  doctor: DoctorResult | null;
  doctorLoading: boolean;

  // Login
  btpLoggedIn: boolean | null;
  btpInfo: string | null;
  cfLoggedIn: boolean | null;
  cfTarget: { apiEndpoint: string; user: string; org: string; space: string } | null;

  // Terminal output per step
  terminalLines: Record<number, string[]>;

  // Running job per step
  activeJobId: Record<number, string>;

  // Step running state
  stepRunning: Record<number, boolean>;

  // Detected state (from /api/detect-state)
  detectedState: DetectedState | null;

  // Actions
  init: () => Promise<void>;
  detectAndSync: () => Promise<void>;
  refreshWizard: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  refreshDoctor: () => Promise<void>;
  checkLoginStatus: () => Promise<void>;
  goToStep: (step: number) => void;
  setStepStatus: (stepId: number, status: StepStatus, extras?: { errorMessage?: string }) => Promise<void>;
  appendTerminalLine: (stepId: number, line: string) => void;
  clearTerminal: (stepId: number) => void;
  setActiveJob: (stepId: number, jobId: string) => void;
  setStepRunning: (stepId: number, running: boolean) => void;
  resetWizard: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resetStep: (stepId: number, projectDir?: string) => Promise<any>;
}

export const useStore = create<Store>((set, get) => ({
  workspace: getWorkspace(),

  wizard: null,
  wizardLoading: false,

  config: null,
  configLoading: true, // true on boot so Step1 shows spinner before first fetch

  doctor: null,
  doctorLoading: false,

  btpLoggedIn: null,
  btpInfo: null,
  cfLoggedIn: null,
  cfTarget: null,

  terminalLines: {},
  activeJobId: {},
  stepRunning: {},
  detectedState: null,

  init: async () => {
    const workspace = get().workspace;

    // ── Step 1: reset wizard on disk FIRST ──────────────────────────────────
    // We reset BEFORE calling refreshWizard so that the very first value that
    // lands in the store is already step=1/all-pending.  If we reset after
    // refreshWizard, the stale currentStep (e.g. 6) is visible to React for
    // one render cycle and any component that captures it in a useState will
    // never update.
    try {
      const fresh = await api.resetWizard(workspace);
      // resetWizard already returns currentStep:1 / all pending
      set({ wizard: fresh, wizardLoading: false });
    } catch {
      // First run — file doesn't exist yet; refreshWizard below will create it
    }

    // ── Step 2: load config ──────────────────────────────────────────────────
    await get().refreshConfig();

    // ── Step 3: background tasks (non-blocking) ──────────────────────────────
    void get().detectAndSync();
    void get().refreshDoctor();
  },

  detectAndSync: async () => {
    const ws = get().workspace;
    try {
      const state = await api.detectState(ws);
      set({ detectedState: state });

      // Sync login/target info into the store for display purposes ONLY.
      // We intentionally do NOT auto-mark any wizard steps here.
      // Each step must be explicitly verified by the user before it can be
      // marked as completed — auto-marking creates false "green" states when
      // previous runs left partial state on disk (e.g. wrong org name, stale
      // CF session, service instances from a different space, etc.).
      set({
        btpLoggedIn: state.btpLoggedIn,
        btpInfo: state.btpInfo,
        cfLoggedIn: state.cfLoggedIn,
        cfTarget: state.cfTarget,
      });
    } catch {
      // detect-state is best-effort — silently ignore so the rest of the app works
    }
  },

  refreshWizard: async () => {
    set({ wizardLoading: true });
    try {
      const state = await api.getWizardState(get().workspace);
      set({ wizard: state });
    } catch {
      // Server might not be ready yet — ignore
    } finally {
      set({ wizardLoading: false });
    }
  },

  refreshConfig: async () => {
    set({ configLoading: true });
    try {
      const { config } = await api.getConfig(get().workspace);
      set({ config });
    } catch {
      // ignore
    } finally {
      set({ configLoading: false });
    }
  },

  refreshDoctor: async () => {
    set({ doctorLoading: true });
    try {
      const result = await api.runDoctor(get().workspace);
      set({ doctor: result });
    } catch {
      // ignore
    } finally {
      set({ doctorLoading: false });
    }
  },

  checkLoginStatus: async () => {
    try {
      const [btp, cf] = await Promise.all([
        api.getBtpLoginStatus(),
        api.getCfLoginStatus(),
      ]);
      set({
        btpLoggedIn: btp.loggedIn,
        btpInfo: btp.info,
        cfLoggedIn: cf.loggedIn,
        cfTarget: cf.target,
      });
      // Re-run full state detection so wizard steps are auto-marked when login succeeds
      void get().detectAndSync();
    } catch {
      // ignore
    }
  },

  goToStep: (step) => {
    set((s) => ({
      wizard: s.wizard ? { ...s.wizard, currentStep: step } : s.wizard,
    }));
    // Persist currentStep on disk using a dedicated endpoint.
    // IMPORTANT: do NOT call updateWizardStep here — that endpoint updates a
    // step's *status* and would incorrectly reset it to 'pending'.
    void api.setCurrentStep(get().workspace, step).catch(() => null);
  },

  setStepStatus: async (stepId, status, extras) => {
    try {
      const updated = await api.updateWizardStep(
        get().workspace,
        stepId,
        status,
        extras
      );
      set((s) => {
        // Preserve in-memory currentStep — NEVER overwrite it from the backend
        // response. The backend persists step statuses but is not authoritative
        // on which step the user is currently viewing.
        const prevCurrentStep = s.wizard?.currentStep ?? updated.currentStep;

        // Auto-advance to the next step when the current step is completed.
        // This is the expected UX: confirming step N moves the user to step N+1.
        const newCurrentStep =
          status === 'completed'
            ? Math.min(stepId + 1, 6)
            : prevCurrentStep;

        return { wizard: { ...updated, currentStep: newCurrentStep } };
      });

      // Persist the new currentStep to disk asynchronously.
      if (status === 'completed') {
        void api.setCurrentStep(get().workspace, Math.min(stepId + 1, 6)).catch(() => null);
      }
    } catch {
      // Update locally if API fails — still preserve currentStep + auto-advance
      set((s) => {
        const prevCurrentStep = s.wizard?.currentStep ?? 1;
        const newCurrentStep =
          status === 'completed' ? Math.min(stepId + 1, 6) : prevCurrentStep;
        return {
          wizard: s.wizard
            ? {
                ...s.wizard,
                currentStep: newCurrentStep,
                steps: s.wizard.steps.map((st) =>
                  st.id === stepId ? { ...st, status, ...extras } : st
                ),
              }
            : s.wizard,
        };
      });
    }
  },

  appendTerminalLine: (stepId, line) => {
    set((s) => ({
      terminalLines: {
        ...s.terminalLines,
        [stepId]: [...(s.terminalLines[stepId] ?? []), line],
      },
    }));
  },

  clearTerminal: (stepId) => {
    set((s) => ({
      terminalLines: { ...s.terminalLines, [stepId]: [] },
    }));
  },

  setActiveJob: (stepId, jobId) => {
    set((s) => ({
      activeJobId: { ...s.activeJobId, [stepId]: jobId },
    }));
  },

  setStepRunning: (stepId, running) => {
    set((s) => ({
      stepRunning: { ...s.stepRunning, [stepId]: running },
    }));
  },

  resetWizard: async () => {
    const fresh = await api.resetWizard(get().workspace);
    set({ wizard: fresh, terminalLines: {}, activeJobId: {}, stepRunning: {} });
  },

  resetStep: async (stepId, projectDir) => {
    try {
      const result = await api.resetStep(get().workspace, stepId, projectDir);
      set((s) => ({
        wizard: result,
        terminalLines: { ...s.terminalLines, [stepId]: [] },
        activeJobId: { ...s.activeJobId, [stepId]: '' },
        stepRunning: { ...s.stepRunning, [stepId]: false },
      }));
      return result;
    } catch {
      // Fallback: reset locally if backend call fails
      set((s) => ({
        wizard: s.wizard
          ? {
              ...s.wizard,
              steps: s.wizard.steps.map((st) =>
                st.id === stepId ? { ...st, status: 'pending' as StepStatus, errorMessage: undefined } : st
              ),
            }
          : s.wizard,
        terminalLines: { ...s.terminalLines, [stepId]: [] },
        stepRunning: { ...s.stepRunning, [stepId]: false },
      }));
      return null;
    }
  },
}));
