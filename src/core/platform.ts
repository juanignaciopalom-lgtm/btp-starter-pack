/**
 * Platform module — OS detection and platform-specific utilities.
 * Designed for Windows-first, extensible to Linux/macOS.
 */

import os from 'os';
import path from 'path';

export type Platform = 'windows' | 'linux' | 'macos' | 'unknown';

export function detectPlatform(): Platform {
  switch (process.platform) {
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    case 'darwin':
      return 'macos';
    default:
      return 'unknown';
  }
}

export const platform = detectPlatform();
export const isWindows = platform === 'windows';

// ── Install instruction generators ────────────────────────────────────────────
export interface InstallInstructions {
  windows: string;
  linux: string;
  macos: string;
  link: string;
}

export const INSTALL_INSTRUCTIONS: Record<string, InstallInstructions> = {
  node: {
    windows: 'winget install OpenJS.NodeJS.LTS  (or download from https://nodejs.org)',
    linux: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs',
    macos: 'brew install node@20',
    link: 'https://nodejs.org/en/download',
  },
  git: {
    windows: 'winget install Git.Git',
    linux: 'sudo apt-get install git  (or: sudo dnf install git)',
    macos: 'brew install git  (or: xcode-select --install)',
    link: 'https://git-scm.com/downloads',
  },
  docker: {
    windows: 'Download and install Docker Desktop from https://www.docker.com/products/docker-desktop/',
    linux: 'sudo apt-get install docker.io && sudo systemctl enable docker',
    macos: 'brew install --cask docker',
    link: 'https://docs.docker.com/get-docker/',
  },
  cf: {
    windows: 'Download CF CLI v8 installer from https://github.com/cloudfoundry/cli/releases/latest — choose the Windows 64-bit installer.',
    linux: 'wget -O cf-cli.tgz https://packages.cloudfoundry.org/stable?release=linux64-binary&version=v8&source=github && tar -xzf cf-cli.tgz && sudo mv cf /usr/local/bin',
    macos: 'brew install cloudfoundry/tap/cf-cli@8',
    link: 'https://github.com/cloudfoundry/cli/releases/latest',
  },
  btp: {
    windows: 'Download BTP CLI from https://tools.hana.ondemand.com/#cloud — choose "SAP BTP command line interface (btp CLI)".',
    linux: 'Download from https://tools.hana.ondemand.com/#cloud and place binary in /usr/local/bin/btp',
    macos: 'Download from https://tools.hana.ondemand.com/#cloud and place binary in /usr/local/bin/btp',
    link: 'https://help.sap.com/docs/btp/sap-business-technology-platform/download-and-start-using-btp-cli',
  },
  cds: {
    windows: 'npm install -g @sap/cds-dk',
    linux: 'npm install -g @sap/cds-dk',
    macos: 'npm install -g @sap/cds-dk',
    link: 'https://cap.cloud.sap/docs/get-started/',
  },
  ui5: {
    windows: 'npm install -g @ui5/cli',
    linux: 'npm install -g @ui5/cli',
    macos: 'npm install -g @ui5/cli',
    link: 'https://sap.github.io/ui5-tooling/',
  },
  mbt: {
    windows: 'npm install -g mbt',
    linux: 'npm install -g mbt',
    macos: 'npm install -g mbt',
    link: 'https://sap.github.io/cloud-mta-build-tool/',
  },
};

export function getInstallInstruction(tool: string): string {
  const instructions = INSTALL_INSTRUCTIONS[tool];
  if (!instructions) return `Install ${tool} from the official documentation.`;

  switch (platform) {
    case 'windows':
      return instructions.windows;
    case 'linux':
      return instructions.linux;
    case 'macos':
      return instructions.macos;
    default:
      return `See ${instructions.link}`;
  }
}

// ── Path utilities ────────────────────────────────────────────────────────────
export function getHomeDir(): string {
  return os.homedir();
}

export function getBtpCliConfigDir(): string {
  // BTP CLI stores session in ~/.btp on Windows/Linux/macOS
  return path.join(getHomeDir(), '.btp');
}

export function getCfCliConfigDir(): string {
  // CF CLI stores config in ~/.cf on Windows/Linux/macOS
  return path.join(getHomeDir(), '.cf');
}

export function normalizePath(inputPath: string): string {
  // On Windows, normalize separators
  return path.normalize(inputPath);
}
