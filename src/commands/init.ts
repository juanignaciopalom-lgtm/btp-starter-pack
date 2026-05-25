/**
 * init command — set up the local workspace configuration.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../core/logger';
import { writeConfig, CF_API_URLS, type BTPRegion } from '../core/config';
import { promptEmail, promptRegion, promptText_CfSpace, promptText, confirmAction } from '../core/prompts';
import { BTP_SERVICES } from '../btp/services';

export function initCommand(): Command {
  const cmd = new Command('init');
  cmd
    .description('Initialize workspace configuration for SAP BTP development')
    .option('--email <email>', 'SAP BTP account email')
    .option('--region <region>', 'BTP Trial region (e.g. eu10, us10)')
    .option('--workspace <dir>', 'Workspace directory', '.')
    .option('--dry-run', 'Show what would be created without writing files')
    .action(async (options: { email?: string; region?: string; workspace: string; dryRun?: boolean }) => {
      logger.section('btp-starter-pack init');

      const dryRun = options.dryRun ?? false;
      const workspaceDir = path.resolve(options.workspace);

      // ── Check if already initialized ────────────────────────────────────────
      const configPath = path.join(workspaceDir, '.btp-starter.json');
      if (fs.existsSync(configPath)) {
        const overwrite = await confirmAction(
          `A config file already exists at ${configPath}. Overwrite?`,
          false
        );
        if (!overwrite) {
          logger.info('Initialization cancelled. Existing config preserved.');
          return;
        }
      }

      // ── Gather inputs ────────────────────────────────────────────────────────
      logger.blank();
      console.log(chalk.cyan('Let\'s set up your BTP workspace. You\'ll need:'));
      console.log(chalk.gray('  • Your SAP BTP Trial email address'));
      console.log(chalk.gray('  • The region where you created your Trial account'));
      logger.blank();

      const email = options.email ?? (await promptEmail());
      const region = (options.region as BTPRegion | undefined) ?? (await promptRegion());
      const cfApiEndpoint = CF_API_URLS[region];
      const cfSpace = await promptText_CfSpace('dev');
      const globalAccountSubdomain = await promptText(
        'Global Account subdomain (found in BTP Cockpit → Global Account → General → Subdomain):',
        'trial',
        (input) => input.trim().length > 0 ? true : 'Subdomain is required'
      );

      // ── Show plan ────────────────────────────────────────────────────────────
      logger.blank();
      console.log(chalk.bold.cyan('── Workspace configuration '));
      console.log(chalk.white(`  Email:              ${email}`));
      console.log(chalk.white(`  Region:             ${region}`));
      console.log(chalk.white(`  CF API Endpoint:    ${cfApiEndpoint}`));
      console.log(chalk.white(`  CF Space:           ${cfSpace}`));
      console.log(chalk.white(`  Subdomain:          ${globalAccountSubdomain}`));
      console.log(chalk.white(`  Workspace dir:      ${workspaceDir}`));
      logger.blank();

      const defaultServices = BTP_SERVICES.filter((s) => s.required || s.trialAvailability === 'available')
        .map((s) => s.cfServiceName);

      if (dryRun) {
        logger.info(chalk.yellow('[dry-run] Would create:'));
        logger.info(`  • Config: ${configPath}`);
        logger.info(`  • Directory: ${workspaceDir}`);
        logger.info(`  • Services to enable: ${defaultServices.join(', ')}`);
        return;
      }

      // ── Create workspace ─────────────────────────────────────────────────────
      fs.ensureDirSync(workspaceDir);

      writeConfig(
        {
          version: '1.0.0',
          email,
          region,
          globalAccountSubdomain,
          cfApiEndpoint,
          cfOrg: `${globalAccountSubdomain}trial`,
          cfSpace,
          workspaceDir: '.',
          servicesEnabled: defaultServices,
          dryRun: false,
          setupState: {
            cfEnabled: false,
            cfSpaceCreated: false,
            servicesCreated: [],
            services: {},
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        workspaceDir
      );

      // ── Create .gitignore if missing ─────────────────────────────────────────
      const gitignorePath = path.join(workspaceDir, '.gitignore');
      if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(
          gitignorePath,
          [
            '# BTP credentials — NEVER commit',
            '.env',
            '*service-key*.json',
            '*credentials*.json',
            'service-keys/',
            '',
            '# BTP/CF sessions',
            '.btp/',
            '.cf/',
            '',
            '# Logs',
            'logs/',
            '*.log',
            '',
            'node_modules/',
          ].join('\n')
        );
        logger.success('.gitignore created');
      }

      // ── Create logs directory ────────────────────────────────────────────────
      fs.ensureDirSync(path.join(workspaceDir, 'logs'));

      logger.blank();
      logger.success(`Workspace initialized at ${workspaceDir}`);
      logger.blank();

      console.log(chalk.bold('Next steps:'));
      console.log(chalk.cyan('  1. Run ') + chalk.white('btp-starter-pack doctor') + chalk.gray(' — verify all tools are installed'));
      console.log(chalk.cyan('  2. Run ') + chalk.white('btp-starter-pack login') + chalk.gray(' — authenticate with SAP BTP'));
      console.log(chalk.cyan('  3. Run ') + chalk.white('btp-starter-pack plan') + chalk.gray(' — preview what will be created'));
      console.log(chalk.cyan('  4. Run ') + chalk.white('btp-starter-pack setup') + chalk.gray(' — create services and configure environment'));
      logger.blank();

      console.log(chalk.yellow.bold('⚠  Manual steps required in SAP BTP Cockpit:'));
      console.log(chalk.yellow('  • Subscribe to SAP Business Application Studio'));
      console.log(chalk.yellow('  • Assign Role Collection "Business_Application_Studio_Developer" to yourself'));
      console.log(chalk.yellow('  • (Optional) Subscribe to SAP Launchpad or SAP Build Process Automation'));
      console.log(chalk.gray(`\n  Cockpit URL: https://account.hanatrial.ondemand.com/`));
    });

  return cmd;
}
