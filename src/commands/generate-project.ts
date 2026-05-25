/**
 * generate-project command — scaffold a CAP + SAPUI5 + AppRouter project.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import ora from 'ora';
import { logger } from '../core/logger';
import { readConfig } from '../core/config';
import {
  promptProjectName,
  promptProjectType,
  promptUi5Namespace,
  confirmAction,
  type ProjectType,
} from '../core/prompts';
import { renderTemplate } from '../templates/renderer';
import {
  xsSecurityTemplate,
  mtaYamlTemplate,
  capPackageJsonTemplate,
  capSchemaTemplate,
  capServerTemplate,
  capReadmeTemplate,
  ui5ManifestTemplate,
  ui5ComponentTemplate,
  approuterPackageTemplate,
  approuterXsAppTemplate,
  s4hanaDestinationTemplate,
  apiExternalDestinationTemplate,
  rootPackageJsonTemplate,
  projectReadmeTemplate,
} from '../templates';

export function generateProjectCommand(): Command {
  const cmd = new Command('generate-project');
  cmd
    .description('Generate a SAP BTP starter project (CAP + SAPUI5 + AppRouter)')
    .option('--name <name>', 'Project name')
    .option('--type <type>', 'Project type: cap-ui5-approuter | cap-ui5 | cap-only | ui5-only')
    .option('--ui5-namespace <namespace>', 'SAPUI5 component namespace (e.g. com.example.myapp)')
    .option('--output <dir>', 'Output directory (defaults to current directory)')
    .option('--workspace <dir>', 'Workspace directory', '.')
    .option('--dry-run', 'Show what would be generated without creating files')
    .option('--force', 'Overwrite existing project directory without prompting')
    .action(async (options: { name?: string; type?: string; ui5Namespace?: string; output?: string; workspace: string; dryRun?: boolean; force?: boolean }) => {
      logger.section('btp-starter-pack generate-project');

      const dryRun  = options.dryRun ?? false;
      const force   = options.force  ?? false;
      const config  = readConfig(options.workspace);

      // ── Gather inputs ────────────────────────────────────────────────────────
      const projectName = options.name ?? (await promptProjectName());
      const projectType = (options.type as ProjectType | undefined) ?? (await promptProjectType());
      // --ui5-namespace passed from UI wizard bypasses the interactive prompt
      const ui5Namespace = options.ui5Namespace
        ?? ((projectType !== 'cap-only')
          ? await promptUi5Namespace(projectName)
          : `com.example.${projectName}`);

      const outputDir = path.resolve(options.output ?? path.join(options.workspace, projectName));

      logger.blank();
      console.log(chalk.bold.cyan('── Project Configuration '));
      console.log(chalk.white(`  Name:       ${projectName}`));
      console.log(chalk.white(`  Type:       ${projectType}`));
      console.log(chalk.white(`  Namespace:  ${ui5Namespace}`));
      console.log(chalk.white(`  Output:     ${outputDir}`));
      logger.blank();

      if (!dryRun && !force && fs.existsSync(outputDir)) {
        const overwrite = await confirmAction(
          `Directory ${outputDir} already exists. Overwrite?`,
          false
        );
        if (!overwrite) {
          logger.info('Generation cancelled.');
          return;
        }
      }

      // ── Template context ──────────────────────────────────────────────────────
      // cdsName: valid CDS identifier — hyphens replaced with underscores,
      // only a-z A-Z 0-9 _ allowed, must not start with a digit.
      const cdsName = projectName
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/^(\d)/, '_$1')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || 'app';

      const ctx = {
        projectName,
        cdsName,
        projectNameUpper: projectName.toUpperCase().replace(/-/g, '_'),
        ui5Namespace,
        btpEmail: config?.email ?? 'your@email.com',
        btpRegion: config?.region ?? 'eu10',
        xsuaaInstance: 'xsuaa-instance',
        destinationInstance: 'destination-instance',
        html5RepoInstance: 'html5-apps-repo-instance',
        html5RepoRuntimeInstance: 'html5-apps-repo-runtime-instance',
        appRouterName: `${projectName}-approuter`,
        capSrvName: `${projectName}-srv`,
        year: new Date().getFullYear().toString(),
      };

      // ── Generate files ────────────────────────────────────────────────────────
      const spinner = ora('Generating project files...').start();

      const files: Array<{ relPath: string; content: string }> = [];

      // Root files
      files.push({ relPath: 'xs-security.json', content: renderTemplate(xsSecurityTemplate, ctx) });
      files.push({ relPath: 'package.json', content: renderTemplate(rootPackageJsonTemplate, ctx) });
      files.push({ relPath: '.gitignore', content: generateGitignore() });

      // MTA (only for full projects)
      if (projectType !== 'ui5-only') {
        files.push({ relPath: 'mta.yaml', content: renderTemplate(mtaYamlTemplate, ctx) });
      }

      // CAP backend
      if (projectType === 'cap-only' || projectType === 'cap-ui5' || projectType === 'cap-ui5-approuter') {
        files.push({ relPath: `srv/package.json`, content: renderTemplate(capPackageJsonTemplate, ctx) });
        files.push({ relPath: `db/schema.cds`, content: renderTemplate(capSchemaTemplate, ctx) });
        files.push({ relPath: `srv/server.js`, content: renderTemplate(capServerTemplate, ctx) });
        files.push({ relPath: `srv/cat-service.cds`, content: generateCdsService(ctx.projectName) });
        files.push({ relPath: `srv/README.md`, content: renderTemplate(capReadmeTemplate, ctx) });
      }

      // UI5 frontend
      if (projectType === 'cap-ui5' || projectType === 'cap-ui5-approuter' || projectType === 'ui5-only') {
        const ui5Dir = `app/${projectName}`;
        files.push({ relPath: `${ui5Dir}/manifest.json`, content: renderTemplate(ui5ManifestTemplate, ctx) });
        files.push({ relPath: `${ui5Dir}/Component.js`, content: renderTemplate(ui5ComponentTemplate, ctx) });
        files.push({ relPath: `${ui5Dir}/index.html`, content: generateUi5Index(ctx) });
        files.push({ relPath: `${ui5Dir}/webapp/view/Main.view.xml`, content: generateMainView(ctx) });
        files.push({ relPath: `${ui5Dir}/webapp/controller/Main.controller.js`, content: generateMainController(ctx) });
      }

      // AppRouter
      if (projectType === 'cap-ui5-approuter') {
        files.push({ relPath: `approuter/package.json`, content: renderTemplate(approuterPackageTemplate, ctx) });
        files.push({ relPath: `approuter/xs-app.json`, content: renderTemplate(approuterXsAppTemplate, ctx) });
      }

      // Destinations
      files.push({
        relPath: 'destinations/s4hana-destination.json',
        content: renderTemplate(s4hanaDestinationTemplate, ctx),
      });
      files.push({
        relPath: 'destinations/api-external-destination.json',
        content: renderTemplate(apiExternalDestinationTemplate, ctx),
      });

      // README
      files.push({ relPath: 'README.md', content: renderTemplate(projectReadmeTemplate, ctx) });

      spinner.stop();

      if (dryRun) {
        logger.info(chalk.yellow('[dry-run] Would generate the following files:'));
        for (const file of files) {
          console.log(chalk.gray(`  ${outputDir}/${file.relPath}`));
        }
        logger.blank();
        logger.info(`Total: ${files.length} files`);
        return;
      }

      // ── Write files ───────────────────────────────────────────────────────────
      let written = 0;
      for (const file of files) {
        const fullPath = path.join(outputDir, file.relPath);
        fs.ensureDirSync(path.dirname(fullPath));
        fs.writeFileSync(fullPath, file.content, 'utf-8');
        logger.debug(`  Generated: ${file.relPath}`);
        written++;
      }

      logger.blank();
      logger.success(`Project generated: ${outputDir}`);
      logger.info(`${written} files created.`);
      logger.blank();

      console.log(chalk.bold('Project structure:'));
      console.log(chalk.gray(`  ${outputDir}/`));
      if (projectType !== 'ui5-only') {
        console.log(chalk.gray('    db/           — CAP database schema (.cds)'));
        console.log(chalk.gray('    srv/          — CAP service definitions and Node.js handlers'));
      }
      if (projectType !== 'cap-only') {
        console.log(chalk.gray('    app/          — SAPUI5 frontend application'));
      }
      if (projectType === 'cap-ui5-approuter') {
        console.log(chalk.gray('    approuter/    — App Router for XSUAA-based authentication'));
      }
      console.log(chalk.gray('    destinations/ — Destination templates (S/4HANA, external APIs)'));
      console.log(chalk.gray('    xs-security.json — XSUAA security descriptor'));
      if (projectType !== 'ui5-only') {
        console.log(chalk.gray('    mta.yaml      — MTA deployment descriptor'));
      }
      logger.blank();

      console.log(chalk.bold('Next steps:'));
      console.log(chalk.cyan(`  1. cd ${outputDir}`));
      console.log(chalk.cyan('  2. npm install'));
      if (projectType !== 'ui5-only') {
        console.log(chalk.cyan('  3. cds watch  — start CAP development server locally'));
      }
      console.log(chalk.cyan('  4. Open in SAP Business Application Studio via Git clone or upload'));
      if (projectType !== 'ui5-only') {
        console.log(chalk.cyan('  5. mbt build  — build MTA archive for CF deployment'));
        console.log(chalk.cyan('  6. cf deploy mta_archives/<project>.mtar  — deploy to BTP CF'));
      }
    });

  return cmd;
}

// ── Inline template helpers ───────────────────────────────────────────────────
function generateGitignore(): string {
  return [
    'node_modules/',
    'dist/',
    '.env',
    '*service-key*.json',
    '*credentials*.json',
    'gen/',
    'mta_archives/',
    '*.log',
    '.DS_Store',
  ].join('\n');
}

function generateCdsService(projectName: string): string {
  // Service class name: PascalCase without separators
  const safeServiceName = projectName
    .split(/[^a-zA-Z0-9]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('') + 'Service';

  // Use aliased imports to avoid circular reference:
  // Without aliases, `entity Books as projection on Books` shadows the imported
  // `Books` name within the service scope, causing CDS to report a circular ref.
  return `using {
  Books   as DbBooks,
  Authors as DbAuthors,
  Orders  as DbOrders
} from '../db/schema';

service ${safeServiceName} @(path: '/api') {
  entity Books   as projection on DbBooks;
  entity Authors as projection on DbAuthors;
  entity Orders  as projection on DbOrders;
}
`;
}

interface TemplateContext {
  projectName: string;
  ui5Namespace: string;
  [key: string]: string | number | boolean;
}

function generateUi5Index(ctx: TemplateContext): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${ctx.projectName}</title>
  <script id="sap-ui-bootstrap"
    src="https://ui5.sap.com/resources/sap-ui-core.js"
    data-sap-ui-theme="sap_horizon"
    data-sap-ui-resourceroots='{"${ctx.ui5Namespace}": "./"}'
    data-sap-ui-compatVersion="edge"
    data-sap-ui-oninit="module:sap/ui/core/ComponentSupport"
    data-sap-ui-async="true">
  </script>
</head>
<body class="sapUiBody" id="content">
  <div data-sap-ui-component
    data-name="${ctx.ui5Namespace}"
    data-id="container"
    data-settings='{"id" : "app"}'>
  </div>
</body>
</html>
`;
}

function generateMainView(ctx: TemplateContext): string {
  return `<mvc:View
  controllerName="${ctx.ui5Namespace}.controller.Main"
  xmlns:mvc="sap.ui.core.mvc"
  xmlns="sap.m"
  displayBlock="true">
  <App id="app">
    <pages>
      <Page id="mainPage" title="${ctx.projectName}">
        <content>
          <List id="booksList" headerText="Books" items="{/Books}">
            <StandardListItem title="{title}" description="{author}" />
          </List>
        </content>
      </Page>
    </pages>
  </App>
</mvc:View>
`;
}

function generateMainController(ctx: TemplateContext): string {
  return `sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/odata/v4/ODataModel"
], function (Controller, ODataModel) {
  "use strict";

  return Controller.extend("${ctx.ui5Namespace}.controller.Main", {

    onInit: function () {
      const oModel = new ODataModel({
        serviceUrl: "/api/",
        synchronizationMode: "None",
        operationMode: "Server"
      });
      this.getView().setModel(oModel);
    }
  });
});
`;
}
