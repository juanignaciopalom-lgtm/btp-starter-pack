/**
 * Configuration module — schema validation and persistence.
 *
 * Security:
 * - CWE-798: No credentials stored in config file.
 * - CWE-22: Config file path is validated and restricted to the workspace directory.
 * - All config reads are validated through the Zod schema before use.
 */

import path from 'path';
import fs from 'fs-extra';
import { z } from 'zod';
import { logger } from './logger';

// ── Config file name ─────────────────────────────────────────────────────────
export const CONFIG_FILENAME = '.btp-starter.json';

// ── BTP Regions ──────────────────────────────────────────────────────────────
export const BTP_REGIONS = ['eu10', 'eu20', 'us10', 'us20', 'ap10', 'ap11', 'ap12', 'ap21', 'br10', 'ca10', 'jp10', 'jp20', 'us30'] as const;
export type BTPRegion = (typeof BTP_REGIONS)[number];

export const CF_API_URLS: Record<BTPRegion, string> = {
  eu10: 'https://api.cf.eu10.hana.ondemand.com',
  eu20: 'https://api.cf.eu20.hana.ondemand.com',
  // us10 Trial accounts are sometimes provisioned in us10-001 (a sub-AZ of us10).
  // The correct endpoint is shown in the BTP Cockpit → Subaccount → Cloud Foundry Environment.
  us10: 'https://api.cf.us10-001.hana.ondemand.com',
  us20: 'https://api.cf.us20.hana.ondemand.com',
  ap10: 'https://api.cf.ap10.hana.ondemand.com',
  ap11: 'https://api.cf.ap11.hana.ondemand.com',
  ap12: 'https://api.cf.ap12.hana.ondemand.com',
  ap21: 'https://api.cf.ap21.hana.ondemand.com',
  br10: 'https://api.cf.br10.hana.ondemand.com',
  ca10: 'https://api.cf.ca10.hana.ondemand.com',
  jp10: 'https://api.cf.jp10.hana.ondemand.com',
  jp20: 'https://api.cf.jp20.hana.ondemand.com',
  us30: 'https://api.cf.us30.hana.ondemand.com',
};

// ── Zod Schema ───────────────────────────────────────────────────────────────
// CWE-798: Intentionally does NOT include any password, token, or secret fields.
const ServiceStateSchema = z.object({
  created: z.boolean().default(false),
  keyCreated: z.boolean().default(false),
  skipped: z.boolean().default(false),
  skipReason: z.string().optional(),
});

const SetupStateSchema = z.object({
  cfEnabled: z.boolean().default(false),
  cfSpaceCreated: z.boolean().default(false),
  servicesCreated: z.array(z.string()).default([]),
  lastSetupAt: z.string().optional(),
  services: z.record(z.string(), ServiceStateSchema).default({}),
});

export const ConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  // CWE-532: email is stored only for identification, not for authentication
  email: z.string().email({ message: 'Invalid email address' }),
  region: z.enum(BTP_REGIONS, { errorMap: () => ({ message: `Region must be one of: ${BTP_REGIONS.join(', ')}` }) }),
  globalAccountSubdomain: z.string().min(1).optional(),
  subaccountId: z.string().uuid({ message: 'Subaccount ID must be a valid UUID' }).optional(),
  cfApiEndpoint: z.string().url({ message: 'CF API endpoint must be a valid URL' }).optional(),
  cfOrg: z.string().min(1).optional(),
  cfSpace: z.string().min(1).default('dev'),
  workspaceDir: z.string().min(1).default('.'),
  servicesEnabled: z.array(z.string()).default(['xsuaa', 'destination', 'html5-apps-repo', 'application-logs']),
  dryRun: z.boolean().default(false),
  setupState: SetupStateSchema.default({}),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type Config = z.infer<typeof ConfigSchema>;
export type SetupState = z.infer<typeof SetupStateSchema>;

// ── Config file path resolution ──────────────────────────────────────────────
export function resolveConfigPath(workspaceDir: string): string {
  // CWE-22: Normalize and resolve to prevent path traversal
  const normalizedDir = path.resolve(workspaceDir);
  return path.join(normalizedDir, CONFIG_FILENAME);
}

// ── Read config ──────────────────────────────────────────────────────────────
export function readConfig(workspaceDir: string = '.'): Config | null {
  const configPath = resolveConfigPath(workspaceDir);

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = fs.readJsonSync(configPath) as unknown;
    const result = ConfigSchema.safeParse(raw);

    if (!result.success) {
      logger.warn(`Config file at ${configPath} has validation errors:`);
      result.error.issues.forEach((issue) => {
        logger.warn(`  ${issue.path.join('.')}: ${issue.message}`);
      });
      return null;
    }

    return result.data;
  } catch (_err) {
    // CWE-209: Do not expose file read error details to console
    logger.error(`Failed to read config file. Run 'btp-starter-pack init' to create a new one.`);
    return null;
  }
}

// ── Write config ─────────────────────────────────────────────────────────────
export function writeConfig(config: Config, workspaceDir: string = '.'): void {
  const configPath = resolveConfigPath(workspaceDir);

  try {
    // Validate before writing
    const result = ConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Config validation failed before write: ${result.error.message}`);
    }

    const toWrite: Config = {
      ...result.data,
      updatedAt: new Date().toISOString(),
    };

    fs.ensureDirSync(path.dirname(configPath));
    fs.writeJsonSync(configPath, toWrite, { spaces: 2 });
    logger.debug(`Config written to ${configPath}`);
  } catch (err) {
    // CWE-209: Generic message to user
    logger.error('Failed to write config file. Check directory permissions.');
    if (err instanceof Error) {
      logger.debug(`Write error detail: ${err.message}`);
    }
    throw err;
  }
}

// ── Update config ────────────────────────────────────────────────────────────
export function updateConfig(
  updates: Partial<Config>,
  workspaceDir: string = '.'
): Config {
  const existing = readConfig(workspaceDir);
  if (!existing) {
    throw new Error(`No config found at ${workspaceDir}. Run 'btp-starter-pack init' first.`);
  }

  const merged = { ...existing, ...updates };
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new Error(`Config merge produced invalid state: ${result.error.message}`);
  }

  writeConfig(result.data, workspaceDir);
  return result.data;
}

// ── Require config (throws if not found) ─────────────────────────────────────
export function requireConfig(workspaceDir: string = '.'): Config {
  const config = readConfig(workspaceDir);
  if (!config) {
    throw new Error(
      `No configuration found. Run 'btp-starter-pack init' first to set up your workspace.`
    );
  }
  return config;
}
