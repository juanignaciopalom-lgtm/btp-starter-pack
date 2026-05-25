/**
 * mta.yaml template — MTA deployment descriptor for SAP BTP Cloud Foundry.
 * Used by `mbt build` and `cf deploy`.
 */

// Notes on design decisions:
// - No xsuaa-deployer module: ServiceKeyName cross-references cause `mbt validate -r`
//   to fail because the key is not defined as a resource. Role collections can be
//   assigned manually via BTP Cockpit after deployment.
// - No deployed-after: not supported in all mbt versions, breaks pre_validate.
// - builder: npm (not npm-ci): npm-ci requires an exact package-lock.json which
//   freshly scaffolded projects don't have yet.
// - AppRouter requires html5-apps-repo with plan app-runtime (provides grant_type).
//   The UI5 deployer requires html5-apps-repo with plan app-host (content upload).
//   Using app-host for both causes "Missing required property: grant_type" crash.
export const mtaYamlTemplate = `_schema-version: "3.3.0"
ID: {{projectName}}
description: {{projectName}} - CAP + SAPUI5 + AppRouter on SAP BTP
version: 1.0.0

modules:

  # ── AppRouter ──────────────────────────────────────────────────────────────
  - name: {{appRouterName}}
    type: approuter.nodejs
    path: approuter
    parameters:
      memory: 256M
      disk-quota: 512M
    requires:
      - name: {{xsuaaInstance}}
      - name: {{destinationInstance}}
      - name: {{html5RepoRuntimeInstance}}
    build-parameters:
      builder: npm

  # ── CAP Backend ────────────────────────────────────────────────────────────
  - name: {{capSrvName}}
    type: nodejs
    path: srv
    parameters:
      memory: 512M
      disk-quota: 512M
    properties:
      EXIT: 1
    requires:
      - name: {{xsuaaInstance}}
      - name: {{destinationInstance}}
    provides:
      - name: srv-api
        properties:
          srv-url: '\${default-url}'
    build-parameters:
      builder: npm

  # ── UI5 Frontend Deployer ──────────────────────────────────────────────────
  - name: {{projectName}}-ui-deployer
    type: com.sap.application.content
    path: app/{{projectName}}
    requires:
      - name: {{html5RepoInstance}}
        parameters:
          content-target: true
    build-parameters:
      builder: custom
      commands: []
      supported-platforms: []

resources:

  # ── XSUAA ──────────────────────────────────────────────────────────────────
  - name: {{xsuaaInstance}}
    type: org.cloudfoundry.managed-service
    parameters:
      service: xsuaa
      service-plan: application
      path: ./xs-security.json
      config:
        xsappname: {{projectName}}
        tenant-mode: dedicated

  # ── Destination ────────────────────────────────────────────────────────────
  - name: {{destinationInstance}}
    type: org.cloudfoundry.managed-service
    parameters:
      service: destination
      service-plan: lite

  # ── HTML5 App Repository — app-host (content upload by UI5 deployer) ───────
  - name: {{html5RepoInstance}}
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-host

  # ── HTML5 App Repository — app-runtime (AppRouter serving, provides grant_type) ─
  - name: {{html5RepoRuntimeInstance}}
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-runtime
`;
