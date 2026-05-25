/**
 * CAP backend templates.
 */

export const capPackageJsonTemplate = `{
  "name": "{{projectName}}-srv",
  "version": "1.0.0",
  "description": "CAP backend service for {{projectName}}",
  "main": "server.js",
  "scripts": {
    "start": "cds-serve",
    "watch": "cds watch",
    "build": "cds build --production"
  },
  "dependencies": {
    "@sap/cds": "^9",
    "@sap/xsenv": "^5",
    "express": "^4"
  },
  "devDependencies": {
    "@sap/cds-dk": "^9"
  },
  "cds": {
    "requires": {
      "auth": {
        "kind": "xsuaa"
      },
      "destinations": {
        "kind": "destinations"
      }
    }
  }
}`;

export const capSchemaTemplate = `using { Currency, managed } from '@sap/cds/common';

/**
 * Sample data model for {{projectName}}.
 * Replace these entities with your actual domain model.
 */
entity Books : managed {
  key ID     : Integer;
  title      : String(111);
  author     : Association to Authors;
  stock      : Integer;
  price      : Decimal(9,2);
  currency   : Currency;
}

entity Authors : managed {
  key ID          : Integer;
  name            : String(111);
  dateOfBirth     : Date;
  placeOfBirth    : String;
  books           : Association to many Books on books.author = $self;
}

entity Orders : managed {
  key ID       : UUID;
  book         : Association to Books;
  buyer        : String;
  quantity     : Integer;
  status       : String enum { submitted; cancelled; shipped; };
}`;

export const capServerTemplate = `'use strict';

const cds = require('@sap/cds');

// CDS server configuration — extends default bootstrap
module.exports = cds.server;

// Optional: Add custom Express middleware before CDS bootstrap
cds.on('bootstrap', (app) => {
  // Health check endpoint (no auth required)
  app.get('/health', (_req, res) => {
    res.json({ status: 'UP', timestamp: new Date().toISOString() });
  });
});
`;

export const capReadmeTemplate = `# {{projectName}} — CAP Backend

SAP Cloud Application Programming Model (CAP) backend service.

## Local Development

\`\`\`bash
npm install
cds watch           # Start with mock auth and in-memory SQLite
\`\`\`

## Testing

\`\`\`bash
# Test the OData service
curl http://localhost:4004/api/Books
curl http://localhost:4004/api/Authors

# Health check
curl http://localhost:4004/health
\`\`\`

## Deployment

\`\`\`bash
# From project root
mbt build
cf deploy mta_archives/{{projectName}}_1.0.0.mtar
\`\`\`

## Authentication

- **Local**: Mock auth (no login required)
- **BTP CF**: XSUAA with OAuth2 — users need the role collections assigned in BTP Cockpit

## Environment Variables (BTP CF)

Automatically injected via VCAP_SERVICES when bound to:
- \`{{xsuaaInstance}}\` — XSUAA for auth
- \`{{destinationInstance}}\` — Destination service for S/4HANA connectivity
`;
