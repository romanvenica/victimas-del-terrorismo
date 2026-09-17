# Modelo de datos

Definido en `migrations/20260917000001_init.js`. IDs de entidades de usuario: UUID (texto). Catálogos (provincias, categorías, marcas, listas negras, auditoría): enteros.

## Tablas

| Tabla | Para qué | Campos clave |
|---|---|---|
| `provincias` | 24 jurisdicciones con código INDEC | `id`, `nombre`, `slug` |
| `categorias` | Categorías con los campos de ficha técnica que aplican | `slug`, `icono`, `campos_ficha` (JSON: `["potencia_hp","traccion",…]`) |
| `marcas` | Marcas de maquinaria | `nombre`, `slug` |
| `usuarios` | Cuentas | `email`, `email_verificado`, `hash_contrasena` (bcrypt 12), `nombre`, `tipo` particular/profesional, `rol` usuario/moderador/admin, `estado` activo/suspendido/eliminado, `provincia_id`, `localidad`, `slug` (perfil público), `avisos_publicados` |
| `empresas` | Perfil de vendedor profesional | `usuario_id`, `razon_social`, `cuit`, `cuit_validado`, `nombre_fantasia`, `plan` ninguno/basico/pro, `plan_vence` |
| `telefonos` | Celulares verificados | `usuario_id`, `numero_e164` (+549…), `verificado`, `fecha_verificacion`, `canal`, `principal`, `activo` |
| `otp_codigos` | Códigos enviados | `numero_e164`, `codigo_hash` (bcrypt), `intentos`, `expira`, `usado`, `ip_hash` |
| `avisos` | Publicaciones | ver abajo |
| `aviso_fotos` | Fotos procesadas | `aviso_id`, `orden`, `url`, `url_miniatura`, `hash_perceptual` (dHash 64 bits hex), `ancho`, `alto` |
| `contactos` | Cada vez que alguien revela un teléfono | `aviso_id`, `usuario_id` (si logueado), `ip_hash`, `tipo` |
| `reportes` | Denuncias de usuarios | `aviso_id`, `motivo`, `comentario`, `estado` pendiente/resuelto/descartado, `ip_hash` |
| `favoritos` | Guardados | PK (`usuario_id`, `aviso_id`) |
| `alertas` | Búsquedas guardadas con envío por email | `filtros` (JSON del querystring), `nombre`, `activa`, `ultimo_envio` |
| `pagos` | Cobros | `usuario_id`, `aviso_id`, `concepto` destacado_7/15/30, bump, plan_*, `monto`, `estado` pendiente/aprobado/rechazado/reembolsado, `id_externo` (id de pago MP), `factura_id` |
| `facturas` | Comprobantes | `pago_id`, `tipo` A/B/C, `cae`, `numero`, `pdf_url` |
| `tokens` | Un solo uso: `reset` (30 min) y `email` (48 h) | `token_hash` (sha256), `expira`, `usado` |
| `listas_negras` | Bloqueos | `tipo` telefono/email/dominio_email/ip, `valor`, `motivo` |
| `auditoria` | Quién hizo qué | `actor_id`, `accion`, `entidad`, `entidad_id`, `detalle`, `ip_hash` |
| `sessions` | Sesiones (la crea connect-session-knex) | `sid`, `sess`, `expired` |

## Aviso

Campos: `usuario_id`, `empresa_id`, `categoria_id`, `marca_id`, `modelo`, `titulo`, `slug`, `descripcion`, `anio`, `horas_uso`, `estado_maquina` nuevo/usado, `precio` (null = consultar), `moneda` ARS/USD, `precio_mas_iva`, `acepta_permuta`, `acepta_financiacion`, `provincia_id`, `localidad`, `telefono_id` (FK a un teléfono verificado del mismo usuario), `acepta_whatsapp`, `acepta_llamada`, `estado`, `motivo_rechazo`, `puntaje_riesgo`, `senales_riesgo` (JSON), `ficha_tecnica` (JSON), `fecha_publicacion`, `fecha_vencimiento`, `destacado_hasta`, `bump_at`, `visitas`, `contactos`.

### Estados

```
                 publicar
   (1ª publicación o riesgo ≥ umbral)        (resto)
                 │                              │
                 ▼                              ▼
           en_revision ──aprobar──────────►  activo ◄──────┐
                 │                            │  ▲         │ activar / renovar
              rechazar                 pausar │  │ activar │
                 ▼                            ▼  │         │
             rechazado ──editar──► en_revision  pausado   vencido ◄── cron (fecha_vencimiento pasada)
                                              
   Cualquier estado ──"Marcar vendido"──► vendido      3 reportes graves en 7 días ──► en_revision
```

Solo `activo` es visible al público. El dueño y el staff ven cualquier estado. `eliminar` borra la fila (cascada a fotos, contactos, reportes, favoritos) y los archivos.

### Orden en listados

1. Destacados vigentes (`destacado_hasta > ahora`) primero.
2. Luego por `bump_at` descendente (se actualiza al publicar, aprobar, renovar y al comprar un bump).
3. Opcionalmente por precio o año según el filtro `orden`.

## Relaciones de integridad

- Un aviso siempre apunta a un `telefono_id` verificado del mismo usuario (se valida en la ruta). Si el usuario quita ese teléfono, sus avisos activos pasan a `pausado`.
- Un `numero_e164` verificado solo puede estar `activo` en una cuenta (se valida al enviar el OTP).
- Al eliminar la cuenta se anonimiza el usuario y se desactivan los teléfonos; los pagos y facturas se conservan.
