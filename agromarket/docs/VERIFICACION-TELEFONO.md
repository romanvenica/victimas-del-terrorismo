# Verificación de teléfono y prevención de fraude

Objetivo: que ningún aviso muestre un teléfono que no pertenezca a quien publica, y que los teléfonos no puedan cosecharse en masa.

## 0. Dos modos (`TELEFONO_VERIFICACION`)

| Modo | Cómo carga el número el vendedor | Costo | Cuándo usarlo |
|---|---|---|---|
| `ninguna` (por defecto) | Lo escribe al publicar o en Mi cuenta. Se normaliza a celular argentino (`+549...`), se aplican lista negra y "un número activo por cuenta", y queda con `verificado=false`. El aviso **no** muestra "Teléfono verificado". | Cero | Lanzamiento y primeros meses. La protección contra abuso queda en el reveal protegido (sección 3), el puntaje de riesgo, los reportes y la moderación. |
| `otp` | Tiene que confirmarlo con un código de 6 dígitos por WhatsApp o SMS (secciones 1 y 2). | Por mensaje (Meta ~US$0,03-0,04; Twilio SMS ~US$0,07-0,10) | Cuando aparezcan avisos con números ajenos o cuando el volumen justifique el gasto. Al cambiar a `otp`, los números cargados sin código dejan de ser válidos para publicar y revelar hasta que su dueño los verifique. |

En el código, toda decisión que dependa del modo pasa por `otp.requiereOtp()`; `otp.guardarSinVerificar` es la única vía de alta sin código.

## 1. No existe el campo libre "teléfono" (modo `otp`)

El formulario de publicación no tiene un campo de texto para el teléfono. Solo se puede elegir entre los celulares **ya verificados** de la cuenta (`select name="telefono_id"`). La ruta valida que el `telefono_id` pertenezca al usuario, esté `verificado` y `activo`. (En modo `ninguna` el formulario muestra el campo "Tu WhatsApp" y `resolverTelefono` en `routes/cuenta.js` lo normaliza y guarda.)

## 2. Verificación por código (OTP, modo `otp`)

`src/services/otp.js`

1. El número se normaliza con libphonenumber a E.164 de celular argentino: `+549` + código de área + número (10 dígitos). Se acepta "11 2345 6789", "011 15 2345 6789", "+54 9 11…". Fijos y números extranjeros se rechazan.
2. Se genera un código de 6 dígitos (`crypto.randomInt`), se guarda **hasheado** (bcrypt) con vencimiento de `OTP_MINUTOS` (10) y se envía por WhatsApp (Meta Cloud API, plantilla de autenticación) o SMS (Twilio).
3. Límites: 3 envíos por número por hora; 5 envíos por IP por hora; 3 intentos de confirmación por código; además el rate limit HTTP `otp` (8/hora por IP).
4. **Un número por cuenta**: si el número ya está verificado y activo en otra cuenta, se rechaza el envío.
5. Lista negra: números bloqueados por moderación no pueden verificarse.
6. **Reverificación cada 180 días** (`telefonosVigentes`): un teléfono vencido no aparece para publicar y `POST /api/aviso/:id/telefono` responde 410 hasta que el dueño lo reverifique.
7. Si el usuario quita un teléfono, los avisos activos que lo usaban pasan a `pausado`.

Configuración del proveedor en `.env` (`OTP_PROVIDER`). Para WhatsApp hay que crear una plantilla de categoría *Authentication* en Meta Business y poner su nombre en `META_WA_TEMPLATE`.

## 3. El teléfono no está en el HTML

La ficha muestra una máscara (`11 23** ****`). Al tocar "Ver teléfono", el JS llama a `POST /api/aviso/:id/telefono` con:

- token de **Cloudflare Turnstile** (si está configurado): frena scrapers y bots;
- límite de `REVEAL_POR_DIA` (20) por IP en 24 h (tabla `contactos` + rate limit HTTP);
- registro en `contactos` (aviso, usuario si está logueado, hash de IP) y contador `avisos.contactos`.

La respuesta trae el número, un link `wa.me` con mensaje precargado (para que el comprador escriba al número del aviso, no a otro), `tel:` si el vendedor acepta llamadas y `verificado` (true solo si pasó por OTP). Google no indexa el número; el sitemap y el JSON-LD tampoco lo incluyen. Esta protección aplica en los dos modos.

## 4. Puntaje de riesgo automático

`src/services/riesgo.js` suma señales al publicar:

| Señal | Puntos |
|---|---|
| Cuenta con menos de 7 días | 20 |
| Primera publicación | 15 |
| Menos de 3 fotos | 15 |
| Descripción menor a 80 caracteres | 10 |
| Palabras típicas de estafa (seña, transferencia previa, anticipo, exterior, urgente…) | 25 |
| Precio menor al 50 % de la mediana de avisos activos de la misma marca/modelo | 30 |
| Fotos que coinciden (dHash, distancia de Hamming ≤ 6) con avisos de **otros** usuarios | 40 |

Con `puntaje ≥ RIESGO_UMBRAL` (50) o si es la primera publicación de la cuenta, el aviso queda `en_revision` y aparece en `/admin/moderacion` ordenado por riesgo, con las señales listadas. El resto se publica al instante.

## 5. Reportes de la comunidad

Cualquier visitante puede reportar (con Turnstile, 10 por hora por IP, uno por aviso por IP). Motivos: teléfono no responde, no es el vendedor, pide seña, fotos falsas, ya vendido, precio engañoso, otro. Con **3 reportes graves en 7 días** el aviso vuelve a `en_revision` automáticamente. Desde `/admin/reportes` el moderador descarta, resuelve o suspende el aviso.

## 6. Sanciones

Suspender un usuario desde `/admin/usuarios` pausa sus avisos y agrega sus teléfonos y email a `listas_negras`, impidiendo que reaparezcan en otra cuenta. La IP hasheada también puede bloquearse.

## 7. Sello "Empresa" y CUIT

Los vendedores profesionales cargan razón social y CUIT. El moderador valida el CUIT (manual, o consultando el padrón de ARCA con una API propia) y el perfil muestra "CUIT validado". Recomendado a futuro: validación de DNI con un proveedor de identidad para un sello "Identidad verificada".

## Métricas a vigilar

- Reportes por cada 100 contactos (objetivo < 1).
- Porcentaje de avisos en revisión rechazados (si es bajo, subir el umbral; si es alto, bajarlo).
- OTP enviados vs verificados (si cae, revisar la entrega del proveedor).
