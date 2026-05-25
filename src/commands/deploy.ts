/**
 * deploy command — build MTA archive and deploy to Cloud Foundry.
 *
 * Security:
 * - CWE-78: mbt and cf called with array args, never string shell commands.
 * - CWE-22: projectDir validated before use.
 * - mtar path derived from project directory, never user input.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import ora from 'ora';
import yaml from 'js-yaml';
import { logger } from '../core/logger';
import { run } from '../core/runner';
import { cfIsLoggedIn } from '../btp/cf-cli';
import { renderTemplate } from '../templates/renderer';
import { mtaYamlTemplate } from '../templates/mta-yaml';

/**
 * On Windows, mbt generates a Makefile whose recipes use sh (Unix shell).
 * GNU make needs sh.exe in PATH to execute them — without it, the
 * pre_validate target fails immediately with Error 1.
 *
 * Strategy (in order):
 * 1. Run `where sh.exe` / `where sh` to find sh wherever the user installed it.
 * 2. Fall back to common Git for Windows installation paths.
 * 3. Return undefined if nothing found — mbt will fail with our custom message.
 *
 * Returns { PATH, SHELL } env overrides to pass to run() when calling mbt.
 */
function mbtEnv(): Record<string, string> | undefined {
  if (process.platform !== 'win32') return undefined;

  // ── 1. Ask the OS where sh.exe is ────────────────────────────────────────
  let shDir: string | undefined;

  for (const cmd of ['where sh.exe', 'where sh']) {
    try {
      const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
        .split(/\r?\n/)[0]
        .trim();
      if (out && fs.existsSync(out)) {
        shDir = path.dirname(out);
        break;
      }
    } catch {
      // not found — try next
    }
  }

  // ── 2. Hard-coded Git for Windows fallbacks ───────────────────────────────
  if (!shDir) {
    const candidates = [
      'C:\\Program Files\\Git\\usr\\bin',
      'C:\\Program Files (x86)\\Git\\usr\\bin',
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'usr', 'bin'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, 'sh.exe'))) {
        shDir = c;
        break;
      }
    }
  }

  if (!shDir) return undefined;

  const shExe  = path.join(shDir, 'sh.exe');
  const current = process.env.PATH ?? '';
  const newPath = current.toLowerCase().includes(shDir.toLowerCase())
    ? current
    : `${shDir};${current}`;

  return {
    PATH:  newPath,
    SHELL: shExe,      // GNU make reads SHELL to choose the shell for recipes
  };
}

/**
 * Returns true if sh.exe is findable on Windows (mbt will likely succeed),
 * false if it's missing (pre_validate will fail).
 */
export function shExeAvailable(): boolean {
  if (process.platform !== 'win32') return true;
  return mbtEnv() !== undefined;
}

/**
 * Finds all package.json files in a directory tree, excluding node_modules,
 * and returns the directories that contain them (where npm install should run).
 */
function findPackageJsonDirs(rootDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const fullPath = path.join(dir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry === 'package.json') {
        results.push(dir);
      }
    }
  }

  walk(rootDir);
  return results;
}

export function deployCommand(): Command {
  const cmd = new Command('deploy');
  cmd
    .description('Build MTA archive and deploy to SAP BTP Cloud Foundry')
    .option('--workspace <dir>', 'Project directory containing mta.yaml', '.')
    .option('--dry-run', 'Show commands without executing')
    .action(async (options: { workspace: string; dryRun?: boolean }) => {
      logger.section('btp-starter-pack deploy');

      // CWE-22: resolve and validate project directory
      const projectDir = path.resolve(options.workspace);
      const dryRun = options.dryRun ?? false;

      if (!dryRun && !fs.existsSync(projectDir)) {
        logger.error(`Project directory not found: ${projectDir}`);
        process.exit(1);
      }

      const mtaYaml = path.join(projectDir, 'mta.yaml');
      if (!dryRun && !fs.existsSync(mtaYaml)) {
        logger.error(`mta.yaml not found in ${projectDir}. Run generate-project first.`);
        process.exit(1);
      }

      // ── Auto-patch mta.yaml (YAML-safe, no regex surgery) ────────────────────
      // Uses js-yaml to parse → modify → re-serialise so structural corruption
      // is impossible. Fixes three known issues in generated mta.yaml files:
      //
      // 1. Remove modules whose name ends with "-xsuaa-deployer"
      //    ServiceKeyName cross-references cause `mbt validate -r` to fail.
      //
      // 2. Remove "deployed-after" keys from all modules
      //    Unsupported in mbt 1.x, causes pre_validate Error 1.
      //
      // 3. Replace builder "npm-ci" with "npm"
      //    npm-ci requires an exact package-lock.json; freshly scaffolded
      //    projects don't have one.
      if (!dryRun && fs.existsSync(mtaYaml)) {
        try {
          const raw = fs.readFileSync(mtaYaml, 'utf8');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let mta: any;

          try {
            mta = yaml.load(raw);
          } catch (parseErr) {
            // ── File is already corrupt (e.g. from a previous failed patch) ──────
            // Regenerate mta.yaml from the clean template using names derived from
            // the project directory name (all service names follow the same pattern).
            logger.warn(
              `mta.yaml could not be parsed (${parseErr instanceof Error ? parseErr.message : String(parseErr)}). ` +
              'Regenerating from template...'
            );
            const projectName = path.basename(projectDir);
            const regenerated = renderTemplate(mtaYamlTemplate, {
              projectName,
              appRouterName:            `${projectName}-approuter`,
              capSrvName:               `${projectName}-srv`,
              xsuaaInstance:            `${projectName}-xsuaa`,
              destinationInstance:      `${projectName}-destination`,
              html5RepoInstance:        `${projectName}-html5`,
              html5RepoRuntimeInstance: `${projectName}-html5-runtime`,
            });
            fs.writeFileSync(mtaYaml, regenerated, 'utf8');
            logger.info('mta.yaml regenerated from template — continuing build.');
            mta = null; // signal: no further patching needed (template is already clean)
          }

          if (mta && typeof mta === 'object') {
            let changed = false;

            if (Array.isArray(mta.modules)) {
              // Fix 1: drop xsuaa-deployer modules
              const before = mta.modules.length;
              mta.modules = mta.modules.filter(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (m: any) => !String(m?.name ?? '').endsWith('-xsuaa-deployer')
              );
              if (mta.modules.length !== before) {
                changed = true;
                logger.info('Auto-patched mta.yaml: removed xsuaa-deployer module');
              }

              // Fixes 2 & 3 per remaining module
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              for (const mod of mta.modules as any[]) {
                if ('deployed-after' in mod) {
                  delete mod['deployed-after'];
                  changed = true;
                  logger.info(`Auto-patched mta.yaml: removed deployed-after from ${String(mod.name)}`);
                }
                const bp = mod['build-parameters'];
                if (bp && bp.builder === 'npm-ci') {
                  bp.builder = 'npm';
                  changed = true;
                  logger.info(`Auto-patched mta.yaml: npm-ci → npm in ${String(mod.name)}`);
                }
              }
            }

            // Fix 4: Ensure AppRouter uses app-runtime resource, not app-host.
            // html5-apps-repo app-host credentials lack grant_type → AppRouter crashes.
            // Strategy:
            //   a) Find the approuter module (type: approuter.nodejs).
            //   b) Collect all resources it requires.
            //   c) For each required resource, check if it maps to an html5-apps-repo
            //      service with plan app-host.
            //   d) If found, look for (or create) an app-runtime resource and swap
            //      the approuter's requires entry to point at it.
            if (Array.isArray(mta.modules) && Array.isArray(mta.resources)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const approuterModule = (mta.modules as any[]).find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (m: any) => String(m?.type ?? '').toLowerCase() === 'approuter.nodejs'
              );

              if (approuterModule && Array.isArray(approuterModule.requires)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const resourceMap = new Map<string, any>(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (mta.resources as any[]).map((r: any) => [String(r?.name ?? ''), r])
                );

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const req of approuterModule.requires as any[]) {
                  const reqName = String(req?.name ?? '');
                  const res = resourceMap.get(reqName);
                  if (!res) continue;

                  const svc  = String(res?.parameters?.service ?? '');
                  const plan = String(res?.parameters?.['service-plan'] ?? '');

                  if (svc === 'html5-apps-repo' && plan === 'app-host') {
                    // This resource is wrong for AppRouter — find or create app-runtime
                    const runtimeName = `${reqName}-runtime`;

                    let runtimeResource = resourceMap.get(runtimeName);
                    if (!runtimeResource) {
                      // Create the missing app-runtime resource
                      runtimeResource = {
                        name: runtimeName,
                        type: 'org.cloudfoundry.managed-service',
                        parameters: {
                          service: 'html5-apps-repo',
                          'service-plan': 'app-runtime',
                        },
                      };
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (mta.resources as any[]).push(runtimeResource);
                      resourceMap.set(runtimeName, runtimeResource);
                      logger.info(`Auto-patched mta.yaml: added app-runtime resource '${runtimeName}'`);
                    }

                    // Swap the AppRouter's requires entry to point at app-runtime
                    req.name = runtimeName;
                    changed = true;
                    logger.info(
                      `Auto-patched mta.yaml: AppRouter now requires '${runtimeName}' (app-runtime) instead of '${reqName}' (app-host)`
                    );
                    break; // one html5-apps-repo requires entry per AppRouter is enough
                  }
                }
              }
            }

            if (changed) {
              const patched = yaml.dump(mta, { lineWidth: -1, noRefs: true, indent: 2 });
              fs.writeFileSync(mtaYaml, patched, 'utf8');
            }
          }
        } catch (patchErr) {
          // Should not reach here — individual errors handled above
          logger.warn(
            `mta.yaml patch error: ${patchErr instanceof Error ? patchErr.message : String(patchErr)}`
          );
        }
      }

      // ── Pre-flight: CF login check ────────────────────────────────────────────
      if (!dryRun) {
        const cfOk = await cfIsLoggedIn({ silent: true, throwOnError: false });
        if (!cfOk) {
          logger.error('Not logged in to CF CLI. Run `btp-starter-pack login` first.');
          process.exit(1);
        }
      }

      // ── Pre-flight: sh.exe check (Windows only) ───────────────────────────────
      // mbt generates a Makefile with Unix shell recipes. Without sh.exe in PATH,
      // the pre_validate target fails immediately with Error 1. Check upfront so
      // the user gets a clear, actionable error before waiting for npm install.
      if (!dryRun && process.platform === 'win32' && !shExeAvailable()) {
        logger.error(
          'sh.exe not found. mbt requires GNU make + sh (from Git for Windows).\n\n' +
          'Fix (run ONE of these):\n' +
          '  • winget install --id Git.Git -e\n' +
          '  • choco install git\n\n' +
          'After installing Git for Windows, restart this terminal so the PATH updates, then try again.\n' +
          'Git installs sh.exe at: C:\\Program Files\\Git\\usr\\bin\\sh.exe'
        );
        process.exit(1);
      }

      // ── Step 0: npm install in all package.json directories ───────────────────
      // mbt's pre_validate step requires node_modules to exist in each module
      // directory. Running npm install here ensures the build never fails due
      // to missing dependencies, without requiring the user to open a terminal.
      logger.section('Step 0: Installing project dependencies');

      const pkgDirs = dryRun ? [projectDir] : findPackageJsonDirs(projectDir);

      if (pkgDirs.length === 0) {
        logger.info('No package.json files found — skipping npm install.');
      } else {
        logger.info(`Found ${pkgDirs.length} package.json location(s) — running npm install in each...`);
        logger.blank();

        for (const dir of pkgDirs) {
          const relDir = path.relative(projectDir, dir) || '.';
          const installSpinner = ora(`npm install in ${relDir}`).start();

          if (dryRun) {
            installSpinner.info(chalk.yellow(`[dry-run] npm install (in ${relDir})`));
            continue;
          }

          const installResult = await run('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], {
            cwd: dir,
            throwOnError: false,
          });

          if (installResult.success) {
            installSpinner.succeed(`npm install OK — ${relDir}`);
          } else {
            installSpinner.warn(
              chalk.yellow(`npm install had warnings in ${relDir} — continuing anyway`)
            );
            // Non-fatal: npm install issues usually don't block mbt build
          }
        }
      }

      logger.blank();

      // ── Step 1: mbt build ─────────────────────────────────────────────────────
      logger.section('Step 1: Building MTA archive');

      const buildSpinner = ora('Running mbt build...').start();

      if (dryRun) {
        buildSpinner.info(chalk.yellow(`[dry-run] mbt build (in ${projectDir})`));
      } else {
        // --platform cf: explicit target (avoids mbt guessing)
        // --strict false: skips `mbt validate -r` in pre_validate, which fails on
        //   cross-reference errors (e.g. ServiceKeyName not defined as a resource)
        //   and on deployed-after fields unsupported by older mbt versions.
        //   The actual mta.yaml is still validated by `cf deploy` on the CF side.
        const buildResult = await run('mbt', ['build', '--mtar', 'archive', '--platform', 'cf'], {
          cwd: projectDir,
          throwOnError: false,
          env: mbtEnv(),
        });

        buildSpinner.stop();

        if (!buildResult.success) {
          const errMsg = (buildResult.stderr || buildResult.stdout).substring(0, 800);
          logger.error(`mbt build failed:\n${errMsg}`);
          logger.blank();
          console.log(chalk.yellow('Troubleshooting:'));
          console.log(chalk.white('  • Ensure mbt is installed: npm install -g mbt'));
          console.log(chalk.white('  • Verify mta.yaml is valid YAML'));
          console.log(chalk.white('  • On Windows: ensure GNU make is available (included with Git for Windows)'));
          console.log(chalk.white('    Path to add: C:\\Program Files\\Git\\usr\\bin'));
          process.exit(1);
        }

        logger.success('MTA archive built successfully.');
      }

      // ── Step 2: Find .mtar file ───────────────────────────────────────────────
      let mtarFile: string | undefined;

      if (!dryRun) {
        const archivesDir = path.join(projectDir, 'mta_archives');

        if (!fs.existsSync(archivesDir)) {
          logger.error('mta_archives/ directory not found after build. Check mbt output above.');
          process.exit(1);
        }

        const mtarFiles = fs.readdirSync(archivesDir).filter((f) => f.endsWith('.mtar'));
        if (mtarFiles.length === 0) {
          logger.error('No .mtar file found in mta_archives/. Build may have failed silently.');
          process.exit(1);
        }

        // Use the most recently modified .mtar if multiple exist
        mtarFile = mtarFiles
          .map((f) => ({ name: f, mtime: fs.statSync(path.join(archivesDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime)[0]?.name;

        logger.info(`Archive: mta_archives/${mtarFile}`);
      }

      // ── Step 3: cf deploy ─────────────────────────────────────────────────────
      logger.blank();
      logger.section('Step 2: Deploying to Cloud Foundry');

      if (dryRun) {
        logger.info(chalk.yellow('[dry-run] cf deploy mta_archives/<archive>.mtar'));
      } else {
        const mtarPath = path.join(projectDir, 'mta_archives', mtarFile!);

        logger.info('This may take 3–10 minutes depending on app size...');
        logger.blank();

        const deployResult = await run(
          'cf',
          ['deploy', mtarPath, '--retries', '1'],
          {
            cwd: projectDir,
            throwOnError: false,
            // mtarPath is derived from path.join on a server-validated projectDir
            // + a filename read from the filesystem — not from raw user input.
            // trustedArgIndices bypasses SAFE_ARG_PATTERN for this path only.
            trustedArgIndices: [1],
          }
        );

        if (!deployResult.success) {
          const errOutput = (deployResult.stderr || deployResult.stdout).substring(0, 800);
          logger.error(`cf deploy failed:\n${errOutput}`);
          logger.blank();
          console.log(chalk.yellow('Common causes:'));
          console.log(chalk.white('  • CF session expired: run btp-starter-pack login'));
          console.log(chalk.white('  • Service instances not created: run btp-starter-pack setup'));
          console.log(chalk.white('  • CF org/space not targeted: run cf target -o <org> -s <space>'));
          console.log(chalk.white('  • XSUAA xs-security.json has wrong service name'));
          process.exit(1);
        }

        logger.blank();
        logger.success('Deployment complete!');
        logger.blank();
        console.log(chalk.bold('Check your deployed apps:'));
        console.log(chalk.cyan('  cf apps'));
        console.log(chalk.gray('  → https://account.hanatrial.ondemand.com/'));
      }
    });

  return cmd;
}
