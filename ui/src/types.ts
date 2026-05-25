// ── Shared types for the BTP Starter Pack UI ─────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'completed' | 'error' | 'skipped';

export interface StepState {
  id: number;
  status: StepStatus;
  completedAt?: string;
  errorMessage?: string;
  note?: string;
}

export interface WizardState {
  currentStep: number;
  steps: StepState[];
  lastActiveAt: string;
  totalSteps: number;
  stepNames: Record<string, string>;
}

export interface Config {
  email: string;
  region: string;
  globalAccountSubdomain?: string;
  subaccountId?: string;
  cfApiEndpoint?: string;
  cfOrg?: string;
  cfSpace: string;
  servicesEnabled: string[];
  setupState: {
    cfEnabled: boolean;
    cfSpaceCreated: boolean;
    servicesCreated: string[];
    services: Record<string, { created: boolean; keyCreated: boolean; skipped: boolean }>;
  };
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  version?: string;
  hint?: string;
  link?: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  allOk: boolean;
}

export interface CfTarget {
  apiEndpoint: string;
  user: string;
  org: string;
  space: string;
}

export interface JobEvent {
  type: 'line' | 'status' | 'done' | 'error';
  data?: string;
  exitCode?: number;
  message?: string;
}

export interface Service {
  name: string;
  displayName: string;
  description: string;
  plan: string;
  trialAvailability: 'available' | 'limited' | 'unavailable' | 'manual';
  trialNote: string;
  required: boolean;
}

// ── BTP Regions (mirrors backend config.ts) ───────────────────────────────────
export const BTP_REGIONS = [
  'eu10', 'eu20', 'us10', 'us20', 'ap10', 'ap11', 'ap12', 'ap21',
  'br10', 'ca10', 'jp10', 'jp20', 'us30',
] as const;

export type BTPRegion = (typeof BTP_REGIONS)[number];

export const REGION_LABELS: Record<BTPRegion, string> = {
  eu10: 'Europe (Frankfurt) — eu10',
  eu20: 'Europe (Netherlands) — eu20',
  us10: 'US East (VA) — us10',
  us20: 'US West (WA) — us20',
  ap10: 'Asia Pacific (Sydney) — ap10',
  ap11: 'Asia Pacific (Singapore) — ap11',
  ap12: 'Asia Pacific (Seoul) — ap12',
  ap21: 'Asia Pacific (Tokyo) — ap21',
  br10: 'Brazil (São Paulo) — br10',
  ca10: 'Canada (Montreal) — ca10',
  jp10: 'Japan (Tokyo) — jp10',
  jp20: 'Japan (Osaka) — jp20',
  us30: 'US Central (Iowa) — us30',
};

// Cockpit deep-link helpers
export const COCKPIT_BASE = 'https://cockpit.hanatrial.ondemand.com/cockpit';
// Note: no trailing slash — all path helpers append with leading slash
export const COCKPIT_TRIAL = 'https://account.hanatrial.ondemand.com';

export function cockpitSubaccountUrl(subaccountId?: string): string {
  if (subaccountId) {
    return `${COCKPIT_BASE}#/globalaccount/trial/subaccount/${subaccountId}`;
  }
  // Fallback: trial home — no path appended, user navigates manually
  return COCKPIT_TRIAL;
}

export function cockpitCfEnableUrl(subaccountId?: string): string {
  if (subaccountId) {
    return `${cockpitSubaccountUrl(subaccountId)}/environmentinstances`;
  }
  return COCKPIT_TRIAL;
}

export function cockpitEntitlementsUrl(subaccountId?: string): string {
  if (subaccountId) {
    return `${cockpitSubaccountUrl(subaccountId)}/entitlements/entity-assignments`;
  }
  return COCKPIT_TRIAL;
}

export function cockpitServiceMarketplaceUrl(subaccountId?: string, service?: string): string {
  if (subaccountId) {
    const base = `${cockpitSubaccountUrl(subaccountId)}/service-marketplace`;
    return service ? `${base}/${encodeURIComponent(service)}` : base;
  }
  // Without subaccountId, link to trial home — user navigates to service marketplace
  return COCKPIT_TRIAL;
}
