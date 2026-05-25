# BTP Starter Pack

> **Wizard interactivo para configurar SAP BTP Cloud Foundry y generar proyectos full-stack listos para evolucionar.**

Desarrollado por **Juan Ignacio Palomeque** · SAP Fullstack Developer Sr

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![SAP BTP](https://img.shields.io/badge/SAP_BTP-Cloud_Foundry-0070F2)](https://www.sap.com/products/technology-platform.html)

---

## ¿Qué es?

BTP Starter Pack es una aplicación con **wizard web paso a paso** que guía a cualquier desarrollador o consultor SAP a través de la configuración completa de un entorno SAP BTP Cloud Foundry, y genera proyectos full-stack (CAP + SAPUI5 + AppRouter) estructurados y listos para crecer.

> **Principio honesto:** La herramienta automatiza el 80% del trabajo de configuración inicial — el 20% restante son limitaciones propias de SAP BTP Trial que requieren el Cockpit. Sin promesas mágicas; sin ocultar la realidad.

---

## ¿Qué automatiza?

| Acción | Tipo |
|--------|------|
| Verificar dependencias locales (Node, CF CLI, BTP CLI, CDS, UI5, MBT) | ✅ Auto |
| Login BTP CLI y CF CLI | ⚠ Semi (browser OIDC requerido por SAP) |
| Detectar subaccount y CF environment | ✅ Auto |
| Crear CF Space | ✅ Auto |
| Crear servicios CF (xsuaa, destination, html5-apps-repo × 2, logs) | ✅ Auto |
| Generar xs-security.json | ✅ Auto |
| Scaffold CAP + SAPUI5 + AppRouter | ✅ Auto |
| Auto-reparar mta.yaml antes del deploy (4 fixes) | ✅ Auto |
| Build (`mbt build`) + Deploy (`cf deploy`) | ✅ Auto |
| Suscribir a BAS | ❌ Manual (Cockpit) |
| Asignar Role Collections | ❌ Manual (Cockpit) |
| Configurar Destinations (S/4HANA) | ❌ Manual (templates provistos) |
| Crear SAP HANA Cloud | ❌ Manual (limitación SAP) |

---

## Los 4 Auto-Repairs del Deploy

Antes de ejecutar `mbt build`, el wizard detecta y corrige automáticamente los 4 problemas más comunes del `mta.yaml`:

| Fix | Problema | Solución |
|-----|---------|---------|
| Fix 1 | Módulo `xsuaa-deployer` innecesario | Eliminado automáticamente |
| Fix 2 | `deployed-after` genera dependencias circulares | Removido |
| Fix 3 | `npm ci` falla en ciertos entornos | Reemplazado por `npm install` |
| Fix 4 | AppRouter bound a `app-host` en lugar de `app-runtime` | Crea instancia `app-runtime` y re-bindea |

---

## Instalación

### Requisitos previos

| Herramienta | Versión | Instalación |
|-------------|---------|-------------|
| Node.js | 18+ LTS | `winget install OpenJS.NodeJS.LTS` |
| Git | 2.x | `winget install Git.Git` |
| CF CLI | **v8.x** | [GitHub Releases](https://github.com/cloudfoundry/cli/releases/latest) |
| SAP BTP CLI | 2.x | [SAP Tools](https://tools.hana.ondemand.com/#cloud) |
| SAP CDS CLI | 7+ | `npm install -g @sap/cds-dk` |
| UI5 CLI | 3+ | `npm install -g @ui5/cli` |
| MBT | 1.2+ | `npm install -g mbt` |

### Clonar e instalar

```bash
git clone https://github.com/juanignaciopalom-lgtm/rma.git
cd rma/btp-starter-pack

# Instalar dependencias backend
npm install

# Instalar y compilar frontend
npm run build:ui

# Compilar TypeScript → JavaScript
npm run build
```

---

## Uso — Modo Wizard (recomendado)

```bash
# Iniciar servidor y abrir el wizard en el browser
npm run start:ui
# → abre http://localhost:3001 automáticamente
```

El wizard guía por 6 pasos secuenciales con UI visual, estado persistente y botón de reset por paso.

---

## Uso — Modo CLI

```bash
# Verificar dependencias
btp-starter-pack doctor
btp-starter-pack doctor --fix

# Inicializar workspace
btp-starter-pack init --email tu@email.com --region eu10

# Login (BTP + CF)
btp-starter-pack login

# Preview de acciones
btp-starter-pack plan

# Crear servicios CF
btp-starter-pack setup --dry-run   # preview
btp-starter-pack setup             # ejecutar

# Validar entorno
btp-starter-pack validate

# Generar proyecto
btp-starter-pack generate-project --name mi-app --type cap-ui5-approuter

# Deploy
btp-starter-pack deploy
```

### Tipos de proyecto disponibles

| Tipo | Stack | Cuándo usarlo |
|------|-------|--------------|
| `cap-ui5-approuter` | CAP + SAPUI5 + AppRouter | Full-stack con auth — base para producción |
| `cap-ui5` | CAP + SAPUI5 | Sin AppRouter, auth externa |
| `cap-only` | CAP Node.js | Solo backend API REST/OData |
| `ui5-only` | SAPUI5 | Solo frontend Fiori |

---

## Pasos manuales en BTP Cockpit

Después del wizard, estos pasos **no se pueden automatizar** por limitaciones de SAP Trial:

1. Abrí [https://account.hanatrial.ondemand.com/](https://account.hanatrial.ondemand.com/)
2. **Suscribir BAS:** `Service Marketplace → SAP Business Application Studio → Subscribe (free plan)`
3. **Asignar rol:** `Security → Role Collections → Business_Application_Studio_Developer → Add user`

---

## Estructura del proyecto

```
btp-starter-pack/
├── src/
│   ├── commands/          # doctor, init, login, plan, setup, validate,
│   │                      # generate-project, deploy, clean, ui
│   ├── ui-server/         # Express server, REST API, job manager, wizard state
│   ├── templates/         # mta-yaml, xs-security, CAP, SAPUI5, AppRouter, renderer
│   ├── btp/               # Wrappers BTP CLI, CF CLI, catálogo de servicios
│   └── core/              # config (Zod), logger (Winston), runner, platform, prompts
├── ui/
│   └── src/
│       ├── steps/         # Step1Prerequisites → Step6Deploy
│       ├── components/    # Terminal, StatusBadge, StepResetButton, ...
│       └── store.ts       # Estado global del wizard
├── tests/
│   ├── unit/              # Vitest — config, logger, runner, renderer, wizard-state...
│   └── fixtures/          # JSON fixtures SAP BTP / CF marketplace
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Scripts de desarrollo

```bash
npm run build          # Compila TypeScript → dist/
npm run build:watch    # Compilación continua (hot reload backend)
npm run build:ui       # Build del frontend React → dist-ui/
npm run build:all      # Backend + frontend
npm run start:ui       # Inicia servidor + abre browser
npm test               # Build + suite de tests
npm run test:vitest    # Tests unitarios con Vitest
npm run test:coverage  # Tests con reporte de cobertura
npm run lint           # ESLint
npm run format         # Prettier
```

### Desarrollo con hot reload

```bash
# Terminal 1 — TypeScript watch
npm run build:watch

# Terminal 2 — Frontend Vite dev server (http://localhost:5173)
cd ui && npm run dev

# Terminal 3 — Backend
node dist/index.js ui
```

---

## Configuración (.btp-starter.json)

Generado automáticamente por `init`. **No contiene contraseñas ni tokens.**

```json
{
  "version": "1.0.0",
  "email": "tu@email.com",
  "region": "eu10",
  "globalAccountSubdomain": "trial",
  "cfApiEndpoint": "https://api.cf.eu10.hana.ondemand.com",
  "cfOrg": "trialorg",
  "cfSpace": "dev"
}
```

---

## Servicios CF creados por `setup`

| Servicio | Plan | Necesario para |
|---------|------|---------------|
| xsuaa | application | Autenticación OAuth2 |
| destination | lite | Conexiones a backends externos |
| html5-apps-repo | app-host | Subir contenido estático UI5 |
| html5-apps-repo | app-runtime | AppRouter — credenciales OAuth en runtime |
| application-logs | lite | Logs centralizados en SAP Cloud |

---

## Seguridad

- **Sin almacenamiento de credenciales** — passwords y tokens nunca se guardan en disco
- **Browser-based auth** — toda autenticación SAP usa OIDC con browser
- **Command injection prevention** — todos los CLI calls usan arrays de argumentos (CWE-78)
- **Argument injection prevention** — inputs de usuario validados antes de usarse como args CLI (CWE-88)
- **Log sanitization** — JWT, clientsecrets y passwords redactados en todos los logs (CWE-532)
- **Destructive action guards** — `clean` requiere frase de confirmación explícita
- **Dry-run por defecto** — `plan` y `clean` muestran acciones antes de ejecutar
- **Schema validation** — toda lectura de config pasa por Zod

---

## Troubleshooting rápido

| Error | Solución |
|-------|---------|
| `command not found` (btp, cf, mbt...) | Reinstalar + reiniciar terminal (PATH no se refresca en terminales abiertas) |
| CF CLI v7 detectado | Actualizar a v8: `brew upgrade cf-cli@8` o reinstalar en Windows |
| SSO one-time passcode expirado | Clic en "Reset CF Login" → el código vence en 60 segundos |
| `grant_type: missing` en AppRouter | Auto-reparado en v1.1.0 (Fix 4) — actualizar con `git pull && npm run build:all` |
| `mbt build` falla | `npm install` en `srv/` y `approuter/` antes del build |
| App en estado `crashed` post-deploy | `cf logs mi-app-approuter --recent` para ver el error exacto |
| Quota excedida en Trial | `cf stop` apps que no se usan; `cf delete-service` servicios obsoletos |

Para un troubleshooting detallado por paso → ver el **[Manual Interactivo](./btp-starter-pack-manual.html)**.

---

## Documentación y materiales

| Archivo | Descripción |
|---------|-------------|
| `btp-starter-pack-manual.html` | Manual interactivo completo — abrir en browser |
| `marketing-hero.svg` | Imagen hero para presentaciones y LinkedIn |
| `marketing-before-after.svg` | Comparativa antes/después del setup |
| `marketing-architecture.svg` | Diagrama de arquitectura del sistema |

---

## Checklist — Entorno listo

- [ ] `btp-starter-pack doctor` — todos los checks ✅
- [ ] `btp-starter-pack login` — sesiones BTP y CF activas
- [ ] `btp-starter-pack validate` — todos los checks pasan
- [ ] Suscripción BAS activa en Cockpit
- [ ] Role Collection `Business_Application_Studio_Developer` asignada
- [ ] `btp-starter-pack generate-project` — proyecto generado sin errores
- [ ] `cf deploy` exitoso — apps en estado `started`
- [ ] App accesible desde su URL en CF (`cf app mi-app-approuter`)

---

## Autor

**Juan Ignacio Palomeque** · SAP Fullstack Developer Sr  
Especialista en SAP BTP, CAP framework, SAPUI5 y arquitecturas Cloud Foundry enterprise.  
GitHub: [@juanignaciopalom-lgtm](https://github.com/juanignaciopalom-lgtm)

---

*SAP, SAP BTP, Cloud Foundry, CAP, SAPUI5 son marcas registradas de SAP SE.*
*Todos los derechos reservados sobre esta herramienta.*
