/**
 * plan command — show what setup would do without executing anything.
 * This is the mandatory dry-run preview before `setup`.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../core/logger';
import { requireConfig } from '../core/config';
import { cfIsLoggedIn, cfListServices, cfServiceExists } from '../btp/cf-cli';
import { btpIsLoggedIn } from '../btp/btp-cli';
import { filterSelectedServices, BTP_MANUAL_SERVICES } from '../btp/services';

type ActionType = 'AUTO' | 'SEMI' | 'MANUAL' | 'SKIP';

interface PlanAction {
  type: ActionType;
  description: string;
  command?: string;
  note?: string;
}

export function planCommand(): Command {
  const cmd = new Command('plan');
  cmd
    .description('Preview what setup will do — shows all actions without executing them')
    .option('--workspace <dir>', 'Workspace directory', '.')
    .action(async (options: { workspace: string }) => {
      logger.section('btp-starter-pack plan');
      logger.info('Analyzing your BTP environment...');
      logger.blank();

      const config = requireConfig(options.workspace);

      // ── Session status ────────────────────────────────────────────────────────
      const [btpLoggedIn, cfLoggedIn] = await Promise.all([
        btpIsLoggedIn({ silent: true, throwOnError: false }),
        cfIsLoggedIn({ silent: true, throwOnError: false }),
      ]);

      console.log(chalk.bold.cyan('── Session Status '));
      printStatus('SAP BTP CLI session', btpLoggedIn);
      printStatus('CF CLI session', cfLoggedIn);
      logger.blank();

      // ── Existing services check ───────────────────────────────────────────────
      let existingServices: string[] = [];
      if (cfLoggedIn) {
        const existing = await cfListServices({ silent: true, throwOnError: false });
        existingServices = existing.map((s) => s.name);
      }

      // ── Build plan ────────────────────────────────────────────────────────────
      const services = filterSelectedServices(config.servicesEnabled);
      const actions: PlanAction[] = [];

      // CF Environment
      actions.push({
        type: config.setupState.cfEnabled ? 'SKIP' : 'SEMI',
        description: 'Enable Cloud Foundry environment on subaccount',
        command: config.setupState.cfEnabled
          ? undefined
          : `btp create accounts/environment-instance --environment cloudfoundry --service cloudfoundry --plan standard --subaccount <id>`,
        note: config.setupState.cfEnabled
          ? 'Already enabled'
          : 'Semi-automated — if CLI fails, enable manually in Cockpit: Subaccount → Enable Cloud Foundry',
      });

      // CF Space
      actions.push({
        type: config.setupState.cfSpaceCreated ? 'SKIP' : 'AUTO',
        description: `Create CF space '${config.cfSpace}'`,
        command: `cf create-space ${config.cfSpace}`,
        note: config.setupState.cfSpaceCreated ? 'Already created' : undefined,
      });

      // Services
      for (const svc of services) {
        const instanceName = `${svc.defaultInstanceName}`;
        const exists = existingServices.includes(instanceName);
        const available = await (cfLoggedIn ? cfServiceExists(svc.cfServiceName, { silent: true, throwOnError: false }) : Promise.resolve(null));

        let configNote = '';
        if (svc.cfServiceName === 'xsuaa') {
          configNote = ' -c xs-security.json';
        }

        actions.push({
          type: exists ? 'SKIP' : 'AUTO',
          description: `Create service instance: ${svc.displayName}`,
          command: `cf create-service ${svc.cfServiceName} ${svc.cfPlan} ${instanceName}${configNote}`,
          note: exists
            ? `Already exists as '${instanceName}'`
            : available === false
              ? `⚠ Service '${svc.cfServiceName}' not found in marketplace — may not be available in this region`
              : svc.trialNote,
        });

        if (svc.createServiceKey && !exists) {
          actions.push({
            type: 'AUTO',
            description: `Create service key: ${svc.defaultKeyName} for ${instanceName}`,
            command: `cf create-service-key ${instanceName} ${svc.defaultKeyName}`,
          });
        }
      }

      // ── Print plan ────────────────────────────────────────────────────────────
      console.log(chalk.bold.cyan('── Automated Actions (CLI) '));
      printActions(actions.filter((a) => a.type === 'AUTO'));

      logger.blank();
      console.log(chalk.bold.cyan('── Semi-Automated (may need manual fallback) '));
      printActions(actions.filter((a) => a.type === 'SEMI'));

      logger.blank();
      console.log(chalk.bold.cyan('── Already done / Skipped '));
      printActions(actions.filter((a) => a.type === 'SKIP'));

      // ── Manual actions (always) ───────────────────────────────────────────────
      logger.blank();
      console.log(chalk.bold.yellow('── ⚠  Required Manual Actions in SAP BTP Cockpit '));
      console.log(chalk.gray('   These CANNOT be automated. You must do them manually.'));
      logger.blank();

      const manualActions = [
        {
          step: '1',
          title: 'Subscribe to SAP Business Application Studio',
          path: 'Cockpit → Subaccount → Service Marketplace → SAP Business Application Studio → Subscribe (free plan)',
        },
        {
          step: '2',
          title: 'Assign Role Collection to yourself',
          path: 'Cockpit → Subaccount → Security → Role Collections → Business_Application_Studio_Developer → Add yourself',
        },
        {
          step: '3',
          title: '(Optional) Subscribe to SAP Launchpad',
          path: 'Cockpit → Subaccount → Service Marketplace → Launchpad → Subscribe (standard plan)',
        },
        {
          step: '4',
          title: '(Optional) Subscribe to SAP Build Process Automation',
          path: 'Cockpit → Subaccount → Service Marketplace → SAP Build Process Automation → Subscribe (free plan)',
          note: 'Availability varies by region',
        },
      ];

      for (const action of manualActions) {
        console.log(chalk.yellow.bold(`  [${action.step}] ${action.title}`));
        console.log(chalk.gray(`      ${action.path}`));
        if (action.note) console.log(chalk.gray(`      Note: ${action.note}`));
        logger.blank();
      }

      // ── Not available in Trial ─────────────────────────────────────────────
      console.log(chalk.bold.red('── ✖ Not Available in BTP Trial (excluded from setup) '));
      for (const svc of BTP_MANUAL_SERVICES) {
        console.log(chalk.red(`  • ${svc.name}`));
        console.log(chalk.gray(`    ${svc.reason}`));
      }

      logger.blank();
      console.log(chalk.bold('To execute this plan:'));
      console.log(chalk.cyan('  btp-starter-pack setup'));
    });

  return cmd;
}

function printStatus(label: string, ok: boolean): void {
  const icon = ok ? chalk.green('✔') : chalk.red('✖');
  const status = ok ? chalk.green('Active') : chalk.red('Not logged in');
  console.log(`  ${icon} ${label.padEnd(30)} ${status}`);
}

function printActions(actions: PlanAction[]): void {
  if (actions.length === 0) {
    console.log(chalk.gray('  (none)'));
    return;
  }
  for (const action of actions) {
    const typeColor =
      action.type === 'AUTO' ? chalk.green :
      action.type === 'SEMI' ? chalk.yellow :
      chalk.gray;

    console.log(typeColor(`  [${action.type}] ${action.description}`));
    if (action.command) {
      console.log(chalk.gray(`         → ${action.command}`));
    }
    if (action.note) {
      console.log(chalk.gray(`         ℹ ${action.note}`));
    }
  }
}
