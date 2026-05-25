/**
 * BTP Services catalog.
 *
 * This file is the single source of truth for:
 * - Which CF services to create
 * - Their technical names, plans, and Trial availability
 * - Whether they can be created by CLI
 * - Their purpose and optionality
 */

export type ServiceAvailability = 'available' | 'limited' | 'unavailable' | 'manual';
export type ServiceAutomation = 'full' | 'partial' | 'manual' | 'not-applicable';

export interface BtpServiceDefinition {
  /** Technical CF service name used in `cf create-service` */
  cfServiceName: string;
  /** CF service plan for Trial */
  cfPlan: string;
  /** Human-readable name */
  displayName: string;
  /** What this service is used for */
  purpose: string;
  /** Is this service required for a basic BTP app? */
  required: boolean;
  /** Is it likely available in BTP Trial? */
  trialAvailability: ServiceAvailability;
  /** Explanation of availability status */
  trialNote: string;
  /** Can it be created by CLI? */
  cliAutomation: ServiceAutomation;
  /** Instance name used in setup (prefix of project name will be added) */
  defaultInstanceName: string;
  /** Whether to create a service key after instance creation */
  createServiceKey: boolean;
  /** Default service key name */
  defaultKeyName: string;
  /**
   * Optional JSON config for service creation.
   * For XSUAA: points to xs-security.json file.
   * For others: null.
   */
  configJsonPath?: string;
}

// ── Service catalog ───────────────────────────────────────────────────────────
export const BTP_SERVICES: BtpServiceDefinition[] = [
  {
    cfServiceName: 'xsuaa',
    cfPlan: 'application',
    displayName: 'Authorization & Trust Management (XSUAA)',
    purpose: 'OAuth2/OIDC authentication and authorization for BTP applications. Required for any app with login.',
    required: true,
    trialAvailability: 'available',
    trialNote: 'Fully available in Trial. Plan "application" is the standard plan for apps.',
    cliAutomation: 'full',
    defaultInstanceName: 'xsuaa-instance',
    createServiceKey: true,
    defaultKeyName: 'xsuaa-key',
    configJsonPath: 'xs-security.json',
  },
  {
    cfServiceName: 'destination',
    cfPlan: 'lite',
    displayName: 'Destination Service',
    purpose: 'Manages destinations (URLs and authentication configs) for connecting to S/4HANA, APIs, and other services.',
    required: true,
    trialAvailability: 'available',
    trialNote: 'Fully available in Trial. Plan "lite" is the only Trial option.',
    cliAutomation: 'full',
    defaultInstanceName: 'destination-instance',
    createServiceKey: true,
    defaultKeyName: 'destination-key',
  },
  {
    cfServiceName: 'connectivity',
    cfPlan: 'lite',
    displayName: 'Connectivity Service',
    purpose: 'Required for accessing on-premise systems via SAP Cloud Connector. Not needed for cloud-only S/4HANA.',
    required: false,
    trialAvailability: 'available',
    trialNote: 'Available in Trial, but only useful if you have a Cloud Connector installed on-premise. S/4HANA Cloud (not on-premise) does NOT require this service.',
    cliAutomation: 'full',
    defaultInstanceName: 'connectivity-instance',
    createServiceKey: false,
    defaultKeyName: 'connectivity-key',
  },
  {
    cfServiceName: 'html5-apps-repo',
    cfPlan: 'app-host',
    displayName: 'HTML5 Application Repository (App Host)',
    purpose: 'Hosts SAPUI5/Fiori apps on BTP. Required when using Managed AppRouter or deploying UI5 apps to CF.',
    required: false,
    trialAvailability: 'available',
    trialNote: 'Available in Trial. The "app-host" plan is used for app deployment; "app-runtime" is used by AppRouter.',
    cliAutomation: 'full',
    defaultInstanceName: 'html5-apps-repo-instance',
    createServiceKey: false,
    defaultKeyName: 'html5-apps-repo-key',
  },
  {
    cfServiceName: 'application-logs',
    cfPlan: 'lite',
    displayName: 'Application Logging Service',
    purpose: 'Centralized logging for BTP applications. Integrates with SAP Cloud Logging.',
    required: false,
    trialAvailability: 'available',
    trialNote: 'Available in Trial with "lite" plan. Limited retention compared to paid plans.',
    cliAutomation: 'full',
    defaultInstanceName: 'application-logs-instance',
    createServiceKey: false,
    defaultKeyName: 'application-logs-key',
  },
  {
    cfServiceName: 'alert-notification',
    // Plan varies by region: 'standard' in most Trial regions (us10, eu10).
    // 'free' was the old name — SAP renamed it to 'standard' in newer landscapes.
    cfPlan: 'standard',
    displayName: 'Alert Notification Service',
    purpose: 'Send alerts and notifications when BTP events occur (app crashes, quota limits, etc.).',
    required: false,
    trialAvailability: 'limited',
    trialNote: 'Plan name varies by region ("standard" or "free"). Skipped automatically if not available.',
    cliAutomation: 'full',
    defaultInstanceName: 'alert-notification-instance',
    createServiceKey: false,
    defaultKeyName: 'alert-notification-key',
  },
  {
    cfServiceName: 'jobscheduler',
    cfPlan: 'lite',
    displayName: 'Job Scheduler Service',
    purpose: 'Schedule background jobs and recurring tasks in BTP applications.',
    required: false,
    // Not available in all Trial landscapes — requires explicit entitlement assignment.
    trialAvailability: 'limited',
    trialNote: 'Requires entitlement in BTP Cockpit → Subaccount → Entitlements. Not available by default in all Trial regions.',
    cliAutomation: 'full',
    defaultInstanceName: 'job-scheduler-instance',
    createServiceKey: true,
    defaultKeyName: 'job-scheduler-key',
  },
];

// ── Services NOT automatically created ────────────────────────────────────────
export const BTP_MANUAL_SERVICES = [
  {
    name: 'SAP HANA Cloud',
    reason: 'Cannot be created via CF CLI. Requires a wizard in SAP BTP Cockpit (subaccount → Cloud Foundry → HANA Cloud). Limited storage in Trial.',
    cockpitPath: 'BTP Cockpit → Subaccount → Cloud Foundry → HANA Cloud',
    trialAvailability: 'limited' as ServiceAvailability,
  },
  {
    name: 'Business Application Studio (BAS)',
    reason: 'SaaS application — must be subscribed from Cockpit. CLI subscription via `btp subscribe` may work but requires the entitlement to be pre-assigned.',
    cockpitPath: 'BTP Cockpit → Subaccount → Service Marketplace → SAP Business Application Studio',
    trialAvailability: 'available' as ServiceAvailability,
  },
  {
    name: 'SAP Build Process Automation',
    reason: 'SaaS application with free tier. Availability varies by region. Subscribe from Cockpit and then configure from the BPA lobby.',
    cockpitPath: 'BTP Cockpit → Subaccount → Service Marketplace → SAP Build Process Automation',
    trialAvailability: 'limited' as ServiceAvailability,
  },
  {
    name: 'SAP Launchpad / Work Zone',
    reason: 'SaaS subscription required. Subscribe "Launchpad" service with "standard" plan from Cockpit.',
    cockpitPath: 'BTP Cockpit → Subaccount → Service Marketplace → Launchpad',
    trialAvailability: 'available' as ServiceAvailability,
  },
  {
    name: 'Cloud Connector',
    reason: 'On-premise agent — installed on your local machine or corporate network. Not a BTP service but a prerequisite for on-premise S/4HANA access. Download from SAP Tools.',
    cockpitPath: 'https://tools.hana.ondemand.com/#cloud (SAP Cloud Connector)',
    trialAvailability: 'available' as ServiceAvailability,
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────
export function getServiceByName(cfServiceName: string): BtpServiceDefinition | undefined {
  return BTP_SERVICES.find((s) => s.cfServiceName === cfServiceName);
}

export function getAutomatableServices(): BtpServiceDefinition[] {
  return BTP_SERVICES.filter(
    (s) =>
      s.cliAutomation === 'full' &&
      (s.trialAvailability === 'available' || s.trialAvailability === 'limited')
  );
}

export function getRequiredServices(): BtpServiceDefinition[] {
  return BTP_SERVICES.filter((s) => s.required);
}

export function filterSelectedServices(selectedNames: string[]): BtpServiceDefinition[] {
  return BTP_SERVICES.filter((s) => selectedNames.includes(s.cfServiceName));
}
