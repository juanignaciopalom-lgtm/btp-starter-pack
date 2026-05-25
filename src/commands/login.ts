/**
 * login command — guide authentication to BTP CLI and CF CLI.
 *
 * Security:
 * - CWE-798: No credentials are passed as arguments. Both BTP CLI and CF CLI
 *   use browser-based OIDC / SSO flows — the browser handles credential entry.
 * - Session tokens are managed by the respective CLI tools, not by this app.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../core/logger';
import { requireConfig, updateConfig } from '../core/config';
import { btpIsLoggedIn, btpLogin, btpListSubaccounts, btpGetCfEnvironmentInstance } from '../btp/btp-cli';
import { cfIsLoggedIn, cfLogin, cfGetTarget, cfTargetOrgSpace, cfListOrgs } from '../btp/cf-cli';
import { confirmAction } from '../core/prompts';

export function loginCommand(): Command {
  const cmd = new Command('login');
  cmd
    .description('Authenticate with SAP BTP CLI and Cloud Foundry CLI')
    .option('--btp-only', 'Only login to BTP CLI (skip CF)')
    .option('--cf-only', 'Only login to CF CLI (skip BTP)')
    .option('--workspace <dir>', 'Workspace directory', '.')
    .option('--dry-run', 'Show what would happen without executing')
    .action(async (options: { btpOnly?: boolean; cfOnly?: boolean; workspace: string; dryRun?: boolean }) => {
      logger.section('btp-starter-pack login');

      const dryRun = options.dryRun ?? false;
      const config = requireConfig(options.workspace);

      // ── BTP CLI Login ────────────────────────────────────────────────────────
      if (!options.cfOnly) {
        logger.blank();
        console.log(chalk.bold.cyan('── Step 1: SAP BTP CLI Login '));
        logger.blank();

        const spinner = ora('Checking BTP CLI session...').start();
        const alreadyLoggedIn = await btpIsLoggedIn({ dryRun });
        spinner.stop();

        if (alreadyLoggedIn) {
          logger.success('Already logged in to SAP BTP CLI.');
          const relogin = await confirmAction('Re-authenticate (refresh session)?', false);
          if (!relogin) {
            logger.info('Using existing BTP session.');
          } else {
            await performBtpLogin(config.globalAccountSubdomain, dryRun);
          }
        } else {
          await performBtpLogin(config.globalAccountSubdomain, dryRun);
        }

        // ── Detect subaccount info ───────────────────────────────────────────
        if (!dryRun) {
          await detectAndSaveSubaccountInfo(options.workspace);
        }
      }

      // ── CF CLI Login ─────────────────────────────────────────────────────────
      if (!options.btpOnly) {
        logger.blank();
        console.log(chalk.bold.cyan('── Step 2: Cloud Foundry CLI Login '));
        logger.blank();

        if (!config.cfApiEndpoint) {
          logger.error('CF API endpoint not configured. Run `btp-starter-pack init` first.');
          process.exit(1);
        }

        const spinner = ora('Checking CF CLI session...').start();
        const cfLoggedIn = await cfIsLoggedIn({ dryRun });
        spinner.stop();

        if (cfLoggedIn) {
          const target = await cfGetTarget({ dryRun });
          if (target) {
            logger.success(`Already logged in to CF as ${target.user}`);
            console.log(chalk.gray(`  Org: ${target.org}   Space: ${target.space}`));
          }
          const relogin = await confirmAction('Re-authenticate (refresh session)?', false);
          if (!relogin) {
            logger.info('Using existing CF session.');
          } else {
            await performCfLogin(config.cfApiEndpoint, options.workspace, config.cfOrg, config.cfSpace, dryRun);
          }
        } else {
          await performCfLogin(config.cfApiEndpoint, options.workspace, config.cfOrg, config.cfSpace, dryRun);
        }
      }

      // ── Summary ──────────────────────────────────────────────────────────────
      logger.blank();
      logger.success('Login sequence complete.');
      logger.blank();
      console.log(chalk.bold('Next step:'));
      console.log(chalk.cyan('  Run ') + chalk.white('btp-starter-pack plan') + chalk.gray(' to preview what services will be created.'));
    });

  return cmd;
}

async function performBtpLogin(subdomain: string | undefined, dryRun: boolean): Promise<void> {
  logger.blank();
  console.log(chalk.yellow.bold('⚠  A browser window will open for SAP BTP authentication.'));
  console.log(chalk.gray('   Enter your SAP BTP email and password in the browser.'));
  console.log(chalk.gray('   If your company uses SSO, use your corporate credentials.'));
  logger.blank();

  if (!dryRun) {
    const success = await btpLogin(subdomain, { dryRun });
    if (success) {
      logger.success('Successfully logged in to SAP BTP CLI.');
    } else {
      logger.error('BTP CLI login failed. Please try again or log in manually: btp login');
    }
  } else {
    logger.info(chalk.yellow('[dry-run] Would execute: btp login' + (subdomain ? ` --subdomain ${subdomain}` : '')));
  }
}

async function performCfLogin(
  cfApiEndpoint: string,
  workspaceDir: string,
  orgName: string | undefined,
  spaceName: string | undefined,
  dryRun: boolean
): Promise<void> {
  logger.blank();
  console.log(chalk.yellow.bold('⚠  CF login requires a one-time passcode from your browser.'));
  console.log(chalk.gray('   1. A URL will be shown — open it in your browser.'));
  console.log(chalk.gray('   2. Log in with your SAP credentials.'));
  console.log(chalk.gray('   3. Copy the one-time passcode and paste it here.'));
  logger.blank();

  if (!dryRun) {
    const success = await cfLogin(cfApiEndpoint, { dryRun });
    if (!success) {
      logger.error('CF CLI login failed. Please try manually: cf login -a <api> --sso');
      return;
    }
    logger.success('Logged in to Cloud Foundry.');

    // ── Auto-detect and target org/space ─────────────────────────────────────
    // Always run this block — do NOT gate on orgName being pre-set in config.
    // The org may not be in config yet (e.g. first login, or wrong region in init).
    const orgs = await cfListOrgs({ silent: true, throwOnError: false });
    if (orgs.length > 0) {
      // Prefer the configured org if it matches; otherwise pick the trial org or first
      const matched =
        (orgName ? orgs.find((o) => o.name === orgName) : undefined) ??
        orgs.find((o) => o.name.toLowerCase().includes('trial')) ??
        orgs[0];
      const targetOrg = matched?.name ?? '';
      const targetSpace = spaceName && spaceName.trim() ? spaceName : 'dev';

      if (targetOrg) {
        const targeted = await cfTargetOrgSpace(targetOrg, targetSpace);
        if (targeted) {
          logger.success(`CF target set: org=${targetOrg}, space=${targetSpace}`);
          // Persist to config so setup picks it up without any manual edits
          updateConfig({ cfOrg: targetOrg, cfSpace: targetSpace }, workspaceDir);
        } else {
          logger.warn(`Could not target org '${targetOrg}' / space '${targetSpace}'. ` +
            `Space may not exist yet — setup will create it.`);
          updateConfig({ cfOrg: targetOrg, cfSpace: targetSpace }, workspaceDir);
        }
      }
    } else {
      logger.warn('No CF orgs found. Enable Cloud Foundry in the BTP Cockpit first:');
      logger.warn('  https://account.hanatrial.ondemand.com/ → Subaccount → Enable Cloud Foundry');
    }

    // ── Persist the actual CF API endpoint from the active session ────────────
    // This corrects any mismatch between what was stored in init and the real endpoint
    // (e.g. eu10 config but actual cluster is us10-001).
    const liveTarget = await cfGetTarget({ silent: true });
    if (liveTarget?.apiEndpoint && liveTarget.apiEndpoint !== cfApiEndpoint) {
      logger.info(`Updating CF API endpoint in config: ${liveTarget.apiEndpoint}`);
      updateConfig({ cfApiEndpoint: liveTarget.apiEndpoint }, workspaceDir);
    }
  } else {
    logger.info(chalk.yellow(`[dry-run] Would execute: cf login -a ${cfApiEndpoint} --sso`));
  }
}

async function detectAndSaveSubaccountInfo(workspaceDir: string): Promise<void> {
  const spinner = ora('Detecting subaccount information...').start();
  try {
    const subaccounts = await btpListSubaccounts({ silent: true });
    if (subaccounts.length > 0) {
      const trial = subaccounts.find((s) =>
        s.displayName?.toLowerCase().includes('trial') ||
        s.subdomain?.toLowerCase().includes('trial')
      ) ?? subaccounts[0];

      if (trial) {
        spinner.text = 'Detecting CF environment...';
        const cfEnv = await btpGetCfEnvironmentInstance(trial.guid, { silent: true });

        updateConfig({
          subaccountId: trial.guid,
          globalAccountSubdomain: trial.subdomain,
          setupState: {
            cfEnabled: cfEnv !== null,
            cfSpaceCreated: false,
            servicesCreated: [],
            services: {},
          },
        }, workspaceDir);

        spinner.succeed(`Subaccount detected: ${trial.displayName} (${trial.region})`);
        if (cfEnv) {
          logger.success('Cloud Foundry environment is enabled in this subaccount.');
        } else {
          logger.warn('Cloud Foundry environment not yet enabled. The setup command will attempt to enable it.');
        }
      } else {
        spinner.warn('Could not detect Trial subaccount automatically.');
      }
    } else {
      spinner.warn('No subaccounts found. Check that BTP login was successful.');
    }
  } catch {
    spinner.warn('Could not auto-detect subaccount info. You may need to set it manually in .btp-starter.json');
  }
}
