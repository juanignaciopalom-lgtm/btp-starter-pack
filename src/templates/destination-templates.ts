/**
 * Destination templates.
 *
 * These are reference JSON files showing how to configure destinations
 * in the SAP BTP Destination Service.
 *
 * Security note:
 * - Actual credentials (passwords, client secrets) are NOT included.
 * - Users must fill them in via the BTP Cockpit or Destination Service API.
 * - Placeholders use the <PLACEHOLDER> convention to make them visually obvious.
 */

export const s4hanaDestinationTemplate = `{
  "_comment": "S/4HANA destination template — fill in your system URL and credentials in BTP Cockpit",
  "Name": "S4HANA",
  "Type": "HTTP",
  "URL": "https://<your-s4hana-host>/sap/opu/odata/sap/",
  "Authentication": "BasicAuthentication",
  "User": "<S4HANA_RFC_USER>",
  "Password": "<FILL_IN_BTP_COCKPIT_NOT_HERE>",
  "ProxyType": "Internet",
  "Description": "S/4HANA OData service endpoint",
  "Additional Properties": {
    "HTML5.DynamicDestination": "true",
    "WebIDEEnabled": "true",
    "WebIDEUsage": "odata_gen"
  },
  "_manual_steps": [
    "1. Go to BTP Cockpit → Subaccount → Connectivity → Destinations",
    "2. Click 'New Destination'",
    "3. Fill in the fields above (without the _comment and _manual_steps keys)",
    "4. Enter the password in the Password field — NEVER store it in this file",
    "5. Click 'Check Connection' to verify"
  ],
  "_for_on_premise": [
    "If S/4HANA is on-premise, change ProxyType to 'OnPremise'",
    "Install Cloud Connector and configure a system mapping",
    "Create 'connectivity' service instance (included in setup)"
  ]
}`;

export const apiExternalDestinationTemplate = `{
  "_comment": "External REST API destination template",
  "Name": "EXTERNAL_API",
  "Type": "HTTP",
  "URL": "https://api.example.com/v1",
  "Authentication": "OAuth2ClientCredentials",
  "clientId": "<API_CLIENT_ID>",
  "clientSecret": "<FILL_IN_BTP_COCKPIT_NOT_HERE>",
  "tokenServiceURL": "https://auth.example.com/oauth/token",
  "ProxyType": "Internet",
  "Description": "External API integration",
  "Additional Properties": {
    "HTML5.DynamicDestination": "true"
  },
  "_manual_steps": [
    "1. Go to BTP Cockpit → Subaccount → Connectivity → Destinations",
    "2. Click 'New Destination'",
    "3. Fill in the fields above",
    "4. Enter the client secret in the 'Client Secret' field",
    "5. Click 'Check Connection'"
  ],
  "_authentication_options": {
    "NoAuthentication": "For public APIs",
    "BasicAuthentication": "For APIs with user/password",
    "OAuth2ClientCredentials": "For OAuth2 machine-to-machine (most common for APIs)",
    "OAuth2SAMLBearerAssertion": "For SAP-to-SAP (S/4HANA via SAML)",
    "PrincipalPropagation": "For user identity propagation to on-premise systems"
  }
}`;
