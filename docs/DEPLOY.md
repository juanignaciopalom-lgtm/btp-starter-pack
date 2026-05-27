# Guía de Deploy — GitHub Pages + btpstarter.dev

## Resultado final

La página pública quedará accesible en:
```
https://btpstarter.dev
```

Con las siguientes rutas:
- `/` → Landing page (index.html)
- `/manual.html` → Manual de BTP Starter Pack
- `/guia-manual.html` → Guía de configuración manual SAP BTP

---

## Paso 1 — Subir los archivos a GitHub

Desde tu máquina local, en el directorio raíz del repo `rma/`:

```bash
git add btp-starter-pack/docs/
git commit -m "feat: add GitHub Pages docs site (landing + manuals)"
git push origin master
```

---

## Paso 2 — Habilitar GitHub Pages en el repositorio

1. Ir a: `https://github.com/juanignaciopalom-lgtm/rma/settings/pages`
2. En **Source**, seleccionar:
   - Branch: `master`
   - Folder: `/btp-starter-pack/docs`
3. Hacer clic en **Save**

GitHub va a publicar el sitio en:
```
https://juanignaciopalom-lgtm.github.io/rma/
```
(disponible en ~1-2 minutos)

---

## Paso 3 — Comprar el dominio btpstarter.dev

### Opción A: Porkbun (recomendado — precio más bajo)
1. Ir a: https://porkbun.com
2. Buscar `btpstarter.dev`
3. Precio aproximado: **~$12/año** (primer año puede tener descuento)
4. Crear cuenta y completar la compra

### Opción B: Namecheap
1. Ir a: https://namecheap.com
2. Buscar `btpstarter.dev`
3. Precio aproximado: **~$13/año**

> **Nota:** `.dev` requiere HTTPS por especificación del TLD. GitHub Pages provee HTTPS automático vía Let's Encrypt — no hay nada extra que configurar.

---

## Paso 4 — Configurar DNS en el registrar (Porkbun / Namecheap)

### Registros DNS a crear

En el panel de DNS de tu registrar, crear los siguientes registros:

#### Registros A (apuntan a GitHub Pages)
```
Tipo    Nombre    Valor              TTL
A       @         185.199.108.153    600
A       @         185.199.109.153    600
A       @         185.199.110.153    600
A       @         185.199.111.153    600
```

#### Registro CNAME (para www)
```
Tipo      Nombre    Valor                                TTL
CNAME     www       juanignaciopalom-lgtm.github.io.     600
```

---

## Paso 5 — Agregar dominio en GitHub Pages

1. Ir a: `https://github.com/juanignaciopalom-lgtm/rma/settings/pages`
2. En **Custom domain**, escribir: `btpstarter.dev`
3. Hacer clic en **Save**
4. Esperar la verificación DNS (puede tardar hasta 24hs, pero suele ser en minutos)
5. Una vez verificado, tildar **Enforce HTTPS**

> El archivo `CNAME` en `docs/` ya tiene `btpstarter.dev` — GitHub lo usa automáticamente.

---

## Verificación final

```bash
# Verificar que el DNS apunta a GitHub Pages
dig btpstarter.dev +short
# Debe devolver: 185.199.108.153 (o alguno de los 4 IPs de arriba)

# Verificar CNAME
dig www.btpstarter.dev +short
# Debe devolver: juanignaciopalom-lgtm.github.io.

# Probar el sitio
curl -I https://btpstarter.dev
# Debe devolver: HTTP/2 200
```

---

## Actualizaciones futuras

Para actualizar el sitio (después de hacer cambios en los manuales):

```bash
# Desde la raíz del repo
cp btp-starter-pack/btp-starter-pack-manual.html btp-starter-pack/docs/manual.html
cp btp-starter-pack/sap-btp-manual-configuracion.html btp-starter-pack/docs/guia-manual.html

git add btp-starter-pack/docs/
git commit -m "docs: update manuals"
git push origin master
# GitHub Pages se actualiza automáticamente en ~1 minuto
```

---

## Troubleshooting rápido

| Problema | Causa | Solución |
|---------|-------|---------|
| Sitio no carga en btpstarter.dev | DNS no propagado | Esperar hasta 24hs. Verificar con `dig btpstarter.dev` |
| Error "Domain already taken" en GitHub | Otro repo usa ese CNAME | Asegurarse de que ningún otro repositorio tuyo tiene `btpstarter.dev` como dominio |
| HTTPS no funciona | DNS recién configurado | GitHub tarda ~24hs en emitir el certificado SSL. No hacer nada. |
| Página desactualizada | Cache del browser | Ctrl+Shift+R (hard refresh) |
| 404 en /manual.html | Los archivos no están en docs/ | Verificar que `docs/manual.html` y `docs/guia-manual.html` existen en el repo |
