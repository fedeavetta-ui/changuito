# Changuito Rosario

App para comparar precios de Coto, Carrefour, Jumbo y Cepro en Rosario y armar la lista del súper.
Se instala en el celular desde el navegador y se actualiza sola todos los días con GitHub (gratis).

## Cómo ponerla en marcha (una sola vez, desde la compu)

1. **Cuenta:** entrá a https://github.com y creá una cuenta gratis.
2. **Repositorio:** arriba a la derecha, **+ → New repository**. Nombre: `changuito`. Dejalo en **Public**. Tocá **Create repository**.
3. **Subir los archivos:** en la página del repositorio nuevo tocá **uploading an existing file**. Arrastrá *todo lo que hay dentro* de esta carpeta (archivos y carpetas: `index.html`, `app.js`, `app.css`, `sw.js`, `manifest.webmanifest`, `LEEME.md`, y las carpetas `data`, `icons` y `scanner`). Abajo tocá **Commit changes**.
4. **El relevamiento diario:** en el repositorio tocá **Add file → Create new file**. En el nombre escribí exactamente `.github/workflows/relevamiento.yml` y pegá adentro el contenido del archivo `relevamiento.yml` que viene en la carpeta `.github/workflows` (si tu compu no muestra esa carpeta, está también como `relevamiento.yml.txt` al lado de este LEEME). Tocá **Commit changes**.
5. **Publicar la app:** **Settings → Pages**. En *Source* elegí **GitHub Actions**.
6. **Primer relevamiento:** pestaña **Actions → Relevamiento diario → Run workflow → Run workflow**. Tarda unos 10 minutos. Cuando termina aparece un tilde verde.
7. **Listo:** la app queda en `https://TU-USUARIO.github.io/changuito/`. Abrila en el celular e instalala:
   - iPhone (Safari): Compartir → **Agregar a inicio**.
   - Android (Chrome): menú ⋮ → **Instalar app** o **Agregar a la pantalla principal**.

Desde ahí se actualiza sola todos los días a las 7:17. Si un día falla, GitHub te manda un mail y la app sigue mostrando los últimos precios buenos.

## Si algo no anda
- **El paso 6 falla con "Permission denied" al guardar:** Settings → Actions → General → *Workflow permissions* → **Read and write permissions** → Save, y volvé a correrlo.
- **Una cadena dice "Sin datos" en Ajustes:** esa cadena bloqueó el relevamiento desde GitHub; la app usa los últimos precios guardados.

## Qué hay adentro
- `index.html`, `app.js`, `app.css`, `sw.js`, `manifest.webmanifest`, `icons/`: la app.
- `scanner/`: el relevador (Node). `scanner/basket-items.json` es la compra mensual de 52 productos.
- `data/`: los precios (los escribe el relevador). `data/promos.json`: descuentos bancarios, editable a mano.
