# Rutas HTTP

Todas las respuestas HTML salvo `/api/*` (JSON) y `/pagos/webhook`. Los POST de formularios llevan `_csrf`; los de la API llevan la cabecera `x-csrf-token` (valor en `<meta name="csrf-token">`).

## Públicas

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Portada: buscador, categorías con conteo, destacados, últimas |
| GET | `/buscar` | Listado con filtros: `q, categoria, marca, provincia, estado_maquina, moneda, precio_min, precio_max, anio_min, anio_max, horas_max, verificados, permuta, orden (precio_asc|precio_desc|anio_desc), pagina` |
| GET | `/categoria/:slug`, `/marca/:slug`, `/provincia/:slug` | Atajos de búsqueda (aceptan los mismos filtros) |
| GET | `/aviso/:id{/:slug}` | Ficha. Solo `activo` para el público; el dueño y el staff ven cualquier estado. Cuenta visitas. |
| GET | `/vendedor/:slug` | Perfil público con sus avisos activos |
| GET | `/terminos`, `/privacidad`, `/arrepentimiento`, `/consejos-de-seguridad`, `/como-publicar`, `/ayuda`, `/contacto` | Páginas desde `legal/*.md` |
| GET | `/robots.txt`, `/sitemap.xml` | SEO |
| GET | `/salud` | Chequeo de salud para monitoreo y hosting (responde `ok`) |

## Autenticación

| Método | Ruta | Notas |
|---|---|---|
| GET/POST | `/registrarse` | `nombre, email, contrasena, tipo, acepta, cf-turnstile-response`. Rate limit 5/h. |
| GET | `/verificar-email/:token` | Confirma email |
| GET/POST | `/ingresar` | 10 intentos / 15 min |
| POST | `/salir` | |
| GET/POST | `/recuperar` | Envía enlace (3/h) |
| GET/POST | `/restablecer/:token` | Nueva contraseña; cierra todas las sesiones |
| GET | `/verificar-telefono` | Lista de teléfonos y formularios (requiere login). Solo con `TELEFONO_VERIFICACION=otp`; si no, redirige a `/mi-cuenta` |
| POST | `/verificar-telefono/enviar` | `numero, canal (whatsapp|sms)` |
| POST | `/verificar-telefono/confirmar` | `codigo` (6 dígitos) |
| POST | `/verificar-telefono/quitar` | `id` |

## Cuenta (requiere login)

| Método | Ruta | Notas |
|---|---|---|
| GET/POST | `/mi-cuenta` | Datos; `POST /mi-cuenta/contrasena` (actual, nueva); `POST /mi-cuenta/eliminar` (contrasena); `POST /mi-cuenta/telefono` (numero; solo modo `ninguna`: guarda el WhatsApp y lo aplica a todos los avisos) |
| POST | `/mi-empresa` | `razon_social, cuit, nombre_fantasia, descripcion, direccion` |
| GET | `/mis-avisos` | |
| GET/POST | `/publicar` | multipart: campos del aviso, `fotos[]`, `ficha[campo]`. Redirige a verificar teléfono si no hay uno vigente. Rate limit 10/h. |
| GET/POST | `/aviso/:id/editar` | Igual que publicar + `borrar_foto[]` |
| POST | `/aviso/:id/estado` | `accion`: pausar, activar, vendido, renovar, eliminar |
| GET | `/favoritos` | |
| GET/POST | `/alertas`, `POST /alertas/:id/borrar` | `nombre, filtros` (JSON) |
| GET | `/pagos` | Historial |

## API JSON

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/aviso/:id/telefono` | `{ "cf-turnstile-response", "tipo": "whatsapp" }` | `{ telefono, mostrar, whatsapp, llamada, aviso_seguridad }`. 404 aviso no activo, 410 teléfono a reverificar, 429 límite diario, 400 Turnstile. |
| POST | `/api/aviso/:id/reportar` | `{ motivo, comentario, "cf-turnstile-response" }` | `{ ok, mensaje }` |
| POST | `/api/aviso/:id/favorito` | — | `{ favorito: true|false }` o 401 `{ login }` |
| GET | `/api/marcas` | — | `[ { id, nombre, slug } ]` |

## Pagos

| Método | Ruta | Notas |
|---|---|---|
| GET/POST | `/pagos/destacar/:avisoId` | `concepto`: destacado_7, destacado_15, destacado_30, bump → redirige a Mercado Pago |
| GET | `/pagos/retorno?estado=ok|error|pendiente` | Vuelta del checkout (informativa) |
| POST | `/pagos/webhook` | Notificación de MP (`type=payment`, `data.id`). Sin sesión ni CSRF; valida firma. |

## Administración (rol admin o moderador)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/admin` | Estadísticas y últimas acciones |
| GET | `/admin/moderacion` | Avisos en revisión ordenados por riesgo |
| POST | `/admin/aviso/:id/decidir` | `decision`: aprobar, rechazar, suspender; `motivo` |
| GET | `/admin/reportes`, `POST /admin/reportes/:id` | `accion`: descartar, resolver |
| GET | `/admin/usuarios?q=` | Busca por email, nombre o teléfono |
| POST | `/admin/usuarios/:id` | `accion`: suspender, activar, validar_cuit, hacer_moderador, quitar_moderador, plan_basico, plan_pro, plan_ninguno |
| GET/POST | `/admin/listas-negras`, `POST /admin/listas-negras/:id/borrar` | `tipo, valor, motivo` |
| GET | `/admin/pagos` | |

## Códigos de error

- 400 validación (JSON: `{ error }`; HTML: flash y redirección).
- 403 CSRF inválido o rol insuficiente.
- 404 recurso inexistente o aviso no visible.
- 429 límite de tasa.
- 500 error interno (mensaje genérico en producción).
