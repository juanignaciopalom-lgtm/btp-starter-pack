/**
 * AppRouter templates — for XSUAA-authenticated routing.
 */

export const approuterPackageTemplate = `{
  "name": "{{appRouterName}}",
  "version": "1.0.0",
  "description": "Application Router for {{projectName}} — handles XSUAA authentication and routing",
  "dependencies": {
    "@sap/approuter": "^16"
  },
  "scripts": {
    "start": "node node_modules/@sap/approuter/approuter.js"
  },
  "engines": {
    "node": ">=20"
  }
}`;

export const approuterXsAppTemplate = `{
  "welcomeFile": "/{{projectName}}/index.html",
  "authenticationMethod": "route",
  "logout": {
    "logoutEndpoint": "/do/logout"
  },
  "routes": [
    {
      "source": "^/api/(.*)$",
      "target": "/api/$1",
      "destination": "srv-binding",
      "csrfProtection": true,
      "authenticationType": "xsuaa"
    },
    {
      "source": "^/{{projectName}}/(.*)$",
      "target": "/$1",
      "service": "html5-apps-repo-rt",
      "authenticationType": "xsuaa"
    },
    {
      "source": "^(.*)$",
      "target": "$1",
      "service": "html5-apps-repo-rt",
      "authenticationType": "xsuaa"
    }
  ],
  "responseHeaders": [
    {
      "name": "X-Frame-Options",
      "value": "SAMEORIGIN"
    },
    {
      "name": "X-Content-Type-Options",
      "value": "nosniff"
    }
  ]
}`;
