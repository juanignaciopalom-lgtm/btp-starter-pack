/**
 * doctor command — verify local development dependencies.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { toolExists, getToolVersion, type AllowedExecutable } from '../core/runner';
import { getInstallInstruction } from '../core/platform';
import { logger } from '../core/logger';

interface ToolCheck {
  name: string;
  executable: string;
  required: boolean;
  versionArg?: string;
  minVersionHint?: string;
  description: string;
}

const TOOLS_TO_CHECK: ToolCheck[] = [
  {
    name: 'Node.js',
    executable: 'node',
    required: true,
    versionArg: '--version',
    minVersionHint: '18.x LTS',
    description: 'JavaScript runtime required for BTP development',
  },
  {
    name: 'npm',
    executable: 'npm',
    required: true,
    versionArg: '--version',
    minVersionHint: '9.x',
    description: 'Node.js package manager',
  },
  {
    name: 'Git',
    executable: 'git',
    required: true,
    versionArg: '--version',
    minVersionHint: '2.x',
    description: 'Version control — required for all BTP projects',
  },
  {
    name: 'CF CLI',
    executable: 'cf',
    required: true,
    versionArg: '--version',
    minVersionHint: '8.x',
    description: 'Cloud Foundry CLI — required for deploying to BTP CF environment',
  },
  {
    name: 'SAP BTP CLI',
    executable: 'btp',
    required: true,
    versionArg: '--version',
    minVersionHint: '2.x',
    description: 'SAP BTP CLI — required for managing subaccounts and entitlements',
  },
  {
    name: 'SAP CDS CLI (@sap/cds-dk)',
    executable: 'cds',
    required: false,
    versionArg: '--version',
    minVersionHint: '7.x',
    description: 'Required for CAP (Cloud Application Programming Model) projects',
  },
  {
    name: 'SAP UI5 CLI (@ui5/cli)',
    executable: 'ui5',
    required: false,
    versionArg: '--version',
    minVersionHint: '3.x',
    description: 'Required for SAPUI5/Fiori application development',
  },
  {
    name: 'MBT (Cloud MTA Build Tool)',
    executable: 'mbt',
    required: false,
    versionArg: '--version',
    minVersionHint: '1.2.x',
    description: 'Required for building and deploying MTA archives to BTP',
  },
  {
    name: 'Docker',
    executable: 'docker',
    required: false,
    versionArg: '--version',
    minVersionHint: '20.x',
    description: 'Optional — useful for local SAP HANA, PostgreSQL containers',
  },
];

export function doctorCommand(): Command {
  const cmd = new Command('doctor');
  cmd
    .description('Verify local development dependencies required for SAP BTP development')
    .option('--fix', 'Show fix instructions for missing tools')
    .action(async (options: { fix?: boolean }) => {
      logger.section('btp-starter-pack doctor');
      logger.info('Checking local development dependencies...');
      logger.blank();

      const results: Array<{ tool: ToolCheck; found: boolean; version: string | null }> = [];

      for (const tool of TOOLS_TO_CHECK) {
        const spinner = ora(`Checking ${tool.name}...`).start();
        const found = await toolExists(tool.executable as AllowedExecutable);
        let version: string | null = null;

        if (found && tool.versionArg) {
          version = await getToolVersion(tool.executable as AllowedExecutable, tool.versionArg);
        }

        spinner.stop();
        results.push({ tool, found, version });
      }

      // ── Print results table ──────────────────────────────────────────────────
      logger.blank();
      console.log(
        chalk.bold(
          `${'Status'.padEnd(8)} ${'Tool'.padEnd(30)} ${'Version'.padEnd(20)} ${'Required'}`
        )
      );
      console.log(chalk.gray('─'.repeat(75)));

      const missing: typeof results = [];

      for (const { tool, found, version } of results) {
        const icon = found ? chalk.green('✔') : tool.required ? chalk.red('✖') : chalk.yellow('⚠');
        const nameStr = chalk.white(tool.name.padEnd(30));
        const versionStr = (version ?? (found ? 'found' : 'not found')).padEnd(20);
        const versionColored = found ? chalk.green(versionStr) : chalk.red(versionStr);
        const requiredStr = tool.required ? chalk.red('required') : chalk.gray('optional');

        console.log(`${icon}       ${nameStr} ${versionColored} ${requiredStr}`);

        if (!found) missing.push({ tool, found, version });
      }

      logger.blank();

      // ── Summary ──────────────────────────────────────────────────────────────
      const requiredMissing = missing.filter(({ tool }) => tool.required);
      const optionalMissing = missing.filter(({ tool }) => !tool.required);

      if (requiredMissing.length === 0 && optionalMissing.length === 0) {
        logger.success('All dependencies are installed! Your environment is ready.');
        return;
      }

      if (requiredMissing.length > 0) {
        logger.blank();
        console.log(chalk.red.bold(`✖ Missing required tools (${requiredMissing.length}):`));
        for (const { tool } of requiredMissing) {
          console.log(chalk.red(`  • ${tool.name}: ${tool.description}`));
        }
      }

      if (optionalMissing.length > 0) {
        logger.blank();
        console.log(chalk.yellow.bold(`⚠ Missing optional tools (${optionalMissing.length}):`));
        for (const { tool } of optionalMissing) {
          console.log(chalk.yellow(`  • ${tool.name}: ${tool.description}`));
        }
      }

      // ── Install instructions ─────────────────────────────────────────────────
      if (options.fix || missing.length > 0) {
        logger.blank();
        console.log(chalk.bold.cyan('── Install Instructions '));
        for (const { tool } of missing) {
          const instruction = getInstallInstruction(tool.executable);
          console.log(chalk.white.bold(`\n  ${tool.name}:`));
          console.log(chalk.gray(`  ${instruction}`));
          const hints = {
            node: '  https://nodejs.org/en/download',
            cf: '  https://github.com/cloudfoundry/cli/releases/latest',
            btp: '  https://tools.hana.ondemand.com/#cloud',
            cds: '  https://cap.cloud.sap/docs/get-started/',
            ui5: '  https://sap.github.io/ui5-tooling/',
            mbt: '  https://sap.github.io/cloud-mta-build-tool/',
            git: '  https://git-scm.com/downloads',
            docker: '  https://www.docker.com/products/docker-desktop/',
          };
          const link = hints[tool.executable as keyof typeof hints];
          if (link) console.log(chalk.blue(link));
        }
      }

      if (requiredMissing.length > 0) {
        logger.blank();
        logger.warn('Install the required tools before running `btp-starter-pack init`.');
        process.exit(1);
      }
    });

  return cmd;
}
