/**
 * Tests for core/logger.ts
 * Verifies CWE-532: sensitive data sanitization before logging.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeForLog } from '../../src/core/logger';

describe('sanitizeForLog — CWE-532', () => {
  it('redacts JWT tokens', () => {
    // Use a JWT where all 3 segments are ≥10 chars so the JWT regex matches
    // (the JWT pattern requires {10,} on each segment; short test signatures fall
    //  through to the bearer pattern which also redacts them, just with [REDACTED])
    const jwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQGV4YW1wbGUuY29tIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = sanitizeForLog(`Authorization: Bearer ${jwt}`);
    // The raw JWT content must not appear in the output
    expect(result).not.toContain('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(result).not.toContain('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    // The JWT regex fires first and replaces with [JWT_TOKEN]
    expect(result).toContain('[JWT_TOKEN]');
  });

  it('redacts clientsecret in JSON', () => {
    const json = '{"clientid":"app1","clientsecret":"abc123supersecret","url":"https://..."}';
    const result = sanitizeForLog(json);
    expect(result).not.toContain('abc123supersecret');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts password in JSON', () => {
    const json = '{"username":"admin","password":"hunter2","host":"db.example.com"}';
    const result = sanitizeForLog(json);
    expect(result).not.toContain('hunter2');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts access_token', () => {
    const json = '{"access_token":"ya29.supersecrettoken12345678"}';
    const result = sanitizeForLog(json);
    expect(result).not.toContain('ya29.supersecrettoken12345678');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts Bearer tokens in headers', () => {
    const header = 'Authorization: bearer ya29.supersecrettoken12345678abcdef';
    const result = sanitizeForLog(header);
    expect(result).not.toContain('ya29.supersecrettoken12345678abcdef');
    expect(result).toContain('[REDACTED]');
  });

  it('does NOT redact non-sensitive values', () => {
    const safe = 'CF target: org=trialorg space=dev user=test@example.com';
    const result = sanitizeForLog(safe);
    expect(result).toBe(safe);
  });

  it('does NOT modify URLs without credentials', () => {
    const url = 'https://api.cf.eu10.hana.ondemand.com';
    const result = sanitizeForLog(url);
    expect(result).toBe(url);
  });

  it('handles empty string', () => {
    expect(sanitizeForLog('')).toBe('');
  });
});
