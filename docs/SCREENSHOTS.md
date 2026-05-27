# Guía de capturas de pantalla — BTP Starter Pack

Tomá estas 5 capturas con el wizard corriendo en tu máquina local (`npm run start:ui`).
Guardá cada imagen en `btp-starter-pack/docs/screenshots/` con el nombre exacto indicado.

---

## Cómo integrar cada imagen en la landing

En `docs/index.html`, buscá cada bloque `<!-- Reemplazá el placeholder con: ... -->` y reemplazá el `<div class="shot-placeholder">` con la etiqueta `<img>` indicada en el comentario.

---

## Captura 1 — `step1-doctor.png`

**Paso 1: Verificación de dependencias (Doctor)**

Momento para tomar la captura:
1. Abrí el wizard y andá al Paso 1
2. Hacé click en "Verificar dependencias"
3. Esperá a que todos los checks sean verdes

**Qué tiene que mostrar la captura:**
- El panel completo del Paso 1 con los 7 checks
- Todos en estado ✅ verde (Node, CF CLI v8, BTP CLI, MBT, Git, npm, internet)
- El título "Paso 1 — Verificar Prerequisitos" visible

**Resolución recomendada:** Ventana del browser a 1280×800, capturá solo el panel derecho del wizard

**Integración en HTML:**
```html
<img src="screenshots/step1-doctor.png" class="shot-real" alt="Doctor — Verificación de dependencias">
```

---

## Captura 2 — `step2-login.png`

**Paso 2: Login BTP + CF — Sesiones activas**

Momento para tomar la captura:
1. Completá el login de BTP CLI y CF CLI
2. Verificá que el Paso 2 muestre sesión activa

**Qué tiene que mostrar la captura:**
- El panel del Paso 2 con el usuario logueado
- Org y Space seleccionados visibles
- Estado "Sesión activa" en verde

**Integración en HTML:**
```html
<img src="screenshots/step2-login.png" class="shot-real" alt="Login BTP y CF exitoso">
```

---

## Captura 3 — `step4-servicios.png`

**Paso 4: Servicios CF creados**

Momento para tomar la captura:
1. Ejecutá la creación de servicios
2. Esperá a que los 5 servicios aparezcan en estado OK

**Qué tiene que mostrar la captura:**
- Los 5 servicios en verde: xsuaa, destination, html5-apps-repo (host), html5-apps-repo (runtime), application-logs
- La terminal a la derecha con los comandos `cf create-service` ejecutados
- Sin errores visibles

**Integración en HTML:**
```html
<img src="screenshots/step4-servicios.png" class="shot-real" alt="5 servicios CF creados exitosamente">
```

---

## Captura 4 — `step5-proyecto.png`

**Paso 5: Proyecto generado**

Momento para tomar la captura:
1. Generá el proyecto en el Paso 5
2. Mostrá la estructura de archivos generados en la terminal o en VS Code

**Opción A — Terminal con tree:**
```bash
cd nombre-de-tu-proyecto
tree -L 2
```

**Opción B — VS Code:** Abrí el proyecto generado en VS Code, mostrá el explorador de archivos con las carpetas `srv/`, `app/`, `db/`, y los archivos `mta.yaml`, `xs-security.json`, `package.json` visibles.

**Qué tiene que mostrar la captura:**
- Estructura de carpetas completa del proyecto generado
- Archivos clave visibles: `mta.yaml`, `xs-security.json`, `package.json`

**Integración en HTML:**
```html
<img src="screenshots/step5-proyecto.png" class="shot-real" alt="Estructura del proyecto generado">
```

---

## Captura 5 — `step6-deploy.png`

**Paso 6: Deploy exitoso**

Momento para tomar la captura:
1. Ejecutá el deploy completo
2. Esperá al mensaje de éxito

**Qué tiene que mostrar la captura:**
- La terminal con el mensaje final de deploy exitoso (algo como `Process finished.` o la URL de la app)
- La URL de la app corriendo en Cloud Foundry (cfapps.*.hana.ondemand.com)
- Sin errores en rojo

**Integración en HTML:**
```html
<img src="screenshots/step6-deploy.png" class="shot-real" alt="Deploy exitoso en Cloud Foundry">
```

---

## Actualización en Netlify

Después de guardar las 5 imágenes en `docs/screenshots/` y actualizar el HTML:

```bash
# Desde la raíz del repo
git add btp-starter-pack/docs/
git commit -m "feat: add real wizard screenshots to landing page"
git push origin master
```

O simplemente re-arrastrá la carpeta `docs/` al dashboard de Netlify — el sitio se actualiza en ~30 segundos.

---

## Tips para capturas limpias

- Usá el browser a 1280×800 o 1440×900
- Modo oscuro del OS (coincide con el diseño de la landing)
- Ocultá la barra de favoritos del browser (Ctrl+Shift+B en Chrome)
- No mostrés paths locales sensibles (tu usuario del OS, rutas de carpetas personales)
- Comprimí las imágenes a menos de 200KB c/u — usá [Squoosh](https://squoosh.app/) si necesitás reducir tamaño
