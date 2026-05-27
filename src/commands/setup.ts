/**
 * setup command — execute the BTP environment configuration.
 *
 * Security:
 * - Every action that modifies BTP requires prior confirmation.
 * - Service key credentials are NEVER logged (CWE-532).
 * - Runs plan first, then asks for confirmation before modifying anything.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import { logger, sanitizeForLog } from '../core/logger';
import { requireConfig, updateConfig } from '../core/config';
import { confirmAction } from '../core/prompts';
import { btpIsLoggedIn } from '../btp/btp-cli';
import {
  cfIsLoggedIn,
  cfGetTarget,
  cfListOrgs,
  cfCreateSpace,
  cfTargetOrgSpace,
  cfServiceInstanceExists,
  cfCreateService,
  cfWaitForService,
  cfCreateServiceKey,
  cfMarketplace,
} from '../btp/cf-cli';
import { filterSelectedServices } from '../btp/services';
import { renderTemplate } from '../templates/renderer';
import { xsSecurityTemplate } from '../templates/xs-security';

export function setupCommand(): Command {
  const cmd = new Command('setup');
  cmd
    .description('Create BTP services and configure the environment (runs after plan)')
    .option('--workspace <dir>', 'Workspace directory', '.')
    .option('--dry-run', 'Show commands without executing them')
    .option('--skip-confirm', 'Skip confirmation prompt (use with caution)')
    .action(async (options: { workspace: string; dryRun?: boolean; skipConfirm?: boolean }) => {
      logger.section('btp-starter-pack setup');

      const dryRun = options.dryRun ?? false;
      const workspaceDir = path.resolve(options.workspace);
      const config = requireConfig(workspaceDir);

      // ── Pre-flight checks ─────────────────────────────────────────────────────
      logger.info('Running pre-flight checks...');

      const btpOk = await btpIsLoggedIn({ dryRun, silent: true });
      const cfOk = await cfIsLoggedIn({ dryRun, silent: true });

      if (!btpOk && !dryRun) {
        logger.error('Not logged in to SAP BTP CLI. Run `btp-starter-pack login` first.');
        process.exit(1);
      }
      if (!cfOk && !dryRun) {
        logger.error('Not logged in to CF CLI. Run `btp-starter-pack login` first.');
        process.exit(1);
      }

      // ── Guard: CF org must exist ──────────────────────────────────────────────
      // In SAP BTP Trial, Cloud Foundry must be explicitly enabled in the Cockpit
      // before any CF commands work. If there are no orgs, setup cannot proceed.
      if (!dryRun) {
        const orgs = await cfListOrgs({ silent: true, throwOnError: false });
        if (orgs.length === 0) {
          logger.blank();
          logger.error('No Cloud Foundry org found. The CF environment has not been enabled yet.');
          logger.blank();
          console.log(chalk.yellow.bold('  You need to enable Cloud Foundry in the SAP BTP Cockpit first:'));
          console.log(chalk.white('  1. Open https://account.hanatrial.ondemand.com/'));
          console.log(chalk.white('  2. Click on your Trial subaccount'));
          console.log(chalk.white('  3. Find "Cloud Foundry Environment" section'));
          console.log(chalk.white('  4. Click "Enable Cloud Foundry" → confirm in the dialog'));
          console.log(chalk.white('  5. Wait ~2 minutes for provisioning to complete'));
          console.log(chalk.white('  6. Run this command again'));
          console.log(chalk.gray('\n  After enabling, a CF org and a "dev" space will be created automatically.'));
          process.exit(1);
        }

        // If config has no cfOrg, auto-detect from the first available org
        if (!config.cfOrg && orgs.length > 0) {
          const detectedOrg = orgs[0]?.name ?? '';
          logger.info(`Auto-detected CF org: ${detectedOrg}`);
          updateConfig({ cfOrg: detectedOrg }, workspaceDir);
          config.cfOrg = detectedOrg;
        }
      }

      logger.success('Sessions active — BTP CLI and CF CLI ready.');

      // ── Confirmation ──────────────────────────────────────────────────────────
      logger.blank();
      if (!dryRun && !options.skipConfirm) {
        console.log(chalk.yellow('This will create service instances in your SAP BTP Trial account.'));
        console.log(chalk.yellow('Review `btp-starter-pack plan` output before proceeding.'));
        logger.blank();

        const proceed = await confirmAction('Proceed with setup?', false);
        if (!proceed) {
          logger.info('Setup cancelled.');
          return;
        }
      }

      const results: Array<{ step: string; success: boolean; note?: string }> = [];

      // ── Step 1: CF Space ──────────────────────────────────────────────────────
      logger.blank();
      logger.section('Step 1: Cloud Foundry Space');

      if (!config.setupState.cfSpaceCreated) {
        const spaceSpinner = ora(`Creating CF space '${config.cfSpace}'...`).start();

        if (dryRun) {
          spaceSpinner.info(chalk.yellow(`[dry-run] cf create-space ${config.cfSpace}`));
          results.push({ step: 'CF Space', success: true, note: 'dry-run' });
        } else {
          const spaceOk = await cfCreateSpace(config.cfSpace, config.cfOrg, { throwOnError: false });
          spaceSpinner.stop();

          if (spaceOk) {
            // Target the space
            if (config.cfOrg) {
              await cfTargetOrgSpace(config.cfOrg, config.cfSpace);
            }
            updateConfig({
              setupState: {
                ...config.setupState,
                cfSpaceCreated: true,
              },
            }, workspaceDir);
            results.push({ step: 'CF Space', success: true });
            logger.success(`Space '${config.cfSpace}' ready.`);
          } else {
            results.push({ step: 'CF Space', success: false, note: 'Check CF login and org permissions' });
          }
        }
      } else {
        logger.info(`CF space '${config.cfSpace}' already exists — skipping.`);
        results.push({ step: 'CF Space', success: true, note: 'already exists' });
      }

      // ── Step 2: Ensure CF org + space are targeted ───────────────────────────
      // Strategy (in order):
      //   A) If CF already has a valid org+space targeted → use it as-is.
      //   B) If config.cfOrg is set → try cf target -o cfOrg -s cfSpace.
      //   C) If that fails → auto-detect actual org from `cf orgs` and retry.
      //   D) If still no target → abort with actionable message.
      // We always sync config with the actual targeted org/space so later steps
      // (service creation, deploy) never operate on a stale/wrong value.
      if (!dryRun) {
        let target = await cfGetTarget({ silent: true });

        if (!target?.org || !target?.space) {
          // (B) Try setting from config
          if (config.cfOrg && config.cfSpace) {
            logger.info(`Setting CF target: org=${config.cfOrg}, space=${config.cfSpace}`);
            await cfTargetOrgSpace(config.cfOrg, config.cfSpace, { throwOnError: false });
            target = await cfGetTarget({ silent: true });
          }

          // (C) Config value might be wrong → auto-detect from `cf orgs`
          if (!target?.org || !target?.space) {
            logger.info('CF target not set from config — auto-detecting org from CF CLI...');
            const orgs = await cfListOrgs({ silent: true, throwOnError: false });
            if (orgs.length > 0) {
              const detectedOrg = orgs[0]?.name ?? '';
              logger.info(`Detected CF org: ${detectedOrg}`);
              await cfTargetOrgSpace(detectedOrg, config.cfSpace, { throwOnError: false });
              target = await cfGetTarget({ silent: true });
              if (target?.org) {
                updateConfig({ cfOrg: detectedOrg }, workspaceDir);
                config.cfOrg = detectedOrg;
              }
            }
          }

          // (D) Hard fail — services will 100% fail without a target
          if (!target?.org || !target?.space) {
            logger.error('CF org and space are not targeted. Cannot create services.');
            logger.blank();
            console.log(chalk.yellow.bold('  To fix this, run the following command in your terminal:'));
            console.log(chalk.white(`  cf target -o YOUR_CF_ORG -s ${config.cfSpace || 'dev'}`));
            console.log(chalk.gray('\n  To find your CF org name, run:  cf orgs'));
            console.log(chalk.gray('  Then come back and run setup again.'));
            process.exit(1);
          }
        }

        // Sync config with actual targeted org/space (prevents future drift)
        if (target.org && target.org !== config.cfOrg) {
          logger.info(`Updating config cfOrg: "${config.cfOrg}" → "${target.org}"`);
          updateConfig({ cfOrg: target.org }, workspaceDir);
          config.cfOrg = target.org;
        }
        if (target.space && target.space !== config.cfSpace) {
          logger.info(`Updating config cfSpace: "${config.cfSpace}" → "${target.space}"`);
          updateConfig({ cfSpace: target.space }, workspaceDir);
          config.cfSpace = target.space;
        }

        logger.success(`CF target confirmed: org=${target.org}, space=${target.space}`);
      }

      // ── Step 3: Check marketplace ─────────────────────────────────────────────
      logger.blank();
      logger.section('Step 2: Service Marketplace');

      const marketplace = dryRun ? [] : await cfMarketplace({ silent: true, throwOnError: false });
      const marketplaceNames = new Set(marketplace.map((s) => s.name));

      const services = filterSelectedServices(config.servicesEnabled);
      logger.info(`Services to create: ${services.map((s) => s.cfServiceName).join(', ')}`);

      // ── Step 4: Create service instances ─────────────────────────────────────
      logger.blank();
      logger.section('Step 3: Service Instances');

      const updatedServicesState = { ...config.setupState.services };
      const createdServices: string[] = [...config.setupState.servicesCreated];

      for (const svc of services) {
        const instanceName = svc.defaultInstanceName;
        const spinner = ora(`Processing ${svc.displayName}...`).start();

        // Check marketplace availability (skip check in dry-run)
        if (!dryRun && marketplace.length > 0 && !marketplaceNames.has(svc.cfServiceName)) {
          spinner.warn(
            chalk.yellow(
              `[SKIPPED] ${svc.cfServiceName} — not found in marketplace. ` +
              `This service may not be available in region ${config.region}.`
            )
          );
          updatedServicesState[svc.cfServiceName] = {
            created: false,
            keyCreated: false,
            skipped: true,
            skipReason: `Not available in marketplace (region: ${config.region})`,
          };
          results.push({ step: svc.displayName, success: false, note: 'not in marketplace' });
          continue;
        }

        // Check if instance already exists
        const alreadyExists = dryRun ? false : await cfServiceInstanceExists(instanceName, { silent: true });
        if (alreadyExists) {
          spinner.succeed(`${svc.displayName} — instance '${instanceName}' already exists.`);
          updatedServicesState[svc.cfServiceName] = { created: true, keyCreated: false, skipped: false };
          results.push({ step: svc.displayName, success: true, note: 'already exists' });
        } else {
          // Prepare config JSON for xsuaa
          let configJsonArg: string | undefined;
          if (svc.cfServiceName === 'xsuaa') {
            configJsonArg = await prepareXsSecurityJson(workspaceDir, dryRun);
          }

          spinner.text = `Creating ${svc.displayName}...`;

          const created = await cfCreateService(
            svc.cfServiceName,
            svc.cfPlan,
            instanceName,
            configJsonArg,
            { dryRun, throwOnError: false }
          );

          spinner.stop();

          if (created || dryRun) {
            logger.success(`${svc.displayName} created.`);
            updatedServicesState[svc.cfServiceName] = { created: true, keyCreated: false, skipped: false };
            if (!createdServices.includes(svc.cfServiceName)) {
              createdServices.push(svc.cfServiceName);
            }
            results.push({ step: svc.displayName, success: true });
          } else if (svc.trialAvailability === 'limited' && !svc.required) {
            // Limited-availability optional service that failed — treat as skip, not error
            console.log(chalk.yellow(`  ⚠ ${svc.displayName} skipped — ${svc.trialNote}`));
            results.push({ step: svc.displayName, success: true, note: 'skipped — limited availability in Trial' });
          } else {
            results.push({ step: svc.displayName, success: false });
          }
        }

        // Create service key if needed — wait for provisioning first
        if (svc.createServiceKey) {
          const keySpinner = ora(`  Waiting for '${instanceName}' to finish provisioning...`).start();
          if (!dryRun) {
            await cfWaitForService(instanceName, 120_000, { silent: true, throwOnError: false });
          }
          keySpinner.text = `  Creating service key '${svc.defaultKeyName}'...`;
          const keyOk = await cfCreateServiceKey(instanceName, svc.defaultKeyName, { dryRun, throwOnError: false });
          keySpinner.stop();

          if (keyOk || dryRun) {
            logger.success(`  Service key '${svc.defaultKeyName}' ready.`);
            if (updatedServicesState[svc.cfServiceName]) {
              updatedServicesState[svc.cfServiceName]!.keyCreated = true;
            }
          }
        }
      }

      // ── Persist updated state ─────────────────────────────────────────────────
      if (!dryRun) {
        updateConfig({
          setupState: {
            ...config.setupState,
            servicesCreated: createdServices,
            services: updatedServicesState,
            lastSetupAt: new Date().toISOString(),
          },
        }, workspaceDir);
      }

      // ── Summary ───────────────────────────────────────────────────────────────
      logger.blank();
      logger.section('Setup Summary');

      let allOk = true;
      for (const result of results) {
        const icon = result.success ? chalk.green('✔') : chalk.red('✖');
        const note = result.note ? chalk.gray(` (${result.note})`) : '';
        console.log(`  ${icon} ${result.step}${note}`);
        if (!result.success) allOk = false;
      }

      logger.blank();

      if (dryRun) {
        logger.info(chalk.yellow('Dry-run complete. Remove --dry-run to execute.'));
      } else if (allOk) {
        logger.success('BTP environment setup complete!');
        logger.blank();
        console.log(chalk.bold('Next steps:'));
        console.log(chalk.cyan('  1. Run ') + chalk.white('btp-starter-pack validate') + chalk.gray(' — verify everything is working'));
        console.log(chalk.cyan('  2. Run ') + chalk.white('btp-starter-pack generate-project') + chalk.gray(' — create a CAP + UI5 project'));
      } else {
        logger.warn('Setup completed with some failures. Check the log file for details.');
        logger.warn(`Log: ${logger.logFile() ?? 'logs/'}`);
      }

      // ── Manual steps reminder ─────────────────────────────────────────────────
      logger.blank();
      console.log(chalk.yellow.bold('⚠  Don\'t forget these manual steps in SAP BTP Cockpit:'));
      console.log(chalk.yellow('  1. Subscribe to SAP Business Application Studio (free plan)'));
      console.log(chalk.yellow('  2. Assign Role Collection "Business_Application_Studio_Developer" to your user'));
      console.log(chalk.gray(`  → https://account.hanatrial.ondemand.com/`));
    });

  return cmd;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function prepareXsSecurityJson(workspaceDir: string, dryRun: boolean): Promise<string> {
  const xsSecPath = path.join(workspaceDir, 'xs-security.json');
  const projectName = path.basename(workspaceDir).replace(/[^a-zA-Z0-9-_]/g, '-') || 'my-btp-app';

  // Regenerate if the file doesn't exist OR if xsappname is empty/missing
  // (can happen when the file was generated with a variable name mismatch)
  if (fs.existsSync(xsSecPath)) {
    try {
      const existing = fs.readJsonSync(xsSecPath) as Record<string, unknown>;
      if (existing['xsappname'] && String(existing['xsappname']).trim() !== '') {
        logger.debug(`Using existing xs-security.json at ${xsSecPath}`);
        return xsSecPath;
      }
      logger.warn('Existing xs-security.json has empty xsappname — regenerating.');
    } catch {
      logger.warn('Could not parse existing xs-security.json — regenerating.');
    }
  }

  const content = renderTemplate(xsSecurityTemplate, {
    projectName,   // matches {{projectName}} in the template
  });

  if (!dryRun) {
    fs.writeJsonSync(xsSecPath, JSON.parse(content), { spaces: 2 });
    logger.success(`Generated xs-security.json at ${xsSecPath}`);
  } else {
    logger.info(chalk.yellow(`[dry-run] Would generate xs-security.json at ${xsSecPath}`));
  }

  return xsSecPath;
}

// Suppress unused warning — sanitizeForLog is imported for potential future use
void sanitizeForLog;
