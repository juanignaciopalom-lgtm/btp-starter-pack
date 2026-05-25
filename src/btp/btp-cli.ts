/**
 * BTP CLI wrapper module.
 *
 * All commands are based on the official SAP BTP CLI documentation.
 * CWE-78: All calls use run() with array args — no shell interpolation.
 *
 * IMPORTANT NOTES:
 * - BTP CLI login requires browser-based OIDC (no headless auth supported in Trial)
 * - All commands require an active BTP CLI session
 * - Output is returned as raw string for parsing — callers handle JSON.safeParse
 */

import { run, runInteractive, type RunOptions } from '../core/runner';
import { logger, sanitizeForLog } from '../core/logger';

// ── Info ──────────────────────────────────────────────────────────────────────
/**
 * Returns a one-line summary from `btp --info` (global account + user),
 * or null if the session is not active.
 */
export async function btpGetInfo(opts: RunOptions = {}): Promise<string | null> {
  try {
    const result = await run('btp', ['--info'], { ...opts, silent: true, throwOnError: false });
    if (!result.success) return null;
    const combined = result.stdout + result.stderr;
    // Extract global account name and user for a concise summary
    const accountMatch = combined.match(/(\S+)\s*\(global account/i);
    const userMatch = combined.match(/User:\s+(\S+)/i);
    if (accountMatch?.[1] || userMatch?.[1]) {
      const account = accountMatch?.[1] ?? '';
      const user = userMatch?.[1] ?? '';
      return [account && `account: ${account}`, user && `user: ${user}`].filter(Boolean).join(', ');
    }
    return combined.includes('global account') ? 'session active' : null;
  } catch {
    return null;
  }
}

// ── Session check ─────────────────────────────────────────────────────────────
/**
 * Checks if a BTP CLI session is active.
 * Returns true if `btp --info` succeeds and shows a logged-in account.
 */
export async function btpIsLoggedIn(opts: RunOptions = {}): Promise<boolean> {
  try {
    const result = await run('btp', ['--info'], { ...opts, silent: true, throwOnError: false });
    if (!result.success) return false;
    // BTP CLI outputs session info that includes the subdomain/email when logged in
    const combined = (result.stdout + result.stderr).toLowerCase();
    return combined.includes('global account') || combined.includes('subdomain') || combined.includes('logged in');
  } catch {
    return false;
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────
/**
 * Initiates BTP CLI login. This opens a browser for OIDC authentication.
 * No password is passed as argument — authentication is handled by the browser.
 *
 * CWE-798: Credentials are NEVER passed as arguments.
 */
export async function btpLogin(
  globalAccountSubdomain?: string,
  opts: RunOptions = {}
): Promise<boolean> {
  logger.info('Starting SAP BTP CLI login — a browser window will open for authentication.');
  logger.info('Complete the login in the browser, then return to this terminal.\n');

  const args: string[] = ['login'];
  if (globalAccountSubdomain) {
    // CWE-88: subdomain is validated by Zod in config, but assertSafeArg in runner also guards this
    args.push('--subdomain', globalAccountSubdomain);
  }

  // runInteractive: BTP CLI opens a browser and may prompt for input in the
  // terminal during OIDC flow — stdio must be inherited for this to work.
  const result = await runInteractive('btp', args, {
    cwd: opts.cwd,
    env: opts.env as Record<string, string> | undefined,
  });
  return result.success;
}

// ── Subaccounts ───────────────────────────────────────────────────────────────
export interface BtpSubaccount {
  displayName: string;
  guid: string;
  subdomain: string;
  state: string;
  region: string;
}

export async function btpListSubaccounts(opts: RunOptions = {}): Promise<BtpSubaccount[]> {
  const result = await run('btp', ['list', 'accounts/subaccount', '--format', 'json'], {
    ...opts,
    silent: true,
    throwOnError: false,
  });

  if (!result.success || !result.stdout) return [];

  try {
    const parsed = JSON.parse(result.stdout) as { value?: BtpSubaccount[] };
    return Array.isArray(parsed.value) ? parsed.value : [];
  } catch {
    logger.debug(`Could not parse subaccount list JSON: ${sanitizeForLog(result.stdout.substring(0, 200))}`);
    return [];
  }
}

// ── Environment instances (Cloud Foundry) ─────────────────────────────────────
export interface BtpEnvironmentInstance {
  name: string;
  environmentType: string;
  state: string;
  stateMessage: string;
  parameters?: string; // JSON string with org info
}

export async function btpListEnvironmentInstances(
  subaccountId: string,
  opts: RunOptions = {}
): Promise<BtpEnvironmentInstance[]> {
  const result = await run(
    'btp',
    ['list', 'accounts/environment-instance', '--subaccount', subaccountId, '--format', 'json'],
    { ...opts, silent: true, throwOnError: false }
  );

  if (!result.success || !result.stdout) return [];

  try {
    const parsed = JSON.parse(result.stdout) as { environmentInstances?: BtpEnvironmentInstance[] };
    return Array.isArray(parsed.environmentInstances) ? parsed.environmentInstances : [];
  } catch {
    logger.debug(`Could not parse environment instances JSON`);
    return [];
  }
}

export async function btpGetCfEnvironmentInstance(
  subaccountId: string,
  opts: RunOptions = {}
): Promise<BtpEnvironmentInstance | null> {
  const instances = await btpListEnvironmentInstances(subaccountId, opts);
  return instances.find((i) => i.environmentType === 'cloudfoundry') ?? null;
}

// ── Entitlements ──────────────────────────────────────────────────────────────
export interface BtpEntitlement {
  serviceName: string;
  servicePlanName: string;
  amount: number;
  remainingAmount: number;
}

export async function btpListEntitlements(
  subaccountId: string,
  opts: RunOptions = {}
): Promise<BtpEntitlement[]> {
  const result = await run(
    'btp',
    ['list', 'accounts/entitlement', '--subaccount', subaccountId, '--format', 'json'],
    { ...opts, silent: true, throwOnError: false }
  );

  if (!result.success || !result.stdout) return [];

  try {
    const parsed = JSON.parse(result.stdout) as { assignedServices?: Array<{ name: string; plans: Array<{ name: string; amount: number; remainingAmount: number }> }> };
    const entitlements: BtpEntitlement[] = [];

    if (Array.isArray(parsed.assignedServices)) {
      for (const svc of parsed.assignedServices) {
        for (const plan of svc.plans) {
          entitlements.push({
            serviceName: svc.name,
            servicePlanName: plan.name,
            amount: plan.amount,
            remainingAmount: plan.remainingAmount,
          });
        }
      }
    }

    return entitlements;
  } catch {
    logger.debug('Could not parse entitlements JSON');
    return [];
  }
}

// ── SaaS Subscriptions ────────────────────────────────────────────────────────
export interface BtpSubscription {
  appName: string;
  displayName: string;
  state: string;
  planName: string;
}

export async function btpListSubscriptions(
  subaccountId: string,
  opts: RunOptions = {}
): Promise<BtpSubscription[]> {
  const result = await run(
    'btp',
    ['list', 'accounts/subscription', '--subaccount', subaccountId, '--format', 'json'],
    { ...opts, silent: true, throwOnError: false }
  );

  if (!result.success || !result.stdout) return [];

  try {
    const parsed = JSON.parse(result.stdout) as { applications?: BtpSubscription[] };
    return Array.isArray(parsed.applications) ? parsed.applications : [];
  } catch {
    return [];
  }
}

export async function btpIsSubscribed(
  subaccountId: string,
  appName: string,
  opts: RunOptions = {}
): Promise<boolean> {
  const subs = await btpListSubscriptions(subaccountId, opts);
  const sub = subs.find((s) => s.appName === appName || s.displayName?.toLowerCase().includes(appName.toLowerCase()));
  return sub?.state === 'SUBSCRIBED';
}
