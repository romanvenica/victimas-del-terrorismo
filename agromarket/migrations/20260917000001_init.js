/**
 * Esquema inicial. Compatible con SQLite (desarrollo) y PostgreSQL (producción).
 * IDs: UUID como texto (no secuenciales, no enumerables desde la URL).
 */
exports.up = async function (knex) {
  await knex.schema.createTable('provincias', (t) => {
    t.integer('id').primary();
    t.string('nombre').notNullable();
    t.string('slug').notNullable().unique();
  });

  await knex.schema.createTable('categorias', (t) => {
    t.increments('id');
    t.string('nombre').notNullable();
    t.string('slug').notNullable().unique();
    t.string('icono').defaultTo('');
    t.integer('orden').defaultTo(0);
    t.text('campos_ficha').defaultTo('[]'); // JSON: campos técnicos que aplican a esta categoría
  });

  await knex.schema.createTable('marcas', (t) => {
    t.increments('id');
    t.string('nombre').notNullable();
    t.string('slug').notNullable().unique();
  });

  await knex.schema.createTable('usuarios', (t) => {
    t.string('id', 36).primary();
    t.string('email').notNullable().unique();
    t.boolean('email_verificado').notNullable().defaultTo(false);
    t.string('hash_contrasena').notNullable();
    t.string('nombre').notNullable();
    t.string('tipo').notNullable().defaultTo('particular'); // particular | profesional
    t.string('rol').notNullable().defaultTo('usuario'); // usuario | moderador | admin
    t.string('estado').notNullable().defaultTo('activo'); // activo | suspendido | eliminado
    t.integer('provincia_id').references('id').inTable('provincias');
    t.string('localidad').defaultTo('');
    t.string('slug').unique();
    t.string('totp_secret').defaultTo('');
    t.integer('avisos_publicados').notNullable().defaultTo(0);
    t.timestamp('ultimo_login');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('empresas', (t) => {
    t.string('id', 36).primary();
    t.string('usuario_id', 36).notNullable().references('id').inTable('usuarios');
    t.string('razon_social').notNullable();
    t.string('cuit', 11).notNullable();
    t.boolean('cuit_validado').notNullable().defaultTo(false);
    t.string('nombre_fantasia').defaultTo('');
    t.text('descripcion').defaultTo('');
    t.string('logo_url').defaultTo('');
    t.string('direccion').defaultTo('');
    t.string('plan').notNullable().defaultTo('ninguno'); // ninguno | basico | pro
    t.timestamp('plan_vence');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('telefonos', (t) => {
    t.string('id', 36).primary();
    t.string('usuario_id', 36).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.string('numero_e164', 20).notNullable();
    t.boolean('verificado').notNullable().defaultTo(false);
    t.timestamp('fecha_verificacion');
    t.string('canal').defaultTo('whatsapp');
    t.boolean('principal').notNullable().defaultTo(false);
    t.boolean('activo').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(['numero_e164']);
  });

  await knex.schema.createTable('otp_codigos', (t) => {
    t.string('id', 36).primary();
    t.string('usuario_id', 36).references('id').inTable('usuarios').onDelete('CASCADE');
    t.string('numero_e164', 20).notNullable();
    t.string('codigo_hash').notNullable();
    t.integer('intentos').notNullable().defaultTo(0);
    t.timestamp('expira').notNullable();
    t.boolean('usado').notNullable().defaultTo(false);
    t.string('ip_hash').defaultTo('');
    t.timestamps(true, true);
    t.index(['numero_e164', 'created_at']);
  });

  await knex.schema.createTable('avisos', (t) => {
    t.string('id', 36).primary();
    t.string('usuario_id', 36).notNullable().references('id').inTable('usuarios');
    t.string('empresa_id', 36).references('id').inTable('empresas');
    t.integer('categoria_id').notNullable().references('id').inTable('categorias');
    t.integer('marca_id').references('id').inTable('marcas');
    t.string('modelo').defaultTo('');
    t.string('titulo').notNullable();
    t.string('slug').notNullable();
    t.text('descripcion').notNullable();
    t.integer('anio');
    t.integer('horas_uso');
    t.string('estado_maquina').notNullable().defaultTo('usado'); // nuevo | usado
    t.decimal('precio', 14, 2);
    t.string('moneda', 3).notNullable().defaultTo('USD'); // ARS | USD
    t.boolean('precio_mas_iva').notNullable().defaultTo(false);
    t.boolean('acepta_permuta').notNullable().defaultTo(false);
    t.boolean('acepta_financiacion').notNullable().defaultTo(false);
    t.integer('provincia_id').notNullable().references('id').inTable('provincias');
    t.string('localidad').defaultTo('');
    t.string('telefono_id', 36).notNullable().references('id').inTable('telefonos');
    t.boolean('acepta_whatsapp').notNullable().defaultTo(true);
    t.boolean('acepta_llamada').notNullable().defaultTo(true);
    t.string('estado').notNullable().defaultTo('en_revision'); // en_revision | activo | pausado | vencido | vendido | rechazado
    t.text('motivo_rechazo').defaultTo('');
    t.integer('puntaje_riesgo').notNullable().defaultTo(0);
    t.text('senales_riesgo').defaultTo('[]');
    t.text('ficha_tecnica').defaultTo('{}');
    t.timestamp('fecha_publicacion');
    t.timestamp('fecha_vencimiento');
    t.timestamp('destacado_hasta');
    t.timestamp('bump_at');
    t.integer('visitas').notNullable().defaultTo(0);
    t.integer('contactos').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(['estado', 'categoria_id', 'provincia_id']);
    t.index(['estado', 'destacado_hasta', 'bump_at']);
  });

  await knex.schema.createTable('aviso_fotos', (t) => {
    t.string('id', 36).primary();
    t.string('aviso_id', 36).notNullable().references('id').inTable('avisos').onDelete('CASCADE');
    t.integer('orden').notNullable().defaultTo(0);
    t.string('url').notNullable();
    t.string('url_miniatura').notNullable();
    t.string('hash_perceptual', 64).defaultTo('');
    t.integer('ancho');
    t.integer('alto');
    t.index(['hash_perceptual']);
  });

  await knex.schema.createTable('contactos', (t) => {
    t.string('id', 36).primary();
    t.string('aviso_id', 36).notNullable().references('id').inTable('avisos').onDelete('CASCADE');
    t.string('usuario_id', 36).references('id').inTable('usuarios');
    t.string('ip_hash').notNullable();
    t.string('tipo').notNullable().defaultTo('ver_telefono');
    t.timestamps(true, true);
    t.index(['ip_hash', 'created_at']);
    t.index(['aviso_id']);
  });

  await knex.schema.createTable('reportes', (t) => {
    t.string('id', 36).primary();
    t.string('aviso_id', 36).notNullable().references('id').inTable('avisos').onDelete('CASCADE');
    t.string('usuario_id', 36).references('id').inTable('usuarios');
    t.string('motivo').notNullable();
    t.text('comentario').defaultTo('');
    t.string('estado').notNullable().defaultTo('pendiente'); // pendiente | resuelto | descartado
    t.string('resuelto_por', 36);
    t.string('ip_hash').defaultTo('');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('favoritos', (t) => {
    t.string('usuario_id', 36).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.string('aviso_id', 36).notNullable().references('id').inTable('avisos').onDelete('CASCADE');
    t.timestamps(true, true);
    t.primary(['usuario_id', 'aviso_id']);
  });

  await knex.schema.createTable('alertas', (t) => {
    t.string('id', 36).primary();
    t.string('usuario_id', 36).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.text('filtros').notNullable(); // JSON con la búsqueda guardada
    t.string('nombre').notNullable();
    t.boolean('activa').notNullable().defaultTo(true);
    t.timestamp('ultimo_envio');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('pagos', (t) => {
    t.string('id', 36).primary();
    t.string('usuario_id', 36).notNullable().references('id').inTable('usuarios');
    t.string('aviso_id', 36).references('id').inTable('avisos');
    t.string('concepto').notNullable(); // destacado_7 | destacado_15 | destacado_30 | bump | plan_basico | plan_pro
    t.decimal('monto', 14, 2).notNullable();
    t.string('moneda', 3).notNullable().defaultTo('ARS');
    t.string('proveedor').notNullable().defaultTo('mercadopago');
    t.string('id_externo').defaultTo('');
    t.string('estado').notNullable().defaultTo('pendiente'); // pendiente | aprobado | rechazado | reembolsado
    t.string('factura_id', 36);
    t.timestamps(true, true);
    t.index(['id_externo']);
  });

  await knex.schema.createTable('facturas', (t) => {
    t.string('id', 36).primary();
    t.string('pago_id', 36).notNullable().references('id').inTable('pagos');
    t.string('tipo', 1).notNullable().defaultTo('C');
    t.string('cae').defaultTo('');
    t.string('numero').defaultTo('');
    t.string('pdf_url').defaultTo('');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('tokens', (t) => {
    // tokens de un solo uso: recuperación de contraseña, verificación de email
    t.string('id', 36).primary();
    t.string('usuario_id', 36).notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.string('tipo').notNullable(); // reset | email
    t.string('token_hash').notNullable().unique();
    t.timestamp('expira').notNullable();
    t.boolean('usado').notNullable().defaultTo(false);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('listas_negras', (t) => {
    t.increments('id');
    t.string('tipo').notNullable(); // telefono | email | ip | dominio_email
    t.string('valor').notNullable();
    t.string('motivo').defaultTo('');
    t.timestamps(true, true);
    t.unique(['tipo', 'valor']);
  });

  await knex.schema.createTable('auditoria', (t) => {
    t.increments('id');
    t.string('actor_id', 36);
    t.string('accion').notNullable();
    t.string('entidad').notNullable();
    t.string('entidad_id').defaultTo('');
    t.text('detalle').defaultTo('');
    t.string('ip_hash').defaultTo('');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  for (const t of ['auditoria', 'listas_negras', 'tokens', 'facturas', 'pagos', 'alertas', 'favoritos', 'reportes', 'contactos', 'aviso_fotos', 'avisos', 'otp_codigos', 'telefonos', 'empresas', 'usuarios', 'marcas', 'categorias', 'provincias']) {
    await knex.schema.dropTableIfExists(t);
  }
};
