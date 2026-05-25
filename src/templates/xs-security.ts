/**
 * xs-security.json template — XSUAA security descriptor.
 * Used by `cf create-service xsuaa application <instance> -c xs-security.json`
 */

export const xsSecurityTemplate = `{
  "xsappname": "{{projectName}}",
  "tenant-mode": "dedicated",
  "description": "Security configuration for {{projectName}}",
  "scopes": [
    {
      "name": "$XSAPPNAME.Read",
      "description": "Read access to {{projectName}} data"
    },
    {
      "name": "$XSAPPNAME.Write",
      "description": "Write access to {{projectName}} data"
    }
  ],
  "attributes": [],
  "role-templates": [
    {
      "name": "Viewer",
      "description": "Read-only access to {{projectName}}",
      "scope-references": ["$XSAPPNAME.Read"],
      "attribute-references": []
    },
    {
      "name": "Editor",
      "description": "Full access to {{projectName}}",
      "scope-references": ["$XSAPPNAME.Read", "$XSAPPNAME.Write"],
      "attribute-references": []
    }
  ],
  "role-collections": [
    {
      "name": "{{projectName}}-Viewer",
      "description": "{{projectName}} read-only access",
      "role-template-references": ["$XSAPPNAME.Viewer"]
    },
    {
      "name": "{{projectName}}-Editor",
      "description": "{{projectName}} full access",
      "role-template-references": ["$XSAPPNAME.Editor"]
    }
  ],
  "oauth2-configuration": {
    "token-validity": 43200,
    "refresh-token-validity": 604800
  }
}`;
