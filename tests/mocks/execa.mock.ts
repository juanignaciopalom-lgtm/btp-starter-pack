/**
 * Mock for execa — intercepts shell command execution in tests.
 * Allows tests to simulate BTP/CF CLI responses without real credentials.
 */

import { vi } from 'vitest';

export interface MockCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Default mock responses for known CLI commands
const DEFAULT_RESPONSES: Record<string, MockCommandResult> = {
  'btp --info': {
    stdout: 'Current Target: global account "trial"\nSubdomain: trial-abc123\nLogged in as: test@example.com',
    stderr: '',
    exitCode: 0,
  },
  'btp --version': {
    stdout: 'SAP BTP command line interface (client v2.62.0)',
    stderr: '',
    exitCode: 0,
  },
  'btp list accounts/subaccount --format json': {
    stdout: JSON.stringify({
      value: [
        {
          displayName: 'trial',
          guid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          subdomain: 'trial-abc123',
          state: 'OK',
          region: 'eu10',
        },
      ],
    }),
    stderr: '',
    exitCode: 0,
  },
  'cf --version': {
    stdout: 'cf version 8.7.9+3cd3b6b.2023-06-05',
    stderr: '',
    exitCode: 0,
  },
  'cf target': {
    stdout: [
      'API endpoint:   https://api.cf.eu10.hana.ondemand.com',
      'API version:    3.158.0',
      'user:           test@example.com',
      'org:            trialorg',
      'space:          dev',
    ].join('\n'),
    stderr: '',
    exitCode: 0,
  },
  'cf services': {
    stdout: [
      'Getting services in org trialorg / space dev as test@example.com...',
      '',
      'name                    service         plan          bound apps   last operation   broker',
      'xsuaa-instance          xsuaa           application                create succeeded',
      'destination-instance    destination     lite                       create succeeded',
    ].join('\n'),
    stderr: '',
    exitCode: 0,
  },
  'cf marketplace': {
    stdout: [
      'Getting services from marketplace in org trialorg / space dev...',
      '',
      'service              plans                            description',
      'xsuaa                application, broker, space       SAP Authorization and Trust Management',
      'destination          lite                             SAP Destination Service',
      'html5-apps-repo      app-host, app-runtime            HTML5 Application Repository',
      'application-logs     lite                             SAP Application Logging',
    ].join('\n'),
    stderr: '',
    exitCode: 0,
  },
  'node --version': { stdout: 'v20.12.0', stderr: '', exitCode: 0 },
  'npm --version': { stdout: '10.5.0', stderr: '', exitCode: 0 },
  'git --version': { stdout: 'git version 2.44.0', stderr: '', exitCode: 0 },
};

/**
 * Creates a mock execa function that returns predefined responses.
 * Use in test files with vi.mock('execa', ...).
 */
export function createExecaMock(overrides: Record<string, MockCommandResult> = {}) {
  const responses = { ...DEFAULT_RESPONSES, ...overrides };

  return vi.fn().mockImplementation((executable: string, args: string[]) => {
    const key = [executable, ...args].join(' ');

    // Try exact match first
    if (responses[key]) {
      const { stdout, stderr, exitCode } = responses[key]!;
      return Promise.resolve({ stdout, stderr, exitCode });
    }

    // Try prefix match
    const prefixKey = Object.keys(responses).find((k) => key.startsWith(k));
    if (prefixKey) {
      const { stdout, stderr, exitCode } = responses[prefixKey]!;
      return Promise.resolve({ stdout, stderr, exitCode });
    }

    // Default: command not found
    return Promise.resolve({
      stdout: '',
      stderr: `mock: command not recognized: ${key}`,
      exitCode: 1,
    });
  });
}
