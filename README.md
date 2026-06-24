# Viaje Promo Dante 2028

Landing interactiva para cruzar la nomina de 4to A y 4to B con las respuestas exportadas desde Google Forms.

## Uso

1. Exportar las respuestas del Google Form como CSV.
2. Abrir la app.
3. Usar `Cargar CSV de respuestas`.

La app marca:

- quienes confirmaron que viajan
- quienes indicaron que no viajan
- quienes faltan confirmar
- observaciones sobre descuentos, liberados y hermanos mellizos/gemelos

## Actualizacion cloud de respuestas

La carga desde la pagina usa `api/responses.js` para actualizar `public/data/responses.json` en GitHub.
Para que funcione en Vercel, configurar estas variables de entorno:

- `GITHUB_TOKEN`: token con permiso `contents: read/write` sobre `Panchomorell/viaje-promo-dante-2028`
- `ADMIN_PASSWORD`: contraseña de administracion. Si no se define, usa `DA2028`.
- `GITHUB_OWNER`: opcional, por defecto `Panchomorell`
- `GITHUB_REPO`: opcional, por defecto `viaje-promo-dante-2028`
- `GITHUB_BRANCH`: opcional, por defecto `main`

Cuando alguien carga una planilla y confirma la contraseña, la API commitea el JSON actualizado.
El proyecto Vercel conectado a GitHub redeploya desde ese commit.
