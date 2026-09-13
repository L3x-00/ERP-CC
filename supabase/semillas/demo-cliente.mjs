#!/usr/bin/env node
/**
 * Demo comercial — limpieza de datos de prueba y siembra de datos casi reales.
 *
 * Uso (desde la raíz del repo):
 *   $env:CONFIRMAR_DEMO='si'; node supabase/semillas/demo-cliente.mjs todo
 *   node supabase/semillas/demo-cliente.mjs limpiar
 *   node supabase/semillas/demo-cliente.mjs sembrar
 *   node supabase/semillas/demo-cliente.mjs verificar
 *
 * Requisitos:
 *   - `CONFIRMAR_DEMO=si` para limpiar/sembrar (omitido en `verificar`).
 *   - `NODE_ENV` distinto de `production`.
 *   - `.env.local` con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 *
 * Limpia TODAS las tablas transaccionales (los datos existentes son fixtures
 * de prueba) y conserva las cuentas reales `ales@gmail.com` y
 * `ales_2_@hotmail.com`. Siembra una historia coherente: configuración,
 * catálogos, clientes, pipeline, órdenes en todos los estados, producción,
 * inventario, cobranza con pagos, gastos, comentarios/notificaciones y metas.
 */

import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Entorno y utilidades
// ---------------------------------------------------------------------------

function cargarEntornoLocal() {
  if (!existsSync('.env.local')) return;
  for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    process.env[coincidencia[1]] = coincidencia[2].replace(/^['"]|['"]$/g, '');
  }
}

function requerirVariable(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}.`);
  return valor;
}

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

cargarEntornoLocal();

const MODO = process.argv[2] ?? 'todo';
asegurar(['limpiar', 'sembrar', 'todo', 'verificar'].includes(MODO), `Modo inválido: ${MODO}`);
asegurar(process.env.NODE_ENV !== 'production', 'La semilla de demo no puede ejecutarse con NODE_ENV=production.');
if (MODO !== 'verificar') {
  asegurar(process.env.CONFIRMAR_DEMO === 'si', 'Define CONFIRMAR_DEMO=si para limpiar/sembrar datos de demo.');
}

const cliente = createClient(
  requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
  requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** UUID determinista legible para la demo. */
function uid(prefijo, n) {
  return `${prefijo}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const ID = {
  cliente: (n) => uid('c11e7000', n),
  proveedor: (n) => uid('9800e0d0', n),
  material: (n) => uid('1234a000', n),
  recurso: (n) => uid('4ec00000', n),
  area: (n) => uid('a4ea0000', n),
  banco: (n) => uid('ba4c0000', n),
  pipeline: (n) => uid('719e1100', n),
  meta: (n) => uid('3e7a0000', n),
  solicitud: (n) => uid('50c1c170', n),
  comentario: (n) => uid('c0e47000', n),
  notificacion: (n) => uid('0f1c0000', n),
  log: (n) => uid('10a00000', n),
  excepcion: (n) => uid('e3ce0000', n),
};

let contadorOperacion = 0;
function paso(mensaje) {
  contadorOperacion += 1;
  console.log(`  ${String(contadorOperacion).padStart(3, '0')} · ${mensaje}`);
}

async function ejecutar(descripcion, consulta) {
  const { data, error } = await consulta;
  if (error) {
    throw new Error(`${descripcion} → ${error.message}${error.details ? ` (${error.details})` : ''}${error.hint ? ` [${error.hint}]` : ''}`);
  }
  return data;
}

async function rpc(nombre, args) {
  return ejecutar(`RPC ${nombre}`, cliente.rpc(nombre, args));
}

async function insertar(tabla, filas) {
  return ejecutar(`INSERT ${tabla}`, cliente.from(tabla).insert(filas));
}

async function actualizar(tabla, cambios, filtro) {
  let consulta = cliente.from(tabla).update(cambios);
  for (const [columna, valor] of Object.entries(filtro)) {
    consulta = valor === null
      ? consulta.is(columna, null)
      : consulta.eq(columna, valor);
  }
  return ejecutar(`UPDATE ${tabla}`, consulta);
}

async function borrarTodo(tabla, columnaFiltro = 'id') {
  return ejecutar(`DELETE ${tabla}`, cliente.from(tabla).delete().not(columnaFiltro, 'is', null));
}

async function contar(tabla, columnaFiltro = 'id') {
  const { count, error } = await cliente
    .from(tabla)
    .select(columnaFiltro, { count: 'exact', head: true });
  if (error) throw new Error(`COUNT ${tabla} → ${error.message}`);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------------

const TABLAS_LIMPIABLES = [
  ['partidas_nota_entrega'],
  ['notas_entrega'],
  ['registros_avance_partida'],
  ['registros_consumo_material'],
  ['registros_tiempo_operador'],
  ['sesiones_trabajo'],
  ['movimientos_saldo_favor'],
  ['pagos_ar'],
  ['cuentas_por_cobrar'],
  ['reservas_material'],
  ['gastos'],
  ['movimientos_inventario'],
  ['programacion_areas'],
  ['partidas_orden_produccion'],
  ['ordenes_produccion'],
  ['comentarios_registro'],
  ['notificaciones_usuario'],
  ['cotizacion_lineas'],
  ['pipeline'],
  ['documentos_cliente'],
  ['metas_vendedor'],
  ['materiales'],
  ['proveedores'],
  ['excepciones_capacidad_recurso'],
  ['capacidades_recurso_turno', 'recurso_id'],
  ['recursos_planeacion'],
  ['clientes'],
  ['areas_trabajo_config'],
  ['cuentas_bancarias'],
  ['intentos_login', 'identificador'],
  ['logs'],
];

const PATRONES_USUARIO_PRUEBA = [
  '@datos-ficticios.invalid',
  '@orca.local',
  'e2e-',
  'sim-',
];

async function limpiarBase() {
  console.log('LIMPIEZA');
  for (const [tabla, columna] of TABLAS_LIMPIABLES) {
    await borrarTodo(tabla, columna);
    paso(`Vaciada ${tabla}`);
  }

  const { data: usuarios, error } = await cliente.from('usuarios').select('id, email');
  if (error) throw new Error(`SELECT usuarios → ${error.message}`);
  const aBorrar = (usuarios ?? []).filter((fila) =>
    PATRONES_USUARIO_PRUEBA.some((patron) => fila.email.toLowerCase().includes(patron)),
  );
  for (const fila of aBorrar) {
    await ejecutar(`DELETE usuario ${fila.email}`, cliente.from('usuarios').delete().eq('id', fila.id));
  }
  paso(`Perfiles de prueba borrados: ${aBorrar.length}`);

  let pagina = 1;
  let borradosAuth = 0;
  for (;;) {
    const { data, error: errorLista } = await cliente.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (errorLista) throw new Error(`listUsers → ${errorLista.message}`);
    const usuariosAuth = data?.users ?? [];
    if (usuariosAuth.length === 0) break;
    for (const usuario of usuariosAuth) {
      const correo = (usuario.email ?? '').toLowerCase();
      if (!PATRONES_USUARIO_PRUEBA.some((patron) => correo.includes(patron))) continue;
      const { error: errorBorrado } = await cliente.auth.admin.deleteUser(usuario.id);
      if (errorBorrado) throw new Error(`deleteUser ${usuario.email} → ${errorBorrado.message}`);
      borradosAuth += 1;
    }
    if (usuariosAuth.length < 200) break;
    pagina += 1;
  }
  paso(`Usuarios Auth de prueba borrados: ${borradosAuth}`);

  await actualizar(
    'configuracion_sistema',
    {
      empresa_json: {},
      tarifas_json: {},
      plantillas_doc_json: {},
      tipo_cambio_usd: 20,
      iva_porcentaje_default: 16,
      actualizado_por: null,
    },
    { id: 'main' },
  );
  paso('Configuración restablecida');
}

// ---------------------------------------------------------------------------
// Siembra — usuarios
// ---------------------------------------------------------------------------

const CONTRASENA_DEMO = 'Demo2026!';
const USUARIOS_DEMO = [
  { clave: 'ventas', email: 'ventas@ccmanufacturing.mx', rol: 'vendedor', nombre: 'Alejandra Ríos Beltrán' },
  { clave: 'gerencia', email: 'gerencia@ccmanufacturing.mx', rol: 'gerente', nombre: 'Carlos Mendoza Salas' },
  { clave: 'finanzas', email: 'finanzas@ccmanufacturing.mx', rol: 'contador', nombre: 'Miguel Ángel Fuentes' },
  { clave: 'jorge', email: 'jorge.ramirez@ccmanufacturing.mx', rol: 'operador', nombre: 'Jorge Ramírez Ortega', pin: '4826' },
  { clave: 'luis', email: 'luis.torres@ccmanufacturing.mx', rol: 'operador', nombre: 'Luis Torres Aguilar', pin: '7319' },
  { clave: 'sergio', email: 'sergio.pena@ccmanufacturing.mx', rol: 'operador', nombre: 'Sergio Peña Domínguez', pin: '5264' },
];

async function sembrarUsuarios(adminId) {
  console.log('USUARIOS');
  const ids = {};

  const { data: filaAdmin } = await cliente.from('usuarios').select('id').eq('id', adminId).maybeSingle();
  asegurar(filaAdmin, 'No se encontró el administrador real para firmar la configuración.');

  for (const definicion of USUARIOS_DEMO) {
    const { data: existente } = await cliente
      .from('usuarios')
      .select('id')
      .eq('email', definicion.email)
      .maybeSingle();

    let usuarioId = existente?.id ?? null;
    if (!usuarioId) {
      const { data, error } = await cliente.auth.admin.createUser({
        email: definicion.email,
        password: definicion.pin ? randomBytes(24).toString('base64url') : CONTRASENA_DEMO,
        email_confirm: true,
        user_metadata: { nombre_completo: definicion.nombre, rol: definicion.rol },
      });
      if (error) throw new Error(`createUser ${definicion.email} → ${error.message}`);
      usuarioId = data.user.id;
    }

    const cambios = { rol: definicion.rol, nombre_completo: definicion.nombre, activo: true };
    if (definicion.pin) cambios.pin_operador = await bcrypt.hash(definicion.pin, 10);
    await actualizar('usuarios', cambios, { id: usuarioId });
    ids[definicion.clave] = usuarioId;
    paso(`Usuario ${definicion.rol}: ${definicion.nombre}`);
  }

  // Nombre profesional para la cuenta del Product Owner durante la demo.
  await actualizar('usuarios', { nombre_completo: 'Alejandro Salas' }, { id: adminId });
  paso('Perfil del administrador presentable para demo');

  return { ...ids, admin: adminId };
}

// ---------------------------------------------------------------------------
// Siembra — configuración y catálogos
// ---------------------------------------------------------------------------

async function sembrarConfiguracion(adminId) {
  console.log('CONFIGURACIÓN');
  await actualizar(
    'configuracion_sistema',
    {
      empresa_json: {
        nombre: 'CC Manufacturing Group',
        razonSocial: 'CC Manufacturing Group, S. de R.L. de C.V.',
        rfc: 'CMG240315K27',
        direccion: 'Blvd. Industrial Pacífico 1854, Parque Industrial Pacífico, Tijuana, B.C., C.P. 22444',
        telefono: '+52 664 123 4567',
        email: 'contacto@ccmanufacturing.mx',
        logoUrl: null,
      },
      tarifas_json: {
        costoHoraDefault: 680,
        segundosPorPierce: 7,
        factorEficienciaLaser: 0.82,
        factorMermaMaterial: 0.06,
        margenUtilidadDefault: 35,
      },
      plantillas_doc_json: {
        T1: {
          colorAcento: '#1D4ED8',
          terminosCondiciones: 'Precios en MXN salvo indicación. Vigencia de la cotización: 15 días naturales. Tiempo de entrega sujeto a confirmación de materiales.',
          textoPiePagina: 'CC Manufacturing Group · Blvd. Industrial Pacífico 1854 · Tijuana, B.C. · +52 664 123 4567',
          textoEncabezado: 'COTIZACIÓN',
        },
      },
      tipo_cambio_usd: 18.75,
      iva_porcentaje_default: 16,
      actualizado_por: adminId,
    },
    { id: 'main' },
  );
  paso('Empresa, tarifas y plantillas');

  await insertar('areas_trabajo_config', [
    { id: ID.area(1), codigo: 'LASER', nombre: 'Corte láser', color_hex: '#3B82F6', costo_hora_interno: 980, tarifa_hora_venta: 1450, es_externo: false, orden: 1 },
    { id: ID.area(2), codigo: 'CNC', nombre: 'Maquinado CNC', color_hex: '#8B5CF6', costo_hora_interno: 1180, tarifa_hora_venta: 1750, es_externo: false, orden: 2 },
    { id: ID.area(3), codigo: 'DOB', nombre: 'Doblez y formado', color_hex: '#F59E0B', costo_hora_interno: 520, tarifa_hora_venta: 850, es_externo: false, orden: 3 },
    { id: ID.area(4), codigo: 'SOLD', nombre: 'Soldadura', color_hex: '#EF4444', costo_hora_interno: 420, tarifa_hora_venta: 720, es_externo: false, orden: 4 },
    { id: ID.area(5), codigo: 'PINT', nombre: 'Acabado y pintura', color_hex: '#10B981', costo_hora_interno: 380, tarifa_hora_venta: 640, es_externo: false, orden: 5 },
    { id: ID.area(6), codigo: 'EXT', nombre: 'Procesos externos', color_hex: '#64748B', costo_hora_interno: 0, tarifa_hora_venta: 950, es_externo: true, orden: 6 },
  ]);
  paso('6 áreas de trabajo');

  await insertar('cuentas_bancarias', [
    { id: ID.banco(1), banco: 'BBVA México', numero_cuenta: '0118472390', clabe: '012180001184723907', moneda: 'MXN', titular: 'CC Manufacturing Group S. de R.L. de C.V.', activa: true },
    { id: ID.banco(2), banco: 'Banorte', numero_cuenta: '0483920175', clabe: '072180004839201754', moneda: 'USD', titular: 'CC Manufacturing Group S. de R.L. de C.V.', activa: true },
    { id: ID.banco(3), banco: 'Santander', numero_cuenta: '6550214789', clabe: '014180655021478903', moneda: 'MXN', titular: 'CC Manufacturing Group S. de R.L. de C.V.', activa: false },
  ]);
  paso('3 cuentas bancarias');

  await insertar('proveedores', [
    { id: ID.proveedor(1), nombre_comercial: 'Aceros y Perfiles del Norte', razon_social: 'Aceros y Perfiles del Norte S.A. de C.V.', rfc: 'APN150320H41', contacto_nombre: 'Ricardo Salas', correo: 'ventas@acerosperfilesnorte.mx', telefono: '+52 664 200 1188', direccion: 'Av. de los Metales 220, Tijuana, B.C.' },
    { id: ID.proveedor(2), nombre_comercial: 'Metales Industriales TJ', razon_social: 'Metales Industriales TJ S. de R.L.', rfc: 'MIT180902J18', contacto_nombre: 'Laura Camacho', correo: 'contacto@metalesindustriales.mx', telefono: '+52 664 305 4477', direccion: 'Calle 4ta 8120, Tijuana, B.C.' },
    { id: ID.proveedor(3), nombre_comercial: 'Suministros CNC MX', razon_social: 'Suministros CNC MX S.A. de C.V.', rfc: 'SCN210607P29', contacto_nombre: 'Pedro Ibarra', correo: 'pedidos@suministroscnc.mx', telefono: '+52 664 411 9032', direccion: 'Blvd. Bellas Artes 1590, Tijuana, B.C.' },
    { id: ID.proveedor(4), nombre_comercial: 'Tratamientos Térmicos Baja', razon_social: 'Tratamientos Térmicos Baja S.A. de C.V.', rfc: 'TTB190411R08', contacto_nombre: 'Sofía Esquivel', correo: 'servicio@ttbaja.mx', telefono: '+52 664 555 2210', direccion: 'Parque Industrial El Florido, Tijuana, B.C.' },
  ]);
  paso('4 proveedores');
}

async function sembrarRecursos() {
  console.log('RECURSOS Y CAPACIDAD');
  await insertar('recursos_planeacion', [
    { id: ID.recurso(1), codigo: 'LASER-FIBRA-01', area: 'sheet_metal', nombre: 'Láser fibra 3 kW', costo_hora_interno: 980, activo: true },
    { id: ID.recurso(2), codigo: 'CNC-HAAS-01', area: 'taller', nombre: 'Centro de maquinado Haas VF-2', costo_hora_interno: 1150, activo: true },
    { id: ID.recurso(3), codigo: 'CNC-HAAS-02', area: 'taller', nombre: 'Centro de maquinado Haas VF-4', costo_hora_interno: 1280, activo: true },
    { id: ID.recurso(4), codigo: 'DOB-METAL-01', area: 'sheet_metal', nombre: 'Dobladora CNC 135 T', costo_hora_interno: 520, activo: true },
    { id: ID.recurso(5), codigo: 'SOLD-MIG-01', area: 'taller', nombre: 'Estación de soldadura MIG/TIG', costo_hora_interno: 420, activo: true },
    { id: ID.recurso(6), codigo: 'PINT-LINEA-01', area: 'acabados', nombre: 'Línea de pintura electrostática', costo_hora_interno: 380, activo: true },
  ]);

  const capacidades = [];
  for (const [indice, recurso] of [1, 2, 3, 4, 5].entries()) {
    capacidades.push({ recurso_id: ID.recurso(recurso), turno: 'matutino', horas_capacidad: 8 });
    capacidades.push({ recurso_id: ID.recurso(recurso), turno: 'vespertino', horas_capacidad: 8 });
    void indice;
  }
  capacidades.push({ recurso_id: ID.recurso(3), turno: 'nocturno', horas_capacidad: 6 });
  capacidades.push({ recurso_id: ID.recurso(6), turno: 'matutino', horas_capacidad: 8 });
  await insertar('capacidades_recurso_turno', capacidades);
  paso('6 recursos y 12 capacidades');

  const hoy = new Date();
  const enUnaSemana = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
  await insertar('excepciones_capacidad_recurso', [{
    id: ID.excepcion(1),
    recurso_id: ID.recurso(2),
    fecha: enUnaSemana.toISOString().slice(0, 10),
    turno: 'matutino',
    horas_capacidad: 0,
    motivo: 'Mantenimiento preventivo programado',
  }]);
  paso('1 excepción de capacidad');
}

// ---------------------------------------------------------------------------
// Siembra — inventario
// ---------------------------------------------------------------------------

const MATERIALES = [
  { n: 1, codigo: 'LAM-CR-14', nombre: 'Lámina rolada en frío 14 ga', categoria: 'materia_prima', unidad_compra: 'hoja', unidad_control: 'm2', factor: 2.98, costoCompra: 1150, min: 20, merma: 6, proveedor: 1, entradas: [{ control: 89.4, costoControl: 385.9 }, { control: 59.6, costoControl: 392.4 }] },
  { n: 2, codigo: 'LAM-INOX-16', nombre: 'Lámina inoxidable 304 16 ga', categoria: 'materia_prima', unidad_compra: 'hoja', unidad_control: 'm2', factor: 2.98, costoCompra: 2480, min: 12, merma: 8, proveedor: 2, entradas: [{ control: 29.8, costoControl: 832.2 }] },
  { n: 3, codigo: 'LAM-GALV-18', nombre: 'Lámina galvanizada 18 ga', categoria: 'materia_prima', unidad_compra: 'hoja', unidad_control: 'm2', factor: 2.98, costoCompra: 890, min: 15, merma: 5, proveedor: 1, entradas: [{ control: 59.6, costoControl: 298.7 }] },
  { n: 4, codigo: 'PTR-2X2-11', nombre: 'PTR 2" x 2" calibre 11', categoria: 'materia_prima', unidad_compra: 'barra', unidad_control: 'ml', factor: 6, costoCompra: 1180, min: 30, merma: 7, proveedor: 1, entradas: [{ control: 120, costoControl: 196.7 }] },
  { n: 5, codigo: 'TUBO-CUAD-1', nombre: 'Tubo cuadrado 1" calibre 14', categoria: 'materia_prima', unidad_compra: 'barra', unidad_control: 'ml', factor: 6, costoCompra: 640, min: 40, merma: 5, proveedor: 1, entradas: [{ control: 180, costoControl: 106.7 }] },
  { n: 6, codigo: 'PLACA-A36-12', nombre: 'Placa A36 1/2"', categoria: 'materia_prima', unidad_compra: 'hoja', unidad_control: 'kg', factor: 122, costoCompra: 3450, min: 200, merma: 9, proveedor: 2, entradas: [{ control: 488, costoControl: 28.3 }] },
  { n: 7, codigo: 'TORN-M8', nombre: 'Tornillería M8 inoxidable', categoria: 'insumo', unidad_compra: 'pieza', unidad_control: 'pieza', factor: 1, costoCompra: 4.2, min: 500, merma: 2, proveedor: 3, entradas: [{ control: 2000, costoControl: 4.2 }] },
  { n: 8, codigo: 'DISC-CORTE-4.5', nombre: 'Disco de corte 4.5"', categoria: 'insumo', unidad_compra: 'pieza', unidad_control: 'pieza', factor: 1, costoCompra: 38, min: 100, merma: 3, proveedor: 3, entradas: [{ control: 400, costoControl: 38 }] },
  { n: 9, codigo: 'ALAMBRE-MIG-ER70', nombre: 'Alambre MIG ER70S-6 1.2 mm', categoria: 'insumo', unidad_compra: 'rollo', unidad_control: 'kg', factor: 15, costoCompra: 890, min: 30, merma: 4, proveedor: 3, entradas: [{ control: 75, costoControl: 59.3 }] },
  { n: 10, codigo: 'PINT-EPOX-NEGRO', nombre: 'Pintura electrostática negra', categoria: 'insumo', unidad_compra: 'pieza', unidad_control: 'kg', factor: 1, costoCompra: 210, min: 20, merma: 6, proveedor: 2, entradas: [{ control: 60, costoControl: 210 }] },
];

async function sembrarMateriales() {
  console.log('MATERIALES E INVENTARIO');
  await insertar('materiales', MATERIALES.map((m) => ({
    id: ID.material(m.n),
    codigo: m.codigo,
    nombre: m.nombre,
    descripcion: `${m.nombre} — acero para producción CNC`,
    categoria: m.categoria,
    unidad_compra: m.unidad_compra,
    unidad_control: m.unidad_control,
    factor_conversion: m.factor,
    costo_unitario_compra: m.costoCompra,
    costo_unitario_control: 0,
    stock_actual_control: 0,
    stock_reservado_control: 0,
    stock_minimo_control: m.min,
    proveedor_id: ID.proveedor(m.proveedor),
    factor_merma_porcentaje: m.merma,
  })));

  for (const material of MATERIALES) {
    let entrada = 0;
    for (const movimiento of material.entradas) {
      entrada += 1;
      await rpc('registrar_movimiento_inventario', {
        p_material_id: ID.material(material.n),
        p_tipo: 'entrada_compra',
        p_prefijo_folio: 'ENT',
        p_cantidad_control: movimiento.control,
        p_costo_unitario_momento: movimiento.costoControl,
        p_cantidad_compra: Number((movimiento.control / material.factor).toFixed(2)),
        p_referencia_externa: `OC-DEMO-${material.codigo}-${entrada}`,
        p_notas: `Compra programada a ${material.proveedor === 1 ? 'Aceros y Perfiles del Norte' : material.proveedor === 2 ? 'Metales Industriales TJ' : 'Suministros CNC MX'}`,
      });
    }
  }
  paso('10 materiales y 12 entradas de compra');
}

// ---------------------------------------------------------------------------
// Siembra — clientes, pipeline y metas
// ---------------------------------------------------------------------------

const CLIENTES = [
  { n: 1, nombre: 'Industrias Metálicas del Norte', razon: 'Industrias Metálicas del Norte S.A. de C.V.', rfc: 'IMN180522Q34', contacto: 'Roberto Valdez', correo: 'compras@imnorte.mx', telefono: '+52 664 210 8844', condiciones: '30_dias', limite: 800000, estado: 'activo' },
  { n: 2, nombre: 'Maquinados Aeroespaciales Baja', razon: 'Maquinados Aeroespaciales Baja S. de R.L. de C.V.', rfc: 'MAB171108L52', contacto: 'Diana Ochoa', correo: 'compras@mabaero.mx', telefono: '+52 664 322 1190', condiciones: 'credito', limite: 1500000, estado: 'activo' },
  { n: 3, nombre: 'Aceros y Estructuras Tijuana', razon: 'Aceros y Estructuras Tijuana S.A. de C.V.', rfc: 'AET190214C77', contacto: 'Fernando Lozano', correo: 'contacto@aetijuana.mx', telefono: '+52 664 118 3322', condiciones: '15_dias', limite: 400000, estado: 'activo' },
  { n: 4, nombre: 'Exhibidores Comerciales MX', razon: 'Exhibidores Comerciales MX S.A. de C.V.', rfc: 'ECM200601M13', contacto: 'Paola Gutiérrez', correo: 'proyectos@exhibidoresmx.com', telefono: '+52 664 556 7788', condiciones: 'contado', limite: 0, estado: 'activo' },
  { n: 5, nombre: 'Electrodomésticos del Pacífico', razon: 'Electrodomésticos del Pacífico S. de R.L.', rfc: 'EPP220907D84', contacto: 'Iván Cárdenas', correo: 'ivan.cardenas@edpac.mx', telefono: '+52 664 733 5561', condiciones: 'contado', limite: 0, estado: 'prospecto' },
  { n: 6, nombre: 'Muebles Industriales Bravo', razon: 'Muebles Industriales Bravo S.A. de C.V.', rfc: 'MIB210311H60', contacto: 'Sandra Bravo', correo: 'compras@mueblesbravo.mx', telefono: '+52 664 901 4420', condiciones: '30_dias', limite: 250000, estado: 'activo' },
  { n: 7, nombre: 'Dispositivos Médicos Tijuana', razon: 'Dispositivos Médicos Tijuana S. de R.L. de C.V.', rfc: 'DMT231005T91', contacto: 'Héctor Pineda', correo: 'proyectos@dmtmedica.mx', telefono: '+52 664 640 2217', condiciones: 'contado', limite: 0, estado: 'prospecto' },
  { n: 8, nombre: 'Transportes y Plataformas Baja', razon: 'Transportes y Plataformas Baja S.A. de C.V.', rfc: 'TPB160722N27', contacto: 'Javier Ríos', correo: 'operaciones@tpblaja.mx', telefono: '+52 664 470 9931', condiciones: '15_dias', limite: 150000, estado: 'inactivo' },
];

async function sembrarClientes() {
  console.log('CLIENTES');
  await insertar('clientes', CLIENTES.map((c) => ({
    id: ID.cliente(c.n),
    nombre_comercial: c.nombre,
    razon_social: c.razon,
    rfc: c.rfc,
    contacto: c.contacto,
    correo: c.correo,
    telefono: c.telefono,
    direccion_fiscal: `Tijuana, Baja California, México`,
    direccion_envio: `Tijuana, Baja California, México`,
    condiciones_pago: c.condiciones,
    limite_credito: c.limite,
    estado: c.estado,
  })));
  paso(`8 clientes`);
}

const PIPELINE = [
  { n: 1, folio: 'CNC-0926-0001', etapa: 'prospecto', empresa: 'Electrodomésticos del Pacífico', contacto: 'Iván Cárdenas', moneda: 'MXN', prioridad: 'normal', condiciones: 'contado', etiquetas: ['refrigeración'] },
  { n: 2, folio: 'CNC-0926-0002', etapa: 'prospecto', empresa: 'Dispositivos Médicos Tijuana', contacto: 'Héctor Pineda', moneda: 'USD', prioridad: 'alta', condiciones: 'contado', etiquetas: ['dispositivos-médicos', 'inoxidable'] },
  { n: 3, folio: 'CNC-0926-0003', etapa: 'contactado', empresa: 'Muebles Industriales Bravo', contacto: 'Sandra Bravo', moneda: 'MXN', prioridad: 'normal', condiciones: '30_dias', etiquetas: ['mobiliario'] },
  { n: 4, folio: 'CNC-0926-0004', etapa: 'contactado', empresa: 'Transportes y Plataformas Baja', contacto: 'Javier Ríos', moneda: 'MXN', prioridad: 'baja', condiciones: '15_dias', etiquetas: ['plataformas'] },
  { n: 5, folio: 'CNC-0926-0005', etapa: 'cotizado', empresa: 'Industrias Metálicas del Norte', contacto: 'Roberto Valdez', moneda: 'MXN', prioridad: 'alta', condiciones: '30_dias', etiquetas: ['gabinetes'], lineas: [
    { descripcion: 'Gabinete metálico 60x40x25 cm calibre 14', cantidad: 120, material: 'Lámina CR 14 ga', area: 1.86, procesos: ['Láser', 'Doblez', 'Soldadura', 'Pintura'], precio: 1580 },
    { descripcion: 'Charola portacables 30x10 cm', cantidad: 240, material: 'Lámina galvanizada 18 ga', area: 0.72, procesos: ['Láser', 'Doblez'], precio: 420 },
  ] },
  { n: 6, folio: 'CNC-0926-0006', etapa: 'cotizado', empresa: 'Exhibidores Comerciales MX', contacto: 'Paola Gutiérrez', moneda: 'MXN', prioridad: 'normal', condiciones: 'contado', etiquetas: ['exhibidores', 'retail'], lineas: [
    { descripcion: 'Exhibidor piso 4 niveles con base metálica', cantidad: 60, material: 'PTR 1" y lámina CR', area: 2.4, procesos: ['Láser', 'Doblez', 'Soldadura', 'Pintura'], precio: 3450 },
  ] },
  { n: 7, folio: 'CNC-0926-0007', etapa: 'negociacion', empresa: 'Maquinados Aeroespaciales Baja', contacto: 'Diana Ochoa', moneda: 'USD', prioridad: 'urgente', condiciones: 'credito', etiquetas: ['aeroespacial', 'tolerancias-estrictas'], lineas: [
    { descripcion: 'Soporte estructural aluminio 6061-T6', cantidad: 80, material: 'Aluminio 6061', area: 0.95, procesos: ['CNC', 'Inspección CMM'], precio: 285 },
    { descripcion: 'Placa base maquinada anodizada', cantidad: 40, material: 'Aluminio 6061', area: 1.35, procesos: ['CNC', 'Anodizado externo'], precio: 410 },
  ] },
  { n: 8, folio: 'CNC-0926-0008', etapa: 'negociacion', empresa: 'Aceros y Estructuras Tijuana', contacto: 'Fernando Lozano', moneda: 'MXN', prioridad: 'alta', condiciones: '15_dias', etiquetas: ['estructura'], lineas: [
    { descripcion: 'Marco estructural para andamio 2x1 m', cantidad: 150, material: 'PTR 2x2 calibre 11', area: 3.2, procesos: ['Láser', 'Soldadura', 'Pintura'], precio: 1980 },
  ] },
  { n: 9, folio: 'CNC-0926-0009', etapa: 'ganada', empresa: 'Maquinados Aeroespaciales Baja', contacto: 'Diana Ochoa', moneda: 'MXN', prioridad: 'alta', condiciones: 'credito', etiquetas: ['aeroespacial'], cliente: 2, lineas: [
    { descripcion: 'Soporte estructural aluminio 6061-T6', cantidad: 120, material: 'Aluminio 6061', area: 0.95, procesos: ['CNC', 'Inspección CMM'], precio: 2400 },
    { descripcion: 'Placa base maquinada anodizada', cantidad: 40, material: 'Aluminio 6061', area: 1.35, procesos: ['CNC', 'Anodizado externo'], precio: 1550 },
  ] },
  { n: 10, folio: 'CNC-0926-0010', etapa: 'perdida', empresa: 'Electrodomésticos del Pacífico', contacto: 'Iván Cárdenas', moneda: 'MXN', prioridad: 'baja', condiciones: 'contado', etiquetas: ['refrigeración'], motivo: 'Precio fuera de presupuesto del cliente' },
];

async function sembrarPipeline(ids) {
  console.log('PIPELINE');
  const ahora = new Date();
  await insertar('pipeline', PIPELINE.map((p) => ({
    id: ID.pipeline(p.n),
    folio_op: p.folio,
    etapa: p.etapa,
    empresa: p.empresa,
    nombre_contacto: p.contacto,
    correo: `${p.contacto.toLowerCase().split(' ')[0]}@${p.empresa.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14)}.mx`,
    cliente_id: p.cliente ? ID.cliente(p.cliente) : null,
    vendedor_id: ids.ventas,
    moneda: p.moneda,
    condiciones_pago: p.condiciones,
    prioridad: p.prioridad,
    iva_porcentaje: 16,
    etiquetas: p.etiquetas,
    motivo_perdida: p.motivo ?? null,
    fecha_ultimo_contacto: new Date(ahora.getTime() - (p.n % 3) * 24 * 60 * 60 * 1000).toISOString(),
    fecha_envio_cotizacion: ['cotizado', 'negociacion', 'ganada'].includes(p.etapa)
      ? new Date(ahora.getTime() - (9 - p.n) * 24 * 60 * 60 * 1000).toISOString()
      : null,
  })));

  const lineas = [];
  for (const oportunidad of PIPELINE) {
    if (!oportunidad.lineas) continue;
    oportunidad.lineas.forEach((linea, indice) => {
      lineas.push({
        pipeline_id: ID.pipeline(oportunidad.n),
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        material: linea.material,
        area: linea.area,
        procesos: linea.procesos,
        precio_unitario: linea.precio,
        orden: indice,
      });
    });
  }
  await insertar('cotizacion_lineas', lineas);
  paso(`${PIPELINE.length} oportunidades y ${lineas.length} líneas de cotización`);
}

async function sembrarMetas(ids) {
  const mes = new Date();
  mes.setUTCDate(1);
  await insertar('metas_vendedor', [{
    id: ID.meta(1),
    vendedor_id: ids.ventas,
    mes: mes.toISOString().slice(0, 10),
    meta_mensual_mxn: 900000,
    porcentaje_comision: 2.5,
  }]);
  paso('Meta mensual del vendedor');
}

// ---------------------------------------------------------------------------
// Siembra — órdenes y producción
// ---------------------------------------------------------------------------

function fecha(dias) {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
}
function fechaCorta(dias) {
  return fecha(dias).slice(0, 10);
}

const ORDENES = [
  {
    clave: 'borrador',
    cliente: 1, prioridad: 'normal', compromiso: fecha(24),
    partidas: [
      { pieza: 'IMN-GAB-001', descripcion: 'Gabinete metálico 60x40x25 cm', cantidad: 120, unidad: 'pieza', material: 1, minutos: 35, maquina: 'LASER-FIBRA-01' },
      { pieza: 'IMN-CHA-002', descripcion: 'Charola portacables 30x10 cm', cantidad: 240, unidad: 'pieza', material: 3, minutos: 12, maquina: 'DOB-METAL-01' },
    ],
  },
  {
    clave: 'programada_1',
    cliente: 2, prioridad: 'alta', compromiso: fecha(18),
    partidas: [
      { pieza: 'MAB-SOP-010', descripcion: 'Soporte estructural aluminio 6061-T6', cantidad: 80, unidad: 'pieza', material: 6, minutos: 45, maquina: 'CNC-HAAS-01' },
      { pieza: 'MAB-PLA-011', descripcion: 'Placa base maquinada', cantidad: 40, unidad: 'pieza', material: 6, minutos: 60, maquina: 'CNC-HAAS-01' },
    ],
    programar: [
      { partida: 0, recurso: 2, dias: 4, turno: 'matutino', horas: 6 },
      { partida: 1, recurso: 3, dias: 5, turno: 'matutino', horas: 6 },
    ],
  },
  {
    clave: 'programada_2',
    cliente: 3, prioridad: 'normal', compromiso: fecha(20),
    partidas: [
      { pieza: 'AET-MAR-020', descripcion: 'Marco estructural para andamio 2x1 m', cantidad: 150, unidad: 'pieza', material: 4, minutos: 18, maquina: 'SOLD-MIG-01' },
    ],
    programar: [
      { partida: 0, recurso: 4, dias: 6, turno: 'vespertino', horas: 5 },
    ],
  },
  {
    clave: 'preparacion',
    cliente: 4, prioridad: 'alta', compromiso: fecha(12),
    partidas: [
      { pieza: 'ECM-EXH-030', descripcion: 'Exhibidor piso 4 niveles con base metálica', cantidad: 60, unidad: 'pieza', material: 5, minutos: 55, maquina: 'LASER-FIBRA-01' },
    ],
    preparar: { partida: 0, recurso: 1, dias: 0, turno: 'matutino', horas: 6, operador: 'luis' },
  },
  {
    clave: 'en_proceso',
    cliente: 1, prioridad: 'urgente', compromiso: fecha(6),
    partidas: [
      { pieza: 'IMN-TOL-040', descripcion: 'Tolva de recepción 1.2 m³', cantidad: 40, unidad: 'pieza', material: 1, minutos: 90, maquina: 'CNC-HAAS-02' },
      { pieza: 'IMN-REF-041', descripcion: 'Refuerzo lateral tolva', cantidad: 80, unidad: 'pieza', material: 4, minutos: 25, maquina: 'SOLD-MIG-01' },
    ],
    activa: { partida: 0, recurso: 3, dias: 0, turno: 'matutino', horas: 8, operador: 'jorge', producido: 14, scrap: 1, consumo: 6.5 },
  },
  {
    clave: 'pausada',
    cliente: 6, prioridad: 'normal', compromiso: fecha(15),
    partidas: [
      { pieza: 'MIB-EST-050', descripcion: 'Estante industrial 5 niveles', cantidad: 30, unidad: 'pieza', material: 4, minutos: 70, maquina: 'SOLD-MIG-01' },
    ],
    pausa: { partida: 0, recurso: 5, dias: 0, turno: 'vespertino', horas: 6, operador: 'sergio', producido: 4, motivo: 'material_pendiente' },
  },
  {
    clave: 'completada_1', cliente: 1, prioridad: 'alta', compromiso: fecha(-4),
    partidas: [
      { pieza: 'IMN-ENV-060', descripcion: 'Envolvente para tablero eléctrico', cantidad: 90, unidad: 'pieza', material: 1, minutos: 40, maquina: 'LASER-FIBRA-01' },
    ],
    completar: { diasInicio: 22, diasFin: 16, recurso: 1, operador: 'jorge', consumo: 45 },
    ar: { monto: 349000, moneda: 'MXN', tc: 1, vence: 15, factura: 'FAC-18421' },
  },
  {
    clave: 'completada_2', cliente: 2, prioridad: 'urgente', compromiso: fecha(-8),
    partidas: [
      { pieza: 'MAB-INS-061', descripcion: 'Insertos de sujeción aeroespacial', cantidad: 200, unidad: 'pieza', material: 7, minutos: 8, maquina: 'CNC-HAAS-01' },
      { pieza: 'MAB-CUB-062', descripcion: 'Cubierta de protección CNC', cantidad: 60, unidad: 'pieza', material: 2, minutos: 46, maquina: 'DOB-METAL-01' },
    ],
    completar: { diasInicio: 30, diasFin: 21, recurso: 2, operador: 'luis', consumo: 20 },
    ar: { monto: 15200, moneda: 'USD', tc: 18.75, vence: -8, factura: 'INV-2291' },
    pago: { monto: 7200, moneda: 'USD', tc: 18.75, metodo: 'transferencia', cuenta: 2, referencia: 'SPEI-2291-A' },
  },
  {
    clave: 'completada_3', cliente: 3, prioridad: 'normal', compromiso: fecha(-12),
    partidas: [
      { pieza: 'AET-BAS-063', descripcion: 'Base metálica para bomba centrífuga', cantidad: 50, unidad: 'pieza', material: 6, minutos: 52, maquina: 'SOLD-MIG-01' },
    ],
    completar: { diasInicio: 35, diasFin: 24, recurso: 5, operador: 'sergio', consumo: 60 },
    ar: { monto: 185000, moneda: 'MXN', tc: 1, vence: -6, factura: 'FAC-18397' },
    pago: { monto: 185000, moneda: 'MXN', tc: 1, metodo: 'transferencia', cuenta: 1, referencia: 'SPEI-18397' },
  },
  {
    clave: 'completada_4', cliente: 4, prioridad: 'alta', compromiso: fecha(-15),
    partidas: [
      { pieza: 'ECM-PER-064', descripcion: 'Perchero exhibidor línea blanca', cantidad: 140, unidad: 'pieza', material: 5, minutos: 16, maquina: 'DOB-METAL-01' },
    ],
    completar: { diasInicio: 40, diasFin: 30, recurso: 4, operador: 'jorge', consumo: 95 },
    ar: { monto: 112000, moneda: 'MXN', tc: 1, vence: 3, factura: 'FAC-18455' },
    pago: { monto: 112000, moneda: 'MXN', tc: 1, metodo: 'transferencia', cuenta: 1, referencia: 'SPEI-18455' },
  },
  {
    clave: 'completada_5', cliente: 1, prioridad: 'normal', compromiso: fecha(-5),
    partidas: [
      { pieza: 'IMN-CAR-065', descripcion: 'Carro de arrastre para almacén', cantidad: 45, unidad: 'pieza', material: 4, minutos: 38, maquina: 'SOLD-MIG-01' },
    ],
    completar: { diasInicio: 26, diasFin: 18, recurso: 5, operador: 'luis', consumo: 70 },
    ar: { monto: 248000, moneda: 'MXN', tc: 1, vence: 26, factura: 'FAC-18470' },
    pago: { monto: 253000, moneda: 'MXN', tc: 1, metodo: 'transferencia', cuenta: 1, referencia: 'SPEI-18470', sobrepago: true },
  },
  {
    clave: 'cancelada', cliente: 5, prioridad: 'baja', compromiso: fecha(30),
    partidas: [
      { pieza: 'EPP-CAJ-070', descripcion: 'Caja de control prototipo', cantidad: 15, unidad: 'pieza', material: 3, minutos: 30, maquina: 'LASER-FIBRA-01' },
    ],
  },
];

/** Orden originada en una oportunidad del pipeline (flujo comercial completo). */
const ESPECIFICACION_VENDEDOR = {
  clave: 'vendedor',
  pipeline: 8,
  cliente: 3,
  completar: { diasInicio: 20, diasFin: 12, recurso: 4, operador: 'jorge', consumo: 40 },
  ar: { monto: 297000, moneda: 'MXN', tc: 1, vence: 18, factura: 'FAC-18502' },
};

async function crearOrden(especificacion, ids) {  const partidas = especificacion.partidas.map((p) => ({
    codigo_pieza: p.pieza,
    descripcion: p.descripcion,
    cantidad_solicitada: p.cantidad,
    unidad_medida: p.unidad,
    material_id: ID.material(p.material),
    tiempo_estimado_minutos: p.minutos,
    maquina_asignada: p.maquina,
  }));

  const [creada] = await rpc('crear_orden_manual', {
    p_cliente_id: ID.cliente(especificacion.cliente),
    p_fecha_compromiso: especificacion.compromiso,
    p_prioridad: especificacion.prioridad,
    p_partidas: partidas,
  });

  const filas = await ejecutar(
    'SELECT partidas',
    cliente.from('partidas_orden_produccion').select('id, codigo_pieza, cantidad_solicitada, material_id').eq('orden_id', creada.id).order('codigo_pieza'),
  );
  void ids;
  return { id: creada.id, folio: creada.folio, partidas: filas ?? [] };
}

async function programarPartida(ordenId, partidaId, indicePartida, configuracion) {
  const [programacion] = await rpc('programar_partida_recurso', {
    p_orden_id: ordenId,
    p_partida_id: partidaId,
    p_recurso_id: ID.recurso(configuracion.recurso),
    p_secuencia: 1,
    p_fecha_programada: fechaCorta(configuracion.dias),
    p_turno: configuracion.turno,
    p_horas_estimadas: configuracion.horas,
    p_orden_prioridad: indicePartida + 2,
  });
  return programacion;
}

async function activarPreparacion(programacion) {
  const [actualizada] = await rpc('activar_modo_preparacion', {
    p_programacion_id: programacion.id,
    p_actualizado_en_esperado: programacion.actualizado_en,
  });
  return actualizada;
}

/** Transición mínima borrador → programada antes de programar o iniciar piso. */
async function marcarProgramada(orden) {
  await rpc('cambiar_estado_orden', {
    p_orden_id: orden.id,
    p_estado_actual: 'borrador',
    p_estado_nuevo: 'programada',
  });
}

async function sembrarOrdenes(ids) {
  console.log('ÓRDENES Y PRODUCCIÓN');
  const creadas = {};

  for (const especificacion of ORDENES) {
    const orden = await crearOrden(especificacion, ids);
    creadas[especificacion.clave] = orden;
    paso(`${orden.folio} · ${especificacion.clave} · ${orden.partidas.length} partida(s)`);
  }

  // Orden creada desde una oportunidad ganada del vendedor (flujo Pipeline → OP).
  {
    const [creada] = await rpc('aprobar_oportunidad_y_crear_orden', {
      p_pipeline_id: ID.pipeline(ESPECIFICACION_VENDEDOR.pipeline),
      p_cliente_id: ID.cliente(ESPECIFICACION_VENDEDOR.cliente),
      p_fecha_compromiso: fecha(14),
    });
    const partidas = await ejecutar(
      'SELECT partidas vendedor',
      cliente.from('partidas_orden_produccion')
        .select('id, codigo_pieza, cantidad_solicitada, material_id')
        .eq('orden_id', creada.id)
        .order('codigo_pieza'),
    );
    creadas.vendedor = { id: creada.id, folio: creada.folio, partidas: partidas ?? [] };
    paso(`${creada.folio} · vendedor · origen Pipeline #${ESPECIFICACION_VENDEDOR.pipeline}`);
  }

  // Programadas (planeación con trabajo futuro).
  for (const clave of ['programada_1', 'programada_2']) {
    const orden = creadas[clave];
    const especificacion = ORDENES.find((o) => o.clave === clave);
    await marcarProgramada(orden);
    for (const plan of especificacion.programar) {
      await programarPartida(orden.id, orden.partidas[plan.partida].id, plan.partida, plan);
    }
  }
  paso('Programaciones futuras listas');

  // En preparación (lista para que el operador inicie).
  {
    const orden = creadas.preparacion;
    const especificacion = ORDENES.find((o) => o.clave === 'preparacion');
    const plan = especificacion.preparar;
    await marcarProgramada(orden);
    const programacion = await programarPartida(orden.id, orden.partidas[plan.partida].id, plan.partida, plan);
    const preparada = await activarPreparacion(programacion);
    await rpc('asignar_operador_a_partida_op', {
      p_partida_id: orden.partidas[plan.partida].id,
      p_operador_id: ids[plan.operador],
    });
    void preparada;
  }
  paso('OP en preparación con operador asignado');

  // En proceso con sesión activa (piso en vivo).
  {
    const orden = creadas.en_proceso;
    const especificacion = ORDENES.find((o) => o.clave === 'en_proceso');
    const plan = especificacion.activa;
    const partida = orden.partidas[plan.partida];
    await marcarProgramada(orden);
    const programacion = await programarPartida(orden.id, partida.id, plan.partida, plan);
    await activarPreparacion(programacion);
    await rpc('asignar_operador_a_partida_op', { p_partida_id: partida.id, p_operador_id: ids[plan.operador] });
    await rpc('iniciar_sesion_trabajo_operador', {
      p_orden_id: orden.id,
      p_partida_id: partida.id,
      p_programacion_id: programacion.id,
      p_operador_id: ids[plan.operador],
    });
    await rpc('registrar_avance_partida_op', {
      p_partida_id: partida.id,
      p_operador_id: ids[plan.operador],
      p_cantidad_producida: plan.producido,
      p_cantidad_scrap: plan.scrap,
    });
    await rpc('registrar_consumo_material_op', {
      p_partida_id: partida.id,
      p_material_id: partida.material_id,
      p_cantidad_usada: plan.consumo,
      p_cantidad_scrap: 0.4,
    });
  }
  paso('OP en proceso con sesión activa y avance');

  // Pausada con motivo.
  {
    const orden = creadas.pausada;
    const especificacion = ORDENES.find((o) => o.clave === 'pausada');
    const plan = especificacion.pausa;
    const partida = orden.partidas[plan.partida];
    await marcarProgramada(orden);
    const programacion = await programarPartida(orden.id, partida.id, plan.partida, plan);
    await activarPreparacion(programacion);
    await rpc('asignar_operador_a_partida_op', { p_partida_id: partida.id, p_operador_id: ids[plan.operador] });
    const [sesion] = await rpc('iniciar_sesion_trabajo_operador', {
      p_orden_id: orden.id,
      p_partida_id: partida.id,
      p_programacion_id: programacion.id,
      p_operador_id: ids[plan.operador],
    });
    await rpc('cerrar_sesion_trabajo_operador', {
      p_sesion_id: sesion.id,
      p_operador_id: ids[plan.operador],
      p_piezas_producidas: plan.producido,
      p_estado_destino: 'pausada',
      p_motivo_pausa: plan.motivo,
      p_notas: 'Se detiene el lote a la espera de lámina calibre 11.',
    });
  }
  paso('OP pausada con motivo');

  // Completadas (histórico con sesión, avance y consumo).
  const completadas = ['completada_1', 'completada_2', 'completada_3', 'completada_4', 'completada_5', 'vendedor'];
  for (const clave of completadas) {
    const orden = creadas[clave];
    const especificacion = clave === 'vendedor' ? ESPECIFICACION_VENDEDOR : ORDENES.find((o) => o.clave === clave);
    const plan = especificacion.completar;
    const fechaInicio = new Date(Date.now() - plan.diasInicio * 24 * 60 * 60 * 1000);
    const fechaFin = new Date(Date.now() - plan.diasFin * 24 * 60 * 60 * 1000);
    const horasNetas = Math.max(1, Math.round((fechaFin - fechaInicio) / 3_600_000 / 3) * 3);

    for (const [indice, partida] of orden.partidas.entries()) {
      const programacionId = uid('9e0a0000', Object.keys(creadas).indexOf(clave) * 10 + indice + 1);
      await insertar('programacion_areas', [{
        id: programacionId,
        orden_id: orden.id,
        partida_id: partida.id,
        recurso_id: ID.recurso(plan.recurso),
        secuencia: 1,
        estado_planeacion: 'completada',
        fecha_programada: fechaFin.toISOString().slice(0, 10),
        turno: 'matutino',
        horas_estimadas: 6,
        orden_prioridad: indice + 1,
      }]);

      const sesionId = uid('5e510000', Object.keys(creadas).indexOf(clave) * 10 + indice + 1);
      await insertar('sesiones_trabajo', [{
        id: sesionId,
        orden_id: orden.id,
        partida_id: partida.id,
        programacion_id: programacionId,
        operador_id: ids[plan.operador],
        fecha_inicio: fechaInicio.toISOString(),
        fecha_fin: fechaFin.toISOString(),
        horas_brutas: horasNetas + 0.5,
        horas_netas: horasNetas,
        piezas_producidas: partida.cantidad_solicitada,
        estado_sesion: 'finalizada',
        costo_hora_interno: 1150,
      }]);

      await insertar('registros_tiempo_operador', [
        { partida_id: partida.id, operador_id: ids[plan.operador], accion: 'inicio', fecha_registro: fechaInicio.toISOString(), notas: 'Sesión de producción iniciada' },
        { partida_id: partida.id, operador_id: ids[plan.operador], accion: 'fin', fecha_registro: fechaFin.toISOString(), notas: 'Lote terminado conforme a especificación' },
      ]);

      await insertar('registros_avance_partida', [{
        partida_id: partida.id,
        operador_id: ids[plan.operador],
        cantidad_producida: partida.cantidad_solicitada,
        cantidad_scrap: indice === 0 ? 2 : 0,
        sesion_trabajo_id: sesionId,
      }]);

      await actualizar('partidas_orden_produccion', {
        cantidad_producida: partida.cantidad_solicitada,
        cantidad_scrap: indice === 0 ? 2 : 0,
        tiempo_real_minutos: horasNetas * 60,
        operador_asignado_id: ids[plan.operador],
      }, { id: partida.id });

      const material = MATERIALES.find((m) => ID.material(m.n) === partida.material_id) ?? MATERIALES[0];
      const materialId = partida.material_id ?? ID.material(material.n);
      const cantidadConsumo = Number((plan.consumo / orden.partidas.length).toFixed(2));
      await rpc('registrar_movimiento_inventario', {
        p_material_id: materialId,
        p_tipo: 'salida_produccion',
        p_prefijo_folio: 'SAL',
        p_cantidad_control: cantidadConsumo,
        p_costo_unitario_momento: Number((material.costoCompra / material.factor).toFixed(4)),
        p_orden_id: orden.id,
        p_referencia_externa: `CONSUMO-${orden.folio}`,
        p_notas: `Consumo de ${partida.codigo_pieza}`,
      });
      await insertar('registros_consumo_material', [{
        partida_id: partida.id,
        material_id: materialId,
        cantidad_usada: cantidadConsumo,
        cantidad_scrap: 0,
        costo_unitario_momento: Number((material.costoCompra / material.factor).toFixed(4)),
      }]);
    }

    await actualizar('ordenes_produccion', {
      estado: 'completada',
      fecha_inicio: fechaInicio.toISOString(),
      fecha_fin: fechaFin.toISOString(),
    }, { id: orden.id });
  }
  paso('6 OP completadas con producción, consumo y tiempos');

  // Cancelada con motivo.
  {
    const orden = creadas.cancelada;
    await rpc('cambiar_estado_orden', {
      p_orden_id: orden.id,
      p_estado_actual: 'borrador',
      p_estado_nuevo: 'cancelada',
      p_motivo_cancelacion: 'El cliente canceló por cambio de diseño del prototipo.',
    });
  }
  paso('OP cancelada');

  // Notas de entrega (parcial y total).
  {
    const parcial = creadas.completada_1;
    await rpc('generar_nota_entrega', {
      p_orden_id: parcial.id,
      p_recibido_por: 'Almacén Industrias Metálicas del Norte',
      p_firma_cliente_url: '',
      p_creado_por: ids.admin,
      p_partidas: [{ partida_id: parcial.partidas[0].id, cantidad_entregada: 60 }],
    });
    const total = creadas.completada_3;
    await rpc('generar_nota_entrega', {
      p_orden_id: total.id,
      p_recibido_por: 'Recepción Aceros y Estructuras Tijuana',
      p_firma_cliente_url: '',
      p_creado_por: ids.admin,
      p_partidas: [{ partida_id: total.partidas[0].id, cantidad_entregada: total.partidas[0].cantidad_solicitada }],
    });
  }
  paso('2 notas de entrega (parcial y total)');

  return creadas;
}

// ---------------------------------------------------------------------------
// Siembra — cobranza
// ---------------------------------------------------------------------------

async function sembrarCobranza(creadas, ids) {
  console.log('COBRANZA');
  const cuentas = {};
  for (const clave of ['completada_1', 'completada_2', 'completada_3', 'completada_4', 'completada_5', 'vendedor']) {
    const orden = creadas[clave];
    const especificacion = clave === 'vendedor' ? ESPECIFICACION_VENDEDOR : ORDENES.find((o) => o.clave === clave);
    const ar = especificacion.ar;
    const [cuenta] = await rpc('abrir_cuenta_por_cobrar', {
      p_orden_id: orden.id,
      p_monto_total: ar.monto,
      p_moneda: ar.moneda,
      p_tipo_cambio_origen: ar.tc,
      p_fecha_vencimiento: fecha(ar.vence),
      p_folio_factura_remision: ar.factura,
    });
    cuentas[clave] = cuenta;
    paso(`AR ${ar.factura} · ${ar.moneda} ${ar.monto.toLocaleString('es-MX')} vence ${ar.vence >= 0 ? '+' : ''}${ar.vence} d`);
  }

  let nSolicitud = 1;
  for (const clave of ['completada_2', 'completada_3', 'completada_4', 'completada_5']) {
    const orden = creadas[clave];
    const especificacion = ORDENES.find((o) => o.clave === clave);
    const pago = especificacion.pago;
    if (!pago) continue;
    const resultado = await rpc('registrar_pago_ar_atomico', {
      p_ar_id: cuentas[clave].id,
      p_monto_pagado: pago.monto,
      p_moneda_pago: pago.moneda,
      p_tipo_cambio_pago: pago.tc,
      p_metodo_pago: pago.metodo,
      p_referencia: pago.referencia,
      p_usuario_id: ids.finanzas,
      p_solicitud_id: ID.solicitud(nSolicitud),
      p_notas: `Pago recibido de ${CLIENTES.find((c) => c.n === especificacion.cliente).nombre}`,
      p_cuenta_bancaria_id: ID.banco(pago.cuenta),
    });
    nSolicitud += 1;
    paso(`Pago ${pago.referencia} · recibo ${resultado[0]?.folio_recibo ?? '—'}`);
    void orden;
  }

  // Aplicar saldo a favor del sobrepago de completada_5 (cliente 1) a su AR pendiente.
  const aplicacion = await rpc('aplicar_saldo_favor_ar', {
    p_cliente_id: ID.cliente(1),
    p_ar_id: cuentas.completada_1.id,
    p_monto_mxn: 2500,
    p_usuario_id: ids.finanzas,
    p_solicitud_id: ID.solicitud(50),
  });
  paso(`Saldo a favor aplicado · recibo ${aplicacion[0]?.folio_recibo ?? '—'}`);
}

// ---------------------------------------------------------------------------
// Siembra — gastos
// ---------------------------------------------------------------------------

const GASTOS = [
  { n: 1, categoria: 'materia_prima', descripcion: 'Compra de lámina rolada en frío calibre 14 (lote 2409)', subtotal: 34500, proveedor: 1, orden: 'completada_1', dias: 20, vence: 4, estado: 'pagado', metodo: 'transferencia', comprobante: 'FAC-AP-8841' },
  { n: 2, categoria: 'consumibles', descripcion: 'Discos de corte y desbaste para taller', subtotal: 4820, proveedor: 3, orden: null, dias: 12, vence: 8, estado: 'pagado', metodo: 'tarjeta', comprobante: 'TKT-2291' },
  { n: 3, categoria: 'herramentental', descripcion: 'Insertos de carburo para centro de maquinado', subtotal: 18900, proveedor: 3, orden: 'completada_2', dias: 9, vence: 21, estado: 'pendiente', metodo: null, comprobante: 'FAC-SC-4402' },
  { n: 4, categoria: 'maquila_externa', descripcion: 'Tratamiento térmico de insertos aeroespaciales', subtotal: 27600, proveedor: 4, orden: 'completada_2', dias: 18, vence: -3, estado: 'pendiente', metodo: null, comprobante: 'FAC-TTB-1180' },
  { n: 5, categoria: 'logistica', descripcion: 'Flete local entrega envolventes tablero', subtotal: 3200, proveedor: null, orden: 'completada_1', dias: 15, vence: -1, estado: 'pagado', metodo: 'efectivo', comprobante: 'REC-FL-0921' },
  { n: 6, categoria: 'servicios_generales', descripcion: 'Energía eléctrica nave industrial (periodo agosto)', subtotal: 45200, proveedor: null, orden: null, dias: 25, vence: 5, estado: 'pagado', metodo: 'transferencia', comprobante: 'CFE-88231' },
  { n: 7, categoria: 'mantenimiento', descripcion: 'Mantenimiento preventivo centro Haas VF-2', subtotal: 9800, proveedor: null, orden: null, dias: 4, vence: 26, estado: 'pendiente', metodo: null, comprobante: 'SRV-HAAS-771' },
  { n: 8, categoria: 'consumibles', descripcion: 'Pintura electrostática negra y pigmentos', subtotal: 12400, proveedor: 2, orden: 'completada_4', dias: 7, vence: 23, estado: 'pagado', metodo: 'transferencia', comprobante: 'FAC-MIT-3390' },
  { n: 9, categoria: 'otros', descripcion: 'Insumos de seguridad EPP para piso', subtotal: 5600, proveedor: null, orden: null, dias: 6, vence: 24, estado: 'pagado', metodo: 'efectivo', comprobante: 'TKT-EPP-2210' },
  { n: 10, categoria: 'herramentental', descripcion: 'Dado especial doblez para perfil MAB', subtotal: 21500, proveedor: 3, orden: 'completada_2', dias: 28, vence: 2, estado: 'cancelado', metodo: null, comprobante: 'FAC-SC-4110' },
];

async function sembrarGastos(creadas, ids) {
  console.log('GASTOS');
  for (const gasto of GASTOS) {
    const iva = Number((gasto.subtotal * 0.16).toFixed(4));
    const total = Number((gasto.subtotal + iva).toFixed(4));
    const [registrado] = await rpc('registrar_gasto', {
      p_orden_id: gasto.orden ? creadas[gasto.orden].id : null,
      p_proveedor_id: gasto.proveedor ? ID.proveedor(gasto.proveedor) : null,
      p_categoria: gasto.categoria,
      p_descripcion: gasto.descripcion,
      p_monto_subtotal: gasto.subtotal,
      p_monto_iva: iva,
      p_monto_total: total,
      p_moneda: 'MXN',
      p_tipo_cambio: 1,
      p_fecha_gasto: fecha(-gasto.dias),
      p_fecha_vencimiento: fecha(gasto.vence),
      p_comprobante_url: null,
      p_folio_comprobante: gasto.comprobante,
      p_metodo_pago: gasto.metodo,
      p_datos_ocr_json: null,
      p_notas: null,
      p_creado_por: ids.finanzas,
    });
    if (gasto.estado !== 'pendiente') {
      await rpc('cambiar_estado_gasto', {
        p_gasto_id: registrado.id,
        p_nuevo_estado: gasto.estado,
        p_usuario_id: ids.finanzas,
        p_estado_esperado: 'pendiente',
      });
    }
    paso(`Gasto ${registrado.folio} · ${gasto.categoria} · ${gasto.estado}`);
  }
}

// ---------------------------------------------------------------------------
// Siembra — comentarios, notificaciones y auditoría
// ---------------------------------------------------------------------------

async function sembrarSocial(creadas, ids) {
  console.log('COMENTARIOS Y NOTIFICACIONES');
  const comentarios = [
    { n: 1, entidad: 'orden', id: creadas.en_proceso.id, autor: ids.ventas, contenido: 'Cliente confirmó por teléfono que acepta las piezas sin pintura, se entregan en acero natural. @Jorge Ramírez Ortega avísame si hay duda con la tolva.', menciones: [ids.jorge] },
    { n: 2, entidad: 'orden', id: creadas.en_proceso.id, autor: ids.jorge, contenido: 'Recibido. Ya vamos 14 piezas de la tolva, el doblez del refuerzo queda exacto. Sin novedad en el material.', menciones: [] },
    { n: 3, entidad: 'orden', id: creadas.pausada.id, autor: ids.gerencia, contenido: 'La lámina calibre 11 llega el jueves; @Alejandra Ríos Beltrán confirma con el proveedor la hora de descarga.', menciones: [ids.ventas] },
    { n: 4, entidad: 'orden', id: creadas.completada_2.id, autor: ids.gerencia, contenido: 'Lote aeroespacial entregado al 100%. La inspección dimensional salió sin desviaciones. Excelente trabajo de @Luis Torres Aguilar.', menciones: [ids.luis] },
    { n: 5, entidad: 'cotizacion', id: ID.pipeline(7), autor: ids.ventas, contenido: 'La cotización USD 285 por soporte queda firme hasta el viernes; @Carlos Mendoza Salas necesito el tiempo de CMM para cerrar la negociación.', menciones: [ids.gerencia] },
    { n: 6, entidad: 'cotizacion', id: ID.pipeline(8), autor: ids.gerencia, contenido: 'Propongo programar el marco de andamio en dos turnos para cumplir el compromiso. Quedo atento.', menciones: [] },
    { n: 7, entidad: 'cliente', id: ID.cliente(1), autor: ids.finanzas, contenido: 'Crédito al corriente; el pago parcial aplicado con saldo a favor quedó registrado. @Alejandra Ríos Beltrán comparte el estado de cuenta.', menciones: [ids.ventas] },
    { n: 8, entidad: 'orden', id: creadas.cancelada.id, autor: ids.ventas, contenido: 'El cliente canceló el prototipo por cambio de diseño; quedó motivo en la orden y no se consumió material.', menciones: [] },
  ];

  await insertar('comentarios_registro', comentarios.map((c) => ({
    id: ID.comentario(c.n),
    entidad_tipo: c.entidad,
    entidad_id: c.id,
    autor_id: c.autor,
    contenido: c.contenido,
    menciones_json: c.menciones,
    archivos_adjuntos: [],
  })));
  paso(`${comentarios.length} comentarios con menciones (notificaciones automáticas)`);

  await insertar('notificaciones_usuario', [
    { id: ID.notificacion(1), usuario_id: ids.ventas, emisor_id: ids.gerencia, tipo: 'estado_orden', titulo: 'Orden lista para revisión', mensaje: 'La OP de tolvas del cliente IMN pasó a producción con 14 piezas.', enlace: '/ordenes', leida: false },
    { id: ID.notificacion(2), usuario_id: ids.finanzas, emisor_id: null, tipo: 'alerta_sistema', titulo: 'Cuenta por cobrar vencida', mensaje: 'La factura INV-2291 del cliente MAB lleva 8 días vencida con saldo pendiente.', enlace: '/clientes', leida: false },
    { id: ID.notificacion(3), usuario_id: ids.gerencia, emisor_id: null, tipo: 'alerta_sistema', titulo: 'Capacidad comprometida', mensaje: 'El centro Haas VF-2 alcanza 92% de ocupación la próxima semana.', enlace: '/ordenes', leida: false },
  ]);
  paso('3 notificaciones del sistema');

  const acciones = [
    { n: 1, usuarioId: ids.admin, nombre: 'Administrador', rol: 'admin', accion: 'iniciar_sesion', modulo: 'autenticacion', dias: 0 },
    { n: 2, usuarioId: ids.ventas, nombre: 'Alejandra Ríos Beltrán', rol: 'vendedor', accion: 'aprobar_oportunidad_y_crear_orden', modulo: 'pipeline', dias: 2 },
    { n: 3, usuarioId: ids.gerencia, nombre: 'Carlos Mendoza Salas', rol: 'gerente', accion: 'programar_partida_recurso', modulo: 'planeacion', dias: 1 },
    { n: 4, usuarioId: ids.jorge, nombre: 'Jorge Ramírez Ortega', rol: 'operador', accion: 'iniciar_sesion_trabajo_operador', modulo: 'produccion', dias: 0 },
    { n: 5, usuarioId: ids.finanzas, nombre: 'Miguel Ángel Fuentes', rol: 'contador', accion: 'registrar_pago_ar_atomico', modulo: 'cobranza', dias: 3 },
    { n: 6, usuarioId: ids.finanzas, nombre: 'Miguel Ángel Fuentes', rol: 'contador', accion: 'registrar_gasto', modulo: 'gastos', dias: 4 },
    { n: 7, usuarioId: ids.luis, nombre: 'Luis Torres Aguilar', rol: 'operador', accion: 'cerrar_sesion_trabajo_operador', modulo: 'produccion', dias: 2 },
    { n: 8, usuarioId: ids.gerencia, nombre: 'Carlos Mendoza Salas', rol: 'gerente', accion: 'cambiar_estado_orden', modulo: 'ordenes', dias: 5 },
  ];
  await insertar('logs', acciones.map((a) => ({
    id: ID.log(a.n),
    usuario_id: a.usuarioId,
    nombre_usuario: a.nombre,
    rol: a.rol,
    accion: a.accion,
    modulo: a.modulo,
    recurso_id: '00000000-0000-4000-8000-000000000000',
    detalles: { origen: 'demo' },
    creado_en: fecha(-a.dias),
  })));
  paso('8 registros de auditoría');
}

// ---------------------------------------------------------------------------
// Verificación
// ---------------------------------------------------------------------------

async function verificar() {
  console.log('VERIFICACIÓN');
  const esperados = {
    clientes: 8,
    pipeline: 10,
    cotizacion_lineas: 8,
    materiales: 10,
    movimientos_inventario: 19,
    registros_consumo_material: 8,
    recursos_planeacion: 6,
    capacidades_recurso_turno: 12,
    excepciones_capacidad_recurso: 1,
    ordenes_produccion: 13,
    partidas_orden_produccion: 17,
    programacion_areas: 13,
    sesiones_trabajo: 9,
    registros_avance_partida: 9,
    notas_entrega: 2,
    cuentas_por_cobrar: 6,
    pagos_ar: 5,
    movimientos_saldo_favor: 2,
    gastos: 10,
    comentarios_registro: 8,
    notificaciones_usuario: 8,
    metas_vendedor: 1,
    areas_trabajo_config: 6,
    cuentas_bancarias: 3,
    proveedores: 4,
  };
  let fallos = 0;
  for (const [tabla, esperado] of Object.entries(esperados)) {
    const columna = tabla === 'capacidades_recurso_turno' ? 'recurso_id' : 'id';
    const total = await contar(tabla, columna);
    const estado = total === esperado ? 'OK ' : 'DIF';
    if (total !== esperado) fallos += 1;
    console.log(`  ${estado} ${tabla}: ${total} (esperado ${esperado})`);
  }

  // La auditoría es viva: crece con cada sesión real, por eso solo se informa.
  console.log(`  INFO logs: ${await contar('logs')} (crece con el uso real)`);

  const { data: ordenes } = await cliente.from('ordenes_produccion').select('estado');
  const porEstado = {};
  for (const fila of ordenes ?? []) porEstado[fila.estado] = (porEstado[fila.estado] ?? 0) + 1;
  console.log(`  Estados de OP: ${JSON.stringify(porEstado)}`);

  const { data: ar } = await cliente.from('cuentas_por_cobrar').select('estado');
  const porEstadoAr = {};
  for (const fila of ar ?? []) porEstadoAr[fila.estado] = (porEstadoAr[fila.estado] ?? 0) + 1;
  console.log(`  Estados de AR: ${JSON.stringify(porEstadoAr)}`);

  const { data: sesiones } = await cliente.from('sesiones_trabajo').select('estado_sesion');
  const porEstadoSesion = {};
  for (const fila of sesiones ?? []) porEstadoSesion[fila.estado_sesion] = (porEstadoSesion[fila.estado_sesion] ?? 0) + 1;
  console.log(`  Sesiones: ${JSON.stringify(porEstadoSesion)}`);

  const { data: materiales } = await cliente.from('materiales').select('codigo, stock_actual_control').order('codigo');
  const sinStock = (materiales ?? []).filter((m) => Number(m.stock_actual_control) <= 0);
  console.log(`  Materiales sin stock: ${sinStock.length}${sinStock.length ? ` → ${sinStock.map((m) => m.codigo).join(', ')}` : ''}`);

  if (fallos > 0) {
    console.log(`\nVerificación con ${fallos} diferencia(s). Revisa los conteos anteriores.`);
    process.exitCode = 1;
  } else {
    console.log('\nVerificación completa: todos los módulos con datos coherentes.');
  }
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------

async function principal() {
  console.log(`DEMO CLIENTE — modo: ${MODO}\n`);
  if (MODO === 'verificar') {
    await verificar();
    return;
  }

  if (MODO === 'limpiar' || MODO === 'todo') {
    await limpiarBase();
  }
  if (MODO === 'sembrar' || MODO === 'todo') {
    const { data: admin } = await cliente
      .from('usuarios')
      .select('id')
      .eq('email', 'ales_2_@hotmail.com')
      .maybeSingle();
    asegurar(admin?.id, 'No se encontró al administrador ales_2_@hotmail.com en usuarios.');

    const ids = await sembrarUsuarios(admin.id);
    await sembrarConfiguracion(admin.id);
    await sembrarRecursos();
    await sembrarMateriales();
    await sembrarClientes();
    await sembrarPipeline(ids);
    await sembrarMetas(ids);
    const creadas = await sembrarOrdenes(ids);
    await sembrarCobranza(creadas, ids);
    await sembrarGastos(creadas, ids);
    await sembrarSocial(creadas, ids);
    await verificar();
  }
}

principal().catch((error) => {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
});
