# Instrucciones para Claude Code

Este directorio es **AgroMarket**, un marketplace de clasificados de maquinaria agrícola usada para Argentina con contacto directo por WhatsApp (Node 22 + Express 5 + EJS + Knex; SQLite en desarrollo, PostgreSQL o SQLite en producción). La plataforma no interviene en la compraventa: conecta vendedor y comprador.

## Qué hay

- `src/` código de la app (rutas, servicios, middlewares, vistas EJS, CSS/JS).
- `migrations/`, `seeds/` esquema y datos base (se aplican solos al arrancar).
- `scripts/` `crear-admin.js`, `vencer-avisos.js` (cron externo), `smoke.js` (`npm test`, prueba de extremo a extremo).
- `deploy/` Dockerfile, docker-compose, nginx, systemd, `instalar-vps.sh`, `backup.sh`. `render.yaml` para Render.
- `docs/` documentación técnica; `docs/HOSTING-GRATIS.md` explica cómo alojarla gratis y los costos.
- `legal/` textos legales y de ayuda (Markdown, se sirven como páginas).
- `demo/index.html` demo estática navegable, sin servidor.

## Comandos

```bash
cp .env.example .env && npm install && npm start                    # desarrollo en http://localhost:3000
npm test                                                             # prueba de humo + flujo completo (registro, publicar, revelar teléfono)
node scripts/crear-admin.js admin@ejemplo.com "ContraseñaLarga"     # crear admin (o ADMIN_EMAIL/ADMIN_PASSWORD en .env)
```

## Modos (ver README → "Modos de configuración")

- `TELEFONO_VERIFICACION=ninguna` (por defecto): el vendedor escribe su WhatsApp al publicar; `otp.guardarSinVerificar` lo guarda en `telefonos` con `verificado=false`. `otp`: flujo de código por WhatsApp/SMS, solo teléfonos verificados. Toda lógica que dependa del modo pasa por `otp.requiereOtp()`; nunca asumir uno de los dos.
- `STORAGE=local|s3`: todas las escrituras y borrados de fotos van por `services/storage.js`; no usar `fs` directo para fotos.
- `MP_ACCESS_TOKEN` vacío = sin servicios pagos: las vistas ocultan "Destacar" con `config.pagosActivos`.
- `MODERAR_PRIMER_AVISO`, `CRON_INTERNO`, `ADMIN_EMAIL/ADMIN_PASSWORD`: ver `src/config.js`.

## Convenciones

- JavaScript CommonJS, sin TypeScript ni build. Español rioplatense en textos de UI, nombres de variables en español.
- Nada de scripts inline en las vistas (CSP estricta): todo el JS va en `src/public/js/app.js`.
- Todo POST lleva `_csrf` (formularios) o cabecera `x-csrf-token` (API). Los multipart verifican CSRF después de multer con `csrf.verificar`.
- Validación con zod en `middleware/validate.js`; campos numéricos opcionales del formulario con `numOpcional` (un input vacío llega como `''` y `z.coerce` lo haría 0). Checkboxes: con `marcado()`, nunca comparar contra `'off'` (un checkbox sin marcar no envía nada).
- Consultas siempre con Knex parametrizado. Booleanos: en SQLite vuelven como 0/1 y en PostgreSQL como true/false; en vistas usar truthiness, no `=== false`.
- Fechas en UTC; en SQLite se guardan como texto `YYYY-MM-DD HH:MM:SS.mmm` (ver `src/db.js`), no cambiar ese formato.
- El router `cuenta` va antes que `publico` para que `/aviso/:id/editar` gane a `/aviso/:id/:slug`.
- Lo que la vista necesita de la configuración se expone en `res.locals.config` (`src/app.js`), no se importa `config` desde EJS.
- Antes de dar por terminado un cambio: `npm test` debe pasar y `node src/server.js` debe levantar sin errores.

## Pendientes conocidos

Ver README.md → "Qué falta para operar": textos legales, SMTP real, Turnstile; más adelante OTP real, Mercado Pago, facturación ARCA.
