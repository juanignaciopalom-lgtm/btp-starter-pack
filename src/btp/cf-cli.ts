/**
 * Cloud Foundry CLI wrapper module.
 *
 * All commands are based on CF CLI v8 official documentation.
 * CWE-78: All calls use run() with array args — no shell interpolation.
 * CWE-532: Service key credentials are never logged.
 *
 * IMPORTANT:
 * - CF CLI login requires SSO browser flow in SAP BTP Trial
 * - `cf login --sso` opens a browser for token retrieval
 */

import { run, runInteractive, type RunOptions } from '../core/runner';
import { logger, sanitizeForLog } from '../core/logger';

// ── Session check ─────────────────────────────────────────────────────────────
export async function cfIsLoggedIn(opts: RunOptions = {}): Promise<boolean> {
  try {
    const result = await run('cf', ['target'], { ...opts, silent: true, throwOnError: false });
    if (!result.success) return false;
    // cf target outputs "API endpoint: ..., User: ..." when logged in
    return result.stdout.includes('API endpoint') && !result.stdout.includes('Not logged in');
  } catch {
    return false;
  }
}

export interface CfTarget {
  apiEndpoint: string;
  user: string;
  org: string;
  space: string;
}

export async function cfGetTarget(opts: RunOptions = {}): Promise<CfTarget | null> {
  const result = await run('cf', ['target'], { ...opts, silent: true, throwOnError: false });
  if (!result.success) return null;

  const lines = result.stdout.split('\n');

  // Parse "key:   value" lines. We match the key at the START of the line so
  // "No org or space targeted" doesn't accidentally match the "org" key lookup.
  const getValue = (prefix: string): string => {
    const line = lines.find((l) => l.toLowerCase().trimStart().startsWith(prefix.toLowerCase()));
    if (!line) return '';
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) return '';
    const val = line.slice(colonIdx + 1).trim();
    // Treat CF "not targeted" messages as empty — e.g.
    // "No org targeted, use 'cf target -o ORG' to set"
    // "(not targeted)" / "(none)"
    if (/^(no |not |none|\()/i.test(val)) return '';
    return val;
  };

  return {
    apiEndpoint: getValue('api endpoint'),
    user: getValue('user'),
    org: getValue('org'),
    space: getValue('space'),
  };
}

// ── Login ─────────────────────────────────────────────────────────────────────
/**
 * Initiates CF CLI login with SSO (browser-based).
 * CWE-798: No password arguments ever.
 */
export async function cfLogin(apiEndpoint: string, opts: RunOptions = {}): Promise<boolean> {
  logger.info('Starting CF CLI login — the passcode URL will appear below:');
  logger.info('1. Open the URL shown in your browser.');
  logger.info('2. Log in with your SAP credentials and copy the one-time passcode.');
  logger.info('3. Paste the passcode into this terminal when prompted.\n');

  // CWE-88: apiEndpoint is validated as URL by Zod in config
  // runInteractive inherits the terminal so the URL and passcode prompt
  // are shown directly — required for `cf login --sso` interactive flow.
  const result = await runInteractive('cf', ['login', '-a', apiEndpoint, '--sso'], {
    cwd: opts.cwd,
    env: opts.env as Record<string, string> | undefined,
  });
  return result.success;
}

// ── Orgs and Spaces ───────────────────────────────────────────────────────────
export interface CfOrg {
  name: string;
  guid: string;
  status: string;
}

export async function cfListOrgs(opts: RunOptions = {}): Promise<CfOrg[]> {
  const result = await run('cf', ['orgs'], { ...opts, silent: true, throwOnError: false });
  if (!result.success) return [];

  // Parse plain text output (cf orgs doesn't support JSON in v8)
  const lines = result.stdout.split('\n').filter((l) => l.trim() && !l.includes('name') && !l.includes('Getting'));
  return lines.map((line) => ({ name: line.trim(), guid: '', status: 'active' }));
}

export async function cfCreateSpace(spaceName: string, orgName?: string, opts: RunOptions = {}): Promise<boolean> {
  const args: string[] = ['create-space', spaceName];
  if (orgName) args.push('-o', orgName);

  const result = await run('cf', args, { ...opts, throwOnError: false });
  if (result.success || result.stdout.includes('already exists')) {
    logger.success(`CF space '${spaceName}' is ready.`);
    return true;
  }
  return false;
}

export async function cfTargetOrgSpace(org: string, space: string, opts: RunOptions = {}): Promise<boolean> {
  const result = await run('cf', ['target', '-o', org, '-s', space], { ...opts, throwOnError: false });
  return result.success;
}

// ── Marketplace ───────────────────────────────────────────────────────────────
export interface CfService {
  name: string;
  plans: string[];
  description: string;
}

export async function cfMarketplace(opts: RunOptions = {}): Promise<CfService[]> {
  const result = await run('cf', ['marketplace', '-e', ''], { ...opts, silent: true, throwOnError: false });
  if (!result.success) {
    // Try without -e flag (older CF CLI versions)
    const fallback = await run('cf', ['marketplace'], { ...opts, silent: true, throwOnError: false });
    if (!fallback.success) return [];
    return parseCfMarketplaceOutput(fallback.stdout);
  }
  return parseCfMarketplaceOutput(result.stdout);
}

function parseCfMarketplaceOutput(output: string): CfService[] {
  const services: CfService[] = [];
  const lines = output.split('\n');
  let inServiceSection = false;

  for (const line of lines) {
    if (line.includes('service') && line.includes('plans') && line.includes('description')) {
      inServiceSection = true;
      continue;
    }
    if (!inServiceSection) continue;
    if (!line.trim()) continue;

    const parts = line.trim().split(/\s{2,}/);
    if (parts.length >= 2) {
      services.push({
        name: parts[0]?.trim() ?? '',
        plans: (parts[1] ?? '').split(',').map((p) => p.trim()),
        description: parts[2]?.trim() ?? '',
      });
    }
  }

  return services;
}

export async function cfServiceExists(serviceName: string, opts: RunOptions = {}): Promise<boolean> {
  const marketplace = await cfMarketplace(opts);
  return marketplace.some((s) => s.name === serviceName);
}

// ── Service instances ─────────────────────────────────────────────────────────
export interface CfServiceInstance {
  name: string;
  service: string;
  plan: string;
  lastOperation: string;
  guid: string;
}

export async function cfListServices(opts: RunOptions = {}): Promise<CfServiceInstance[]> {
  const result = await run('cf', ['services'], { ...opts, silent: true, throwOnError: false });
  if (!result.success) return [];

  const lines = result.stdout.split('\n');
  const instances: CfServiceInstance[] = [];
  let inDataSection = false;

  for (const line of lines) {
    // CF CLI v8 header uses "offering" instead of "service" — match either
    const lowerLine = line.toLowerCase();
    if (
      lowerLine.includes('name') &&
      (lowerLine.includes('offering') || lowerLine.includes('service')) &&
      lowerLine.includes('plan')
    ) {
      inDataSection = true;
      continue;
    }
    if (!inDataSection || !line.trim()) continue;
    // Skip separator lines (dashes)
    if (/^[-\s]+$/.test(line)) continue;

    const parts = line.trim().split(/\s{2,}/);
    if (parts.length >= 2 && parts[0]?.trim()) {
      instances.push({
        name: parts[0]?.trim() ?? '',
        service: parts[1]?.trim() ?? '',
        plan: parts[2]?.trim() ?? '',
        lastOperation: parts[3]?.trim() ?? '',
        guid: '',
      });
    }
  }

  return instances;
}

export async function cfServiceInstanceExists(instanceName: string, opts: RunOptions = {}): Promise<boolean> {
  const services = await cfListServices(opts);
  return services.some((s) => s.name === instanceName);
}

/**
 * Creates a CF service instance.
 * @param configJson - Optional service configuration JSON.
 *   CWE-532: configJson may contain credentials — it is passed as a file path, not inline.
 *   sensitiveArgIndices marks the config arg so it's redacted in logs.
 */
export async function cfCreateService(
  service: string,
  plan: string,
  instanceName: string,
  configJson?: string,
  opts: RunOptions = {}
): Promise<boolean> {
  const args: string[] = ['create-service', service, plan, instanceName];
  const sensitiveArgIndices: number[] = [];

  if (configJson) {
    args.push('-c', configJson);
    // Mark the config JSON arg as sensitive so runner redacts it from logs
    sensitiveArgIndices.push(args.length - 1);
  }

  const result = await run('cf', args, { ...opts, throwOnError: false, sensitiveArgIndices });

  if (result.success || result.stdout.includes('already exists')) {
    logger.success(`Service instance '${instanceName}' (${service}/${plan}) is ready.`);
    return true;
  }

  const cfError = sanitizeForLog((result.stderr || result.stdout).substring(0, 400));
  logger.error(`Failed to create service '${instanceName}': ${cfError || 'unknown error'}`);
  return false;
}

// ── Service keys ──────────────────────────────────────────────────────────────
/**
 * Waits for a service instance to reach "create succeeded" state.
 * SAP BTP services are async — the broker accepts the request immediately but
 * provisioning can take 30–120 seconds. Creating a service key on a still-
 * provisioning instance returns "operation in progress" and fails.
 */
export async function cfWaitForService(
  instanceName: string,
  maxWaitMs: number = 120_000,
  opts: RunOptions = {}
): Promise<boolean> {
  const pollInterval = 5_000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const result = await run('cf', ['service', instanceName], {
      ...opts,
      silent: true,
      throwOnError: false,
    });

    const combined = (result.stdout + result.stderr).toLowerCase();
    if (combined.includes('create succeeded')) return true;
    if (combined.includes('create failed') || combined.includes('failed')) return false;

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  logger.warn(`Timed out waiting for service '${instanceName}' to finish provisioning.`);
  return false;
}

/**
 * Creates a service key.
 * CWE-532: The resulting service key contains credentials — callers must NOT log the result.
 */
export async function cfCreateServiceKey(
  instanceName: string,
  keyName: string,
  opts: RunOptions = {}
): Promise<boolean> {
  const result = await run('cf', ['create-service-key', instanceName, keyName], {
    ...opts,
    throwOnError: false,
  });

  if (result.success || result.stdout.includes('already exists')) {
    logger.success(`Service key '${keyName}' created for '${instanceName}'.`);
    return true;
  }

  const cfKeyError = sanitizeForLog((result.stderr || result.stdout).substring(0, 400));
  logger.error(`Failed to create service key '${keyName}' for '${instanceName}': ${cfKeyError || 'unknown error'}`);
  return false;
}

/**
 * Retrieves a service key.
 * CWE-532: IMPORTANT — the returned object contains credentials.
 * Callers MUST NOT log this return value.
 * Display to user only with explicit masking.
 */
export async function cfGetServiceKey(
  instanceName: string,
  keyName: string,
  opts: RunOptions = {}
): Promise<Record<string, unknown> | null> {
  // Use throwOnError: false so we handle the error ourselves
  const result = await run('cf', ['service-key', instanceName, keyName], {
    ...opts,
    silent: true,
    throwOnError: false,
    // Mark stdout as sensitive — it contains credentials
    sensitiveArgIndices: [],
  });

  if (!result.success) return null;

  try {
    // CF CLI outputs "Getting key ... as user ..." before the JSON
    const jsonStart = result.stdout.indexOf('{');
    if (jsonStart === -1) return null;
    const jsonStr = result.stdout.substring(jsonStart);
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Apps ──────────────────────────────────────────────────────────────────────
export interface CfApp {
  name: string;
  state: string;
  instances: string;
  memoryUsage: string;
  urls: string;
}

export async function cfListApps(opts: RunOptions = {}): Promise<CfApp[]> {
  const result = await run('cf', ['apps'], { ...opts, silent: true, throwOnError: false });
  if (!result.success) return [];

  const lines = result.stdout.split('\n');
  const apps: CfApp[] = [];
  let inDataSection = false;

  for (const line of lines) {
    // Detect header line — works for both CF CLI v6 (instances) and v7+ (processes/routes)
    // v6 header: "name  requested state  instances  memory  disk  urls"
    // v7 header: "name  requested state  processes  routes"
    if (
      line.toLowerCase().includes('name') &&
      line.toLowerCase().includes('requested') &&
      (
        line.toLowerCase().includes('instances') ||
        line.toLowerCase().includes('processes') ||
        line.toLowerCase().includes('routes')
      )
    ) {
      inDataSection = true;
      continue;
    }
    if (!inDataSection || !line.trim()) continue;

    const parts = line.trim().split(/\s{2,}/);
    if (parts.length >= 2) {
      apps.push({
        name:        parts[0]?.trim() ?? '',
        state:       parts[1]?.trim() ?? '',
        instances:   parts[2]?.trim() ?? '',
        memoryUsage: parts[3]?.trim() ?? '',
        urls:        parts[4]?.trim() ?? '',
      });
    }
  }

  return apps;
}
