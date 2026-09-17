exports.seed = async function (knex) {
  const provincias = [
    [2, 'Ciudad Autónoma de Buenos Aires', 'caba'], [6, 'Buenos Aires', 'buenos-aires'], [10, 'Catamarca', 'catamarca'],
    [14, 'Córdoba', 'cordoba'], [18, 'Corrientes', 'corrientes'], [22, 'Chaco', 'chaco'], [26, 'Chubut', 'chubut'],
    [30, 'Entre Ríos', 'entre-rios'], [34, 'Formosa', 'formosa'], [38, 'Jujuy', 'jujuy'], [42, 'La Pampa', 'la-pampa'],
    [46, 'La Rioja', 'la-rioja'], [50, 'Mendoza', 'mendoza'], [54, 'Misiones', 'misiones'], [58, 'Neuquén', 'neuquen'],
    [62, 'Río Negro', 'rio-negro'], [66, 'Salta', 'salta'], [70, 'San Juan', 'san-juan'], [74, 'San Luis', 'san-luis'],
    [78, 'Santa Cruz', 'santa-cruz'], [82, 'Santa Fe', 'santa-fe'], [86, 'Santiago del Estero', 'santiago-del-estero'],
    [90, 'Tucumán', 'tucuman'], [94, 'Tierra del Fuego', 'tierra-del-fuego'],
  ];
  for (const [id, nombre, slug] of provincias) {
    await knex('provincias').insert({ id, nombre, slug }).onConflict('id').ignore();
  }

  const ficha = {
    tractor: ['potencia_hp', 'traccion', 'transmision', 'cabina'],
    cosechadora: ['potencia_hp', 'ancho_plataforma_m', 'capacidad_tolva_l', 'tipo_trilla'],
    sembradora: ['cantidad_surcos', 'distancia_surcos_cm', 'tipo_siembra', 'ancho_labor_m'],
    pulverizadora: ['capacidad_tanque_l', 'ancho_botalon_m', 'autopropulsada'],
    implemento: ['ancho_labor_m', 'tipo'],
    fertilizadora: ['capacidad_l', 'ancho_labor_m'],
    forraje: ['tipo', 'ancho_labor_m'],
    acoplado: ['capacidad', 'ejes'],
    riego: ['tipo', 'caudal'],
    repuesto: ['compatible_con'],
    otro: [],
  };
  const categorias = [
    ['Tractores', 'tractores', '🚜', 'tractor'], ['Cosechadoras', 'cosechadoras', '🌾', 'cosechadora'],
    ['Sembradoras', 'sembradoras', '🌱', 'sembradora'], ['Pulverizadoras', 'pulverizadoras', '💧', 'pulverizadora'],
    ['Implementos de labranza', 'implementos', '⚙️', 'implemento'], ['Fertilizadoras', 'fertilizadoras', '🧪', 'fertilizadora'],
    ['Forraje y henificación', 'forraje', '🌿', 'forraje'], ['Acoplados y tolvas', 'acoplados', '🛻', 'acoplado'],
    ['Riego', 'riego', '🚿', 'riego'], ['Repuestos', 'repuestos', '🔩', 'repuesto'], ['Otros', 'otros', '📦', 'otro'],
  ];
  let orden = 0;
  for (const [nombre, slug, icono, key] of categorias) {
    await knex('categorias').insert({ nombre, slug, icono, orden: orden++, campos_ficha: JSON.stringify(ficha[key]) }).onConflict('slug').ignore();
  }

  const marcas = ['John Deere', 'New Holland', 'Case IH', 'Massey Ferguson', 'Pauny', 'Kioti', 'Valtra', 'Claas', 'Agrale', 'Deutz-Fahr', 'Zanello',
    'Metalfor', 'Pla', 'Jacto', 'Agrometal', 'Crucianelli', 'Apache', 'Giorgi', 'Bertini', 'Dolbi', 'Mainero', 'Cestari', 'Ombú', 'Fertec', 'Yomel', 'Otra'];
  for (const nombre of marcas) {
    const slug = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
    await knex('marcas').insert({ nombre, slug }).onConflict('slug').ignore();
  }
};
