/**
 * Logger module — structured logging with credential sanitization.
 *
 * Security:
 * - CWE-532: Sanitizes sensitive patterns before writing to any log sink.
 * - Never logs passwords, tokens, clientsecret, or service key credentials.
 * - Console output is human-readable; file output is JSON.
 */

import winston from 'winston';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

// ── Sensitive pattern sanitizer ─────────────────────────────────────────────
// Applied before any value reaches a log sink.
// These regexes match common credential patterns in SAP BTP output.
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // JWT tokens (Bearer eyJ...)
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: '[JWT_TOKEN]' },
  // clientsecret in JSON
  { pattern: /"clientsecret"\s*:\s*"[^"]{8,}"/g, replacement: '"clientsecret": "[REDACTED]"' },
  // password fields in JSON
  { pattern: /"password"\s*:\s*"[^"]{3,}"/g, replacement: '"password": "[REDACTED]"' },
  // accessToken / access_token
  { pattern: /"access_token"\s*:\s*"[^"]{8,}"/g, replacement: '"access_token": "[REDACTED]"' },
  { pattern: /"accessToken"\s*:\s*"[^"]{8,}"/g, replacement: '"accessToken": "[REDACTED]"' },
  // CF auth tokens in headers
  { pattern: /bearer\s+[A-Za-z0-9._-]{20,}/gi, replacement: 'bearer [REDACTED]' },
  // API keys (generic long alphanumeric strings that follow common patterns)
  { pattern: /"apikey"\s*:\s*"[^"]{16,}"/gi, replacement: '"apikey": "[REDACTED]"' },
  // VCAP_SERVICES credential blocks
  { pattern: /"credentials"\s*:\s*\{[^}]{20,}\}/g, replacement: '"credentials": { "[REDACTED]": true }' },
];

/**
 * Sanitizes a string value by replacing known credential patterns.
 * CWE-532: Prevents sensitive information from reaching log sinks.
 */
export function sanitizeForLog(value: string): string {
  let sanitized = value;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

// ── Log levels and colors ────────────────────────────────────────────────────
const LEVEL_COLORS: Record<string, (s: string) => string> = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.cyan,
  debug: chalk.gray,
  success: chalk.green,
};

const LEVEL_ICONS: Record<string, string> = {
  error: '✖',
  warn: '⚠',
  info: 'ℹ',
  debug: '·',
  success: '✔',
};

// ── Winston custom format ────────────────────────────────────────────────────
const consoleFormat = winston.format.printf(({ level, message }) => {
  const safeMessage = sanitizeForLog(String(message));
  const colorFn = LEVEL_COLORS[level] ?? chalk.white;
  const icon = LEVEL_ICONS[level] ?? ' ';
  const timestamp = new Date().toISOString().substring(11, 19); // HH:MM:SS
  return `${chalk.gray(timestamp)} ${colorFn(icon)} ${safeMessage}`;
});

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ level, message, timestamp }) => {
    // Apply sanitization before writing to file
    const safeMessage = sanitizeForLog(String(message));
    return JSON.stringify({ timestamp, level, message: safeMessage });
  })
);

// ── Logger factory ───────────────────────────────────────────────────────────
let _logger: winston.Logger | null = null;
let _logFilePath: string | null = null;

export function initLogger(options: { logLevel?: string; logFile?: string; noColor?: boolean }): void {
  const logLevel = options.logLevel ?? process.env['LOG_LEVEL'] ?? 'info';
  const logFile = options.logFile ?? process.env['LOG_FILE'] ?? path.join(process.cwd(), 'logs', `btp-starter-${new Date().toISOString().substring(0, 10)}.log`);

  _logFilePath = logFile;
  fs.ensureDirSync(path.dirname(logFile));

  _logger = winston.createLogger({
    level: logLevel,
    transports: [
      new winston.transports.Console({
        format: options.noColor
          ? winston.format.combine(winston.format.uncolorize(), consoleFormat)
          : consoleFormat,
      }),
      new winston.transports.File({
        filename: logFile,
        format: fileFormat,
      }),
    ],
  });
}

function getLogger(): winston.Logger {
  if (!_logger) {
    initLogger({});
  }
  return _logger!;
}

// ── Public API ───────────────────────────────────────────────────────────────
export const logger = {
  info: (message: string): void => { getLogger().info(message); },
  warn: (message: string): void => { getLogger().warn(message); },
  // CWE-209: error() takes message only — callers must not pass raw Error.stack
  error: (message: string): void => { getLogger().error(message); },
  debug: (message: string): void => { getLogger().debug(message); },
  success: (message: string): void => { getLogger().log('info', chalk.green(`✔ ${message}`)); },
  blank: (): void => { process.stdout.write('\n'); },
  section: (title: string): void => {
    process.stdout.write(`\n${chalk.bold.cyan(`── ${title} `)}\n`);
  },
  logFile: (): string | null => _logFilePath,
};

export type Logger = typeof logger;
