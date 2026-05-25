/**
 * validate command — verify the BTP environment is correctly configured.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../core/logger';
import { requireConfig } from '../core/config';
import { btpIsLoggedIn, btpListSubaccounts, btpGetInfo } from '../btp/btp-cli';
import { cfIsLoggedIn, cfGetTarget, cfListServices, cfListApps } from '../btp/cf-cli';
import { BTP_SERVICES } from '../btp/services';

interface ValidationResult {
  check: string;
  passed: boolean;
  detail?: string;
  hint?: string;
}

export function validateCommand(): Command {
  const cmd = new Command('validate');
  cmd
    .description('Validate that the BTP environment is correctly configured and ready for development')
    .option('--workspace <dir>', 'Workspace directory', '.')
    .action(async (options: { workspace: string }) => {
      logger.section('btp-starter-pack validate');
      logger.info('Running validation checks...');
      logger.blank();

      const workspaceDir = path.resolve(options.workspace);
      const config = requireConfig(workspaceDir);
      const results: ValidationResult[] = [];

      // ── Check 1: BTP CLI session ────────────────────────────────────────────
      await runCheck('BTP CLI session active', results, async () => {
        const ok = await btpIsLoggedIn({ silent: true, throwOnError: false });
        return {
          passed: ok,
          hint: ok ? undefined : 'Run: btp-starter-pack login',
        };
      });

      // ── Check 2: CF CLI session ──────────────────────────────────────────────
      await runCheck('CF CLI session active', results, async () => {
        const ok = await cfIsLoggedIn({ silent: true, throwOnError: false });
        return {
          passed: ok,
          hint: ok ? undefined : 'Run: btp-starter-pack login',
        };
      });

      // ── Check 3: CF target org/space ─────────────────────────────────────────
      await runCheck('CF target (org + space)', results, async () => {
        const target = await cfGetTarget({ silent: true, throwOnError: false });
        if (!target || !target.org) {
          return { passed: false, hint: `Run: cf target -o ${config.cfOrg ?? '<org>'} -s ${config.cfSpace}` };
        }
        return {
          passed: true,
          detail: `org=${target.org}, space=${target.space}, user=${target.user}`,
        };
      });

      // ── Check 4: BTP Subaccount accessible ───────────────────────────────────
      // Primary: use btp --info (always works when session is active).
      // Secondary: try to list subaccounts for richer detail (may fail in some Trial setups).
      await runCheck('BTP Subaccount accessible', results, async () => {
        const info = await btpGetInfo({ silent: true, throwOnError: false });
        if (info) {
          return { passed: true, detail: info };
        }
        // Fallback: try listing subaccounts
        const subaccounts = await btpListSubaccounts({ silent: true, throwOnError: false });
        if (subaccounts.length > 0) {
          const trial = subaccounts.find((s) => s.displayName?.toLowerCase().includes('trial')) ?? subaccounts[0];
          return {
            passed: true,
            detail: trial ? `${trial.displayName} (${trial.region})` : `${subaccounts.length} subaccount(s) found`,
          };
        }
        return { passed: false, hint: 'Verify BTP login: btp --info' };
      });

      // ── Check 5: Required CF services ────────────────────────────────────────
      const cfServices = await cfListServices({ silent: true, throwOnError: false });
      const cfServiceNames = cfServices.map((s) => s.name);

      for (const serviceName of config.servicesEnabled) {
        const instanceName = `${serviceName}-instance`;
        // Skip validation for services marked as 'limited' availability — they may be
        // intentionally absent on Trial accounts that lack the required entitlement.
        const catalog = BTP_SERVICES.find((s) => s.cfServiceName === serviceName);
        if (catalog?.trialAvailability === 'limited') {
          const exists = cfServiceNames.includes(instanceName);
          await runCheck(`CF service instance: ${instanceName}`, results, async () => ({
            passed: true, // limited services are best-effort — don't block validation
            detail: exists ? `plan: ${cfServices.find((s) => s.name === instanceName)?.plan ?? 'unknown'}` : 'skipped (limited Trial availability)',
          }));
          continue;
        }

        await runCheck(`CF service instance: ${instanceName}`, results, async () => {
          const exists = cfServiceNames.includes(instanceName);
          return {
            passed: exists,
            detail: exists ? `plan: ${cfServices.find((s) => s.name === instanceName)?.plan ?? 'unknown'}` : undefined,
            hint: exists ? undefined : `Run: btp-starter-pack setup  (or: cf create-service ${serviceName} <plan> ${instanceName})`,
          };
        });
      }

      // ── Check 6: Config file ──────────────────────────────────────────────────
      await runCheck('Config file (.btp-starter.json)', results, async () => {
        const configPath = path.join(workspaceDir, '.btp-starter.json');
        const exists = fs.existsSync(configPath);
        return {
          passed: exists,
          detail: exists ? `email: ${config.email}, region: ${config.region}` : undefined,
          hint: exists ? undefined : 'Run: btp-starter-pack init',
        };
      });

      // ── Check 7: xs-security.json ─────────────────────────────────────────────
      await runCheck('xs-security.json present', results, async () => {
        const xsPath = path.join(workspaceDir, 'xs-security.json');
        const exists = fs.existsSync(xsPath);
        return {
          passed: exists,
          hint: exists ? undefined : 'Run: btp-starter-pack setup  (will generate xs-security.json)',
        };
      });

      // ── Check 8: CF apps (informational) ─────────────────────────────────────
      await runCheck('CF applications', results, async () => {
        const apps = await cfListApps({ silent: true, throwOnError: false });
        return {
          passed: true, // informational only
          detail: apps.length === 0 ? 'No apps deployed yet' : `${apps.length} app(s): ${apps.map((a) => a.name).join(', ')}`,
        };
      });

      // ── Print results ─────────────────────────────────────────────────────────
      logger.blank();
      console.log(
        chalk.bold(`${'Status'.padEnd(8)} ${'Check'.padEnd(40)} ${'Detail'}`)
      );
      console.log(chalk.gray('─'.repeat(80)));

      let failed = 0;
      let warnings = 0;

      for (const result of results) {
        const icon = result.passed ? chalk.green('✔') : chalk.red('✖');
        const checkStr = result.check.padEnd(40);
        const detailStr = result.detail ? chalk.gray(result.detail.substring(0, 40)) : '';

        console.log(`${icon}       ${checkStr} ${detailStr}`);

        if (!result.passed) {
          failed++;
          if (result.hint) {
            console.log(chalk.gray(`         Hint: ${result.hint}`));
          }
        }
      }

      logger.blank();

      if (failed === 0) {
        logger.success('All validation checks passed! Your BTP environment is ready.');
        logger.blank();
        console.log(chalk.bold('Your environment is ready. You can now:'));
        console.log(chalk.cyan('  • Generate a project: ') + chalk.white('btp-starter-pack generate-project'));
        console.log(chalk.cyan('  • Open Business Application Studio and start developing'));
      } else if (failed <= 2) {
        logger.warn(`${failed} check(s) failed. Review the hints above.`);
        warnings++;
      } else {
        logger.error(`${failed} validation checks failed. Run setup again or check manually.`);
      }

      void warnings;
    });

  return cmd;
}

async function runCheck(
  name: string,
  results: ValidationResult[],
  checkFn: () => Promise<{ passed: boolean; detail?: string; hint?: string }>
): Promise<void> {
  const spinner = ora(name).start();
  try {
    const result = await checkFn();
    spinner.stop();
    results.push({ check: name, ...result });
  } catch {
    spinner.stop();
    results.push({ check: name, passed: false, hint: 'Unexpected error — see log file' });
  }
}
