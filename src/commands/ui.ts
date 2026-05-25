/**
 * ui command — launch the local web UI wizard.
 *
 * Starts an Express server on localhost and opens the browser automatically.
 * The server binds to 127.0.0.1 only — never reachable from outside the machine.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import os from 'os';
import open from 'open';
import { logger } from '../core/logger';
import { startServer, DEFAULT_PORT, HOST } from '../ui-server/server';

export function uiCommand(): Command {
  const cmd = new Command('ui');
  cmd
    .description('Launch the interactive web UI wizard (opens in your browser)')
    .option('--workspace <dir>', 'Workspace directory for the wizard', '.')
    .option('--port <port>', 'Port for the local server', String(DEFAULT_PORT))
    .option('--no-open', 'Start server without opening browser')
    .action(async (options: { workspace: string; port: string; open: boolean }) => {
      const port = parseInt(options.port, 10);

      if (isNaN(port) || port < 1024 || port > 65535) {
        logger.error(`Invalid port: ${options.port}. Must be between 1024 and 65535.`);
        process.exit(1);
      }

      // Expand ~ to home directory (path.resolve does not do this on Windows)
      const rawWs = options.workspace;
      const expandedWs =
        rawWs === '~' ? os.homedir()
        : rawWs.startsWith('~/') || rawWs.startsWith('~\\')
        ? path.join(os.homedir(), rawWs.slice(2))
        : rawWs;
      const workspaceDir = path.resolve(expandedWs);
      const url = `http://${HOST}:${port}?workspace=${encodeURIComponent(workspaceDir)}`;

      logger.blank();
      console.log(chalk.bold.cyan('  BTP Starter Pack — Web UI'));
      logger.blank();
      console.log(chalk.white(`  Workspace: ${workspaceDir}`));
      console.log(chalk.white(`  Server:    http://${HOST}:${port}`));
      logger.blank();

      try {
        await startServer(port);
        logger.success(`Server running at http://${HOST}:${port}`);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : 'Failed to start server');
        process.exit(1);
      }

      if (options.open !== false) {
        console.log(chalk.gray('  Opening browser...'));
        try {
          // open() with URL validation — only localhost URLs
          const parsed = new URL(url);
          if (parsed.hostname !== HOST && parsed.hostname !== 'localhost') {
            throw new Error('Invalid host');
          }
          await open(url);
        } catch {
          // Browser open failed — not critical, user can open manually
          console.log(chalk.yellow(`  Could not open browser automatically.`));
          console.log(chalk.cyan(`  → Open manually: ${url}`));
        }
      } else {
        console.log(chalk.cyan(`  → Open in browser: ${url}`));
      }

      logger.blank();
      console.log(chalk.gray('  Press Ctrl+C to stop the server.'));
      logger.blank();

      // Keep process alive
      process.on('SIGINT', () => {
        logger.blank();
        logger.info('Server stopped.');
        process.exit(0);
      });
    });

  return cmd;
}
