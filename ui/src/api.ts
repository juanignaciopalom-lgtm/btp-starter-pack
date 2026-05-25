/**
 * API client for the btp-starter-pack UI server.
 * All requests go to /api/* (proxied to localhost:3077 in dev).
 */

import type { DoctorResult, WizardState, Config, CfTarget, Service } from './types';

const BASE = '/api';

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(b.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(b.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(b.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Health ────────────────────────────────────────────────────────────────────
export const health = () => get<{ status: string }>('/health');

// ── Detect state ──────────────────────────────────────────────────────────────
export interface DetectedState {
  configExists: boolean;
  btpLoggedIn: boolean;
  btpInfo: string | null;
  cfLoggedIn: boolean;
  cfTarget: { apiEndpoint: string; user: string; org: string; space: string } | null;
  cfHasOrgAndSpace: boolean;
  serviceInstances: string[];
  requiredInstances: string[];
  existingRequiredServices: string[];
  allRequiredServicesExist: boolean;
  projectDirs: string[];
  deployedApps: { name: string; state: string }[];
}

export const detectState = (workspace: string) =>
  get<DetectedState>('/detect-state', { workspace });

// ── Init workspace ────────────────────────────────────────────────────────────
export const initWorkspace = (data: {
  workspace: string;
  email: string;
  region: string;
  globalAccountSubdomain: string;
  cfSpace: string;
}) => post<{ ok: boolean; config: Config }>('/init', data);

// ── Config ────────────────────────────────────────────────────────────────────
export const getConfig = (workspace: string) =>
  get<{ exists: boolean; config: Config | null }>('/config', { workspace });

export const updateConfig = (workspace: string, updates: Partial<Config>) =>
  put<{ ok: boolean; config: Config }>('/config', { workspace, updates });

// ── Wizard state ──────────────────────────────────────────────────────────────
export const getWizardState = (workspace: string) =>
  get<WizardState>('/wizard-state', { workspace });

export const updateWizardStep = (
  workspace: string,
  stepId: number,
  status: string,
  extras?: { errorMessage?: string; note?: string }
) =>
  put<WizardState>('/wizard-state', { workspace, stepId, status, ...extras });

export const resetWizard = (workspace: string) =>
  post<WizardState>('/wizard-state/reset', { workspace });

/**
 * Resets a single step to pending and performs step-specific cleanup.
 * Returns the updated WizardState (with stepNames/totalSteps).
 */
export const resetStep = (workspace: string, stepId: number, projectDir?: string) =>
  post<WizardState & { actions: string[] }>('/reset/step', { workspace, stepId, projectDir });

/**
 * Persists currentStep on disk without changing any step status.
 * Used by navigation (goToStep) and auto-advance after completing a step.
 */
export const setCurrentStep = (workspace: string, step: number) =>
  patch<WizardState>('/wizard-state/current-step', { workspace, step });

/**
 * Runs the actual verification check for a step.
 * Returns { ok, details } — does NOT modify wizard state.
 */
export const verifyStep = (workspace: string, stepId: number) =>
  get<{ ok: boolean; details: string; [key: string]: unknown }>('/verify/step', {
    workspace,
    stepId: String(stepId),
  });

// ── Doctor ────────────────────────────────────────────────────────────────────
export const runDoctor = (workspace: string) =>
  get<DoctorResult>('/doctor', { workspace });

// ── Login status ──────────────────────────────────────────────────────────────
export const getBtpLoginStatus = () =>
  get<{ loggedIn: boolean; info: string | null }>('/login/btp/status');

export const getCfLoginStatus = () =>
  get<{ loggedIn: boolean; target: CfTarget | null }>('/login/cf/status');

// ── Jobs ──────────────────────────────────────────────────────────────────────
export const startSetupJob = (workspace: string) =>
  post<{ jobId: string }>('/jobs/setup', { workspace });

export const startValidateJob = (workspace: string) =>
  post<{ jobId: string }>('/jobs/validate', { workspace });

export const startGenerateJob = (
  workspace: string,
  name: string,
  type: string,
  namespace?: string
) =>
  post<{ jobId: string }>('/jobs/generate', { workspace, name, type, namespace });

export const startDeployJob = (workspace: string, projectDir: string) =>
  post<{ jobId: string }>('/jobs/deploy', { workspace, projectDir });

// ── Deploy preflight ──────────────────────────────────────────────────────────
export interface PreflightCheck {
  id: string;
  label: string;
  status: 'ok' | 'error' | 'warning';
  message: string;
  fix?: string;
  autofix?: boolean;
}

export interface PreflightResult {
  ready: boolean;
  checks: PreflightCheck[];
}

export const getDeployPreflight = (workspace: string, projectDir: string) =>
  get<PreflightResult>('/deploy/preflight', { workspace, projectDir });

export const startInstallMbtJob = () =>
  post<{ jobId: string }>('/deploy/install-mbt', {});

export const startInstallCfPluginJob = () =>
  post<{ jobId: string }>('/deploy/install-cf-plugin', {});

// ── SSE stream ────────────────────────────────────────────────────────────────
/**
 * Opens an SSE stream for a job.
 * Returns an EventSource that emits parsed JobEvent objects.
 * Caller is responsible for calling es.close() when done.
 */
export function openJobStream(
  jobId: string,
  onLine: (line: string) => void,
  onDone: (exitCode: number) => void,
  onError: (message: string) => void
): EventSource {
  const es = new EventSource(`${BASE}/jobs/${encodeURIComponent(jobId)}/stream`);

  es.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as {
        type: string;
        data?: string;
        exitCode?: number;
        message?: string;
      };
      if (parsed.type === 'line' && parsed.data) {
        onLine(parsed.data);
      } else if (parsed.type === 'done') {
        onDone(parsed.exitCode ?? 0);
        es.close();
      } else if (parsed.type === 'error') {
        onError(parsed.message ?? 'Unknown error');
        es.close();
      }
    } catch {
      // Ignore malformed events
    }
  };

  es.onerror = () => {
    onError('Connection lost');
    es.close();
  };

  return es;
}

// ── Services ──────────────────────────────────────────────────────────────────
export const getServices = () =>
  get<{ services: Service[] }>('/services');

// ── CF live state ─────────────────────────────────────────────────────────────
export const getCfServiceInstances = () =>
  get<{ instances: { name: string; service: string; plan: string; lastOperation: string }[] }>('/cf/services');

export const getCfApps = () =>
  get<{ apps: { name: string; state: string; instances: string; memoryUsage: string; urls: string }[] }>('/cf/apps');

export const getCfAppLogs = (appName: string) =>
  get<{ lines: string[] }>('/cf/app-logs', { appName });

/**
 * Runs `cf target -o org -s space` on the server side and returns the new target.
 * Used in Step 3 when the user is logged in but hasn't targeted an org/space yet.
 */
export const cfTargetOrg = (org: string, space: string) =>
  post<{ ok: boolean; target: CfTarget | null; output: string }>('/cf/target', { org, space });
