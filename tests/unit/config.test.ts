/**
 * Tests for core/config.ts
 * Verifies schema validation, path safety, and CWE-798 compliance.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import {
  ConfigSchema,
  readConfig,
  writeConfig,
  resolveConfigPath,
  CONFIG_FILENAME,
} from '../../src/core/config';

// Use a temp directory for all config tests
let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-test-'));
});

afterEach(() => {
  fs.removeSync(tempDir);
});

describe('ConfigSchema — Zod validation', () => {
  it('accepts a valid minimal config', () => {
    const result = ConfigSchema.safeParse({
      email: 'test@example.com',
      region: 'eu10',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = ConfigSchema.safeParse({
      email: 'not-an-email',
      region: 'eu10',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Invalid email');
    }
  });

  it('rejects an unknown region', () => {
    const result = ConfigSchema.safeParse({
      email: 'test@example.com',
      region: 'xx99',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid BTP regions', () => {
    const regions = ['eu10', 'eu20', 'us10', 'us20', 'ap10', 'ap11', 'br10', 'ca10', 'jp10'];
    for (const region of regions) {
      const result = ConfigSchema.safeParse({ email: 'test@example.com', region });
      expect(result.success).toBe(true);
    }
  });

  it('applies defaults for optional fields', () => {
    const result = ConfigSchema.safeParse({ email: 'test@example.com', region: 'eu10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cfSpace).toBe('dev');
      expect(result.data.dryRun).toBe(false);
      expect(result.data.servicesEnabled).toContain('xsuaa');
    }
  });

  it('CWE-798: schema does NOT include password fields', () => {
    // Verify the schema shape doesn't have credential fields
    const schemaKeys = Object.keys(ConfigSchema.shape);
    expect(schemaKeys).not.toContain('password');
    expect(schemaKeys).not.toContain('clientSecret');
    expect(schemaKeys).not.toContain('token');
    expect(schemaKeys).not.toContain('accessToken');
    expect(schemaKeys).not.toContain('secret');
  });
});

describe('writeConfig / readConfig round-trip', () => {
  it('writes and reads a config correctly', () => {
    const config = ConfigSchema.parse({
      email: 'test@example.com',
      region: 'eu10',
      cfSpace: 'prod',
    });

    writeConfig(config, tempDir);

    const configPath = path.join(tempDir, CONFIG_FILENAME);
    expect(fs.existsSync(configPath)).toBe(true);

    const read = readConfig(tempDir);
    expect(read).not.toBeNull();
    expect(read?.email).toBe('test@example.com');
    expect(read?.region).toBe('eu10');
    expect(read?.cfSpace).toBe('prod');
  });

  it('returns null when config file does not exist', () => {
    const result = readConfig(tempDir);
    expect(result).toBeNull();
  });

  it('returns null when config file has invalid JSON', () => {
    fs.writeFileSync(path.join(tempDir, CONFIG_FILENAME), '{ invalid json }');
    const result = readConfig(tempDir);
    expect(result).toBeNull();
  });
});

describe('resolveConfigPath — CWE-22 path safety', () => {
  it('resolves to the correct path', () => {
    const resolved = resolveConfigPath('/some/workspace');
    expect(resolved).toBe(path.join('/some/workspace', CONFIG_FILENAME));
  });

  it('normalizes the path (no path traversal)', () => {
    const resolved = resolveConfigPath('/some/workspace/../other');
    // path.resolve normalizes away the ../
    expect(resolved).not.toContain('..');
  });
});
