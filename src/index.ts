#!/usr/bin/env node
/**
 * btp-starter-pack — CLI entry point
 *
 * Prepares a SAP BTP Trial account for development in Business Application Studio.
 */

import { Command, CommanderError } from 'commander';
import chalk from 'chalk';
import { initLogger } from './core/logger';
import { doctorCommand } from './commands/doctor';
import { initCommand } from './commands/init';
import { loginCommand } from './commands/login';
import { planCommand } from './commands/plan';
import { setupCommand } from './commands/setup';
import { validateCommand } from './commands/validate';
import { generateProjectCommand } from './commands/generate-project';
import { cleanCommand } from './commands/clean';
import { uiCommand } from './commands/ui';
import { deployCommand } from './commands/deploy';

const program = new Command();

program
  .name('btp-starter-pack')
  .description(
    chalk.cyan('SAP BTP Trial Starter Pack') +
    '\nAutomates the setup of a SAP BTP Trial account for development in Business Application Studio.'
  )
  .version('1.0.0')
  .option('--dry-run', 'Show what would be executed without making any changes', false)
  .option('--log-level <level>', 'Log level: debug | info | warn | error', 'info')
  .option('--log-file <path>', 'Path to log file')
  .option('--no-color', 'Disable colored output')
  .hook('preAction', (thisCommand: Command) => {
    const opts = thisCommand.opts<{ logLevel: string; logFile?: string; color: boolean }>();
    initLogger({
      logLevel: opts.logLevel,
      logFile: opts.logFile,
      noColor: !opts.color,
    });
  });

// Register commands
program.addCommand(doctorCommand());
program.addCommand(initCommand());
program.addCommand(loginCommand());
program.addCommand(planCommand());
program.addCommand(setupCommand());
program.addCommand(validateCommand());
program.addCommand(generateProjectCommand());
program.addCommand(cleanCommand());
program.addCommand(deployCommand());
program.addCommand(uiCommand());

// ── Error handling ────────────────────────────────────────────────────────────
program.exitOverride((err: CommanderError) => {
  if (err.code !== 'commander.helpDisplayed' && err.code !== 'commander.version') {
    // CWE-209: Show friendly error, not raw Commander internals
    console.error(chalk.red(`\nError: ${err.message}`));
    console.error(chalk.gray('Run with --help for usage information.'));
  }
  process.exit(err.exitCode ?? 1);
});

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`\nUnexpected error: ${message}`));
  console.error(chalk.gray('Check the log file for more details.'));
  process.exit(1);
});
