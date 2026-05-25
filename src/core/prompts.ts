/**
 * Prompts module — interactive CLI prompts.
 * Wraps Inquirer with typed helpers and consistent styling.
 *
 * Security:
 * - Password/secret prompts use type:'password' to mask input.
 * - No prompt result is stored in config (enforced by config schema).
 * - Confirmation prompts for destructive actions require explicit phrase.
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { BTP_REGIONS, type BTPRegion } from './config';

// ── Basic prompts ─────────────────────────────────────────────────────────────
export async function promptText(
  message: string,
  defaultValue?: string,
  validate?: (input: string) => true | string
): Promise<string> {
  const { value } = await inquirer.prompt<{ value: string }>([
    {
      type: 'input',
      name: 'value',
      message,
      default: defaultValue,
      validate: validate ?? ((input: string) => (input.trim().length > 0 ? true : 'This field is required')),
    },
  ]);
  return value.trim();
}

export async function promptEmail(message: string = 'SAP BTP account email:'): Promise<string> {
  const { email } = await inquirer.prompt<{ email: string }>([
    {
      type: 'input',
      name: 'email',
      message,
      validate: (input: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(input.trim()) ? true : 'Enter a valid email address';
      },
    },
  ]);
  return email.trim().toLowerCase();
}

export async function promptRegion(): Promise<BTPRegion> {
  const regionDescriptions: Record<string, string> = {
    eu10: 'Europe (Frankfurt) — most common for Trial',
    eu20: 'Europe (Netherlands)',
    us10: 'US East (VA)',
    us20: 'US West (WA)',
    ap10: 'Australia (Sydney)',
    ap11: 'Asia Pacific (Singapore)',
    ap12: 'Asia Pacific (Seoul)',
    ap21: 'Asia Pacific (Japan)',
    br10: 'Brazil (São Paulo)',
    ca10: 'Canada (Montreal)',
    jp10: 'Japan (Tokyo)',
    jp20: 'Japan (Osaka)',
    us30: 'US Central (IA)',
  };

  const choices = BTP_REGIONS.map((r) => ({
    name: `${r} — ${regionDescriptions[r] ?? r}`,
    value: r,
  }));

  const { region } = await inquirer.prompt<{ region: BTPRegion }>([
    {
      type: 'list',
      name: 'region',
      message: 'Select your BTP Trial region:',
      choices,
      default: 'eu10',
    },
  ]);

  return region;
}

export async function promptText_CfSpace(defaultSpace: string = 'dev'): Promise<string> {
  return promptText(
    'CF Space name:',
    defaultSpace,
    (input) => (/^[a-zA-Z0-9_-]{1,50}$/.test(input.trim()) ? true : 'Space name must be 1-50 alphanumeric chars, dashes, or underscores')
  );
}

export async function promptProjectName(defaultName: string = 'my-btp-app'): Promise<string> {
  return promptText(
    'Project name:',
    defaultName,
    (input) => (/^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/.test(input.trim()) ? true : 'Project name must start with a letter and contain only alphanumeric chars, dashes, or underscores (max 50 chars)')
  );
}

// ── Confirmation prompts ──────────────────────────────────────────────────────
export async function confirmAction(message: string, defaultValue: boolean = false): Promise<boolean> {
  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);
  return confirmed;
}

/**
 * Destructive action confirmation — requires typing a specific phrase.
 * This prevents accidental confirmation via Enter key.
 */
export async function confirmDestructive(
  actionDescription: string,
  requiredPhrase: string
): Promise<boolean> {
  console.log(chalk.red(`\n⚠  DESTRUCTIVE ACTION: ${actionDescription}`));
  console.log(chalk.yellow(`   Type "${requiredPhrase}" to confirm, or press Enter to cancel.\n`));

  const { phrase } = await inquirer.prompt<{ phrase: string }>([
    {
      type: 'input',
      name: 'phrase',
      message: 'Confirmation phrase:',
      default: '',
    },
  ]);

  return phrase.trim() === requiredPhrase;
}

// ── Service selection prompt ──────────────────────────────────────────────────
export async function promptServiceSelection(
  availableServices: Array<{ name: string; description: string; recommended: boolean }>
): Promise<string[]> {
  const choices = availableServices.map((svc) => ({
    name: `${svc.name} — ${svc.description}${svc.recommended ? chalk.green(' (recommended)') : ''}`,
    value: svc.name,
    checked: svc.recommended,
  }));

  const { selected } = await inquirer.prompt<{ selected: string[] }>([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select BTP services to create:',
      choices,
    },
  ]);

  return selected;
}

// ── Project type prompt ───────────────────────────────────────────────────────
export type ProjectType = 'cap-ui5-approuter' | 'cap-ui5' | 'cap-only' | 'ui5-only';

export async function promptProjectType(): Promise<ProjectType> {
  const { type } = await inquirer.prompt<{ type: ProjectType }>([
    {
      type: 'list',
      name: 'type',
      message: 'Select project template:',
      choices: [
        { name: 'CAP + SAPUI5 + AppRouter  (full-stack, XSUAA auth, MTA deploy)', value: 'cap-ui5-approuter' },
        { name: 'CAP + SAPUI5  (no AppRouter, simpler setup)', value: 'cap-ui5' },
        { name: 'CAP backend only', value: 'cap-only' },
        { name: 'SAPUI5 frontend only', value: 'ui5-only' },
      ],
      default: 'cap-ui5-approuter',
    },
  ]);
  return type;
}

export async function promptUi5Namespace(projectName: string): Promise<string> {
  const defaultNs = `com.example.${projectName.replace(/[^a-zA-Z0-9]/g, '')}`;
  return promptText(
    'UI5 application namespace:',
    defaultNs,
    (input) => (/^[a-zA-Z][a-zA-Z0-9.]*$/.test(input.trim()) ? true : 'Namespace must be dot-separated identifiers (e.g. com.example.myapp)')
  );
}
