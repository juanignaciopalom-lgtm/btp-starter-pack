/**
 * Tests for btp/services.ts
 * Verifies the service catalog accuracy and filtering.
 */

import { describe, it, expect } from 'vitest';
import {
  BTP_SERVICES,
  getServiceByName,
  getAutomatableServices,
  getRequiredServices,
  filterSelectedServices,
} from '../../src/btp/services';

describe('BTP_SERVICES catalog', () => {
  it('contains xsuaa as a required service', () => {
    const xsuaa = BTP_SERVICES.find((s) => s.cfServiceName === 'xsuaa');
    expect(xsuaa).toBeDefined();
    expect(xsuaa?.required).toBe(true);
    expect(xsuaa?.cfPlan).toBe('application');
    expect(xsuaa?.trialAvailability).toBe('available');
  });

  it('contains destination service', () => {
    const dest = BTP_SERVICES.find((s) => s.cfServiceName === 'destination');
    expect(dest).toBeDefined();
    expect(dest?.cfPlan).toBe('lite');
  });

  it('all services have required fields', () => {
    for (const svc of BTP_SERVICES) {
      expect(svc.cfServiceName).toBeTruthy();
      expect(svc.cfPlan).toBeTruthy();
      expect(svc.displayName).toBeTruthy();
      expect(svc.defaultInstanceName).toBeTruthy();
      expect(svc.defaultKeyName).toBeTruthy();
    }
  });

  it('all automatable services have cliAutomation=full', () => {
    const automatable = getAutomatableServices();
    for (const svc of automatable) {
      expect(svc.cliAutomation).toBe('full');
    }
  });

  it('all required services are in the automatable list', () => {
    const required = getRequiredServices();
    const automatable = getAutomatableServices();
    const automatableNames = automatable.map((s) => s.cfServiceName);

    for (const svc of required) {
      expect(automatableNames).toContain(svc.cfServiceName);
    }
  });
});

describe('getServiceByName', () => {
  it('returns the correct service', () => {
    const svc = getServiceByName('xsuaa');
    expect(svc?.cfServiceName).toBe('xsuaa');
  });

  it('returns undefined for unknown service', () => {
    const svc = getServiceByName('unknown-service');
    expect(svc).toBeUndefined();
  });
});

describe('filterSelectedServices', () => {
  it('returns only selected services', () => {
    const selected = filterSelectedServices(['xsuaa', 'destination']);
    expect(selected).toHaveLength(2);
    expect(selected.map((s) => s.cfServiceName)).toContain('xsuaa');
    expect(selected.map((s) => s.cfServiceName)).toContain('destination');
  });

  it('returns empty array for unknown service names', () => {
    const selected = filterSelectedServices(['unknown-svc-1', 'unknown-svc-2']);
    expect(selected).toHaveLength(0);
  });

  it('ignores unknown services in mixed list', () => {
    const selected = filterSelectedServices(['xsuaa', 'unknown-svc']);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.cfServiceName).toBe('xsuaa');
  });
});

describe('Service security properties', () => {
  it('xsuaa has createServiceKey=true (needed for VCAP_SERVICES)', () => {
    const xsuaa = getServiceByName('xsuaa');
    expect(xsuaa?.createServiceKey).toBe(true);
  });

  it('destination has createServiceKey=true', () => {
    const dest = getServiceByName('destination');
    expect(dest?.createServiceKey).toBe(true);
  });

  it('no service has a hardcoded password in configJsonPath', () => {
    // Verify that configJsonPath points to a file, not inline credentials
    for (const svc of BTP_SERVICES) {
      if (svc.configJsonPath) {
        expect(svc.configJsonPath).not.toMatch(/password|secret|credential/i);
        expect(svc.configJsonPath.endsWith('.json')).toBe(true);
      }
    }
  });
});
