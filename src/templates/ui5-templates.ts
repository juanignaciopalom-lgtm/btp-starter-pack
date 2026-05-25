/**
 * SAPUI5 / Fiori frontend templates.
 */

export const ui5ManifestTemplate = `{
  "_version": "1.65.0",
  "sap.app": {
    "id": "{{ui5Namespace}}",
    "type": "application",
    "title": "{{projectName}}",
    "description": "{{projectName}} SAPUI5 application",
    "applicationVersion": {
      "version": "1.0.0"
    },
    "dataSources": {
      "mainService": {
        "uri": "/api/",
        "type": "OData",
        "settings": {
          "annotations": [],
          "localUri": "localService/metadata.xml",
          "odataVersion": "4.0"
        }
      }
    },
    "offline": false
  },
  "sap.ui": {
    "technology": "UI5",
    "icons": {
      "icon": "sap-icon://home"
    },
    "deviceTypes": {
      "desktop": true,
      "tablet": true,
      "phone": true
    }
  },
  "sap.ui5": {
    "flexEnabled": true,
    "dependencies": {
      "minUI5Version": "1.120.0",
      "libs": {
        "sap.ui.core": {},
        "sap.m": {},
        "sap.ui.layout": {},
        "sap.f": {}
      }
    },
    "contentDensities": {
      "compact": true,
      "cozy": true
    },
    "models": {
      "": {
        "dataSource": "mainService",
        "settings": {
          "operationMode": "Server",
          "groupId": "$auto"
        }
      },
      "i18n": {
        "type": "sap.ui.model.resource.ResourceModel",
        "settings": {
          "bundleName": "{{ui5Namespace}}.i18n.i18n"
        }
      }
    },
    "routing": {
      "config": {
        "routerClass": "sap.m.routing.Router",
        "viewType": "XML",
        "viewPath": "{{ui5Namespace}}.view",
        "controlId": "app",
        "controlAggregation": "pages",
        "async": true
      },
      "routes": [
        {
          "name": "RouteMain",
          "pattern": "",
          "target": ["TargetMain"]
        }
      ],
      "targets": {
        "TargetMain": {
          "viewType": "XML",
          "viewLevel": 1,
          "viewName": "Main"
        }
      }
    },
    "rootView": {
      "viewName": "{{ui5Namespace}}.view.Main",
      "type": "XML",
      "async": true,
      "id": "app"
    }
  }
}`;

export const ui5ComponentTemplate = `sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/Device"
], function (UIComponent, Device) {
  "use strict";

  return UIComponent.extend("{{ui5Namespace}}.Component", {

    metadata: {
      manifest: "json"
    },

    init: function () {
      // Call the base component's init function
      UIComponent.prototype.init.apply(this, arguments);

      // Initialize the router
      this.getRouter().initialize();
    },

    getContentDensityClass: function () {
      if (!this._sContentDensityClass) {
        if (!Device.support.touch) {
          this._sContentDensityClass = "sapUiSizeCompact";
        } else {
          this._sContentDensityClass = "sapUiSizeCozy";
        }
      }
      return this._sContentDensityClass;
    }
  });
});
`;
