#!/usr/bin/env node
/**
 * Operación realista de hoy y mañana — RFQ, propuestas, órdenes, planeación y
 * producción sobre el maestro EXISTENTE (clientes, materiales, precios,
 * dimensiones, catálogos, máquinas, tarifas, usuarios y cuentas bancarias).
 *
 * No crea ni modifica datos maestros. Pensado para ejecutarse después de
 * `supabase/semillas/limpieza-operativa.sql`.
 *
 * Uso local (stack en 127.0.0.1):
 *   $env:CONFIRMAR_SEMILLA='si'; node supabase/semillas/operacion-hoy-manana.mjs
 *   node supabase/semillas/operacion-hoy-manana.mjs verificar
 *
 * Uso remoto (solo con autorización explícita del PO):
 *   $env:DEMO_DESTINO='remoto'
 *   $env:CONFIRMAR_DEMO_REMOTO='pwnecbcynnqnvfwmvrnn'
 *   $env:CONFIRMAR_SEMILLA='si'
 *   node supabase/semillas/operacion-hoy-manana.mjs
 */

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cargarEntornoLocal, exigirSupabaseLocal } from './guardia-supabase-local.mjs';

cargarEntornoLocal();

const MODO = process.argv[2] ?? 'sembrar';
if (!['sembrar', 'verificar'].includes(MODO)) {
  throw new Error(`Modo inválido: ${MODO}`);
}
if (MODO === 'sembrar' && process.env.CONFIRMAR_SEMILLA !== 'si') {
  throw new Error('Define CONFIRMAR_SEMILLA=si para sembrar la operación.');
}
if (process.env.NODE_ENV === 'production' && !process.env.DEMO_DESTINO) {
  throw new Error('La semilla no corre con NODE_ENV=production sin autorización remota explícita.');
}

const REF_REMOTO = 'pwnecbcynnqnvfwmvrnn';
if (process.env.DEMO_DESTINO === 'remoto') {
  if (process.env.CONFIRMAR_DEMO_REMOTO !== REF_REMOTO) {
    throw new Error(`Define CONFIRMAR_DEMO_REMOTO=${REF_REMOTO} para el proyecto remoto autorizado.`);
  }
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
  if (host !== `${REF_REMOTO}.supabase.co`) {
    throw new Error(`El host remoto no coincide con ${REF_REMOTO}.`);
  }
  console.log(`MODO REMOTO AUTORIZADO: ${REF_REMOTO}`);
} else {
  exigirSupabaseLocal('Operación hoy/mañana');
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function uid(prefijo, n) {
  return `${prefijo}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function paso(texto) {
  console.log(`  · ${texto}`);
}

async function ejecutar(descripcion, consulta) {
  const { data, error } = await consulta;
  if (error) throw new Error(`${descripcion} → ${error.message}${error.details ? ` (${error.details})` : ''}`);
  return data;
}

async function insertar(tabla, filas) {
  return ejecutar(`INSERT ${tabla}`, db.from(tabla).insert(filas).select());
}

async function actualizar(tabla, cambios, filtro) {
  let consulta = db.from(tabla).update(cambios);
  for (const [columna, valor] of Object.entries(filtro)) consulta = consulta.eq(columna, valor);
  return ejecutar(`UPDATE ${tabla}`, consulta);
}

async function rpc(nombre, args) {
  const { data, error } = await db.rpc(nombre, args);
  if (error) throw new Error(`RPC ${nombre} → ${error.message}${error.details ? ` (${error.details})` : ''}`);
  return data;
}

async function revisionActual(revisionId) {
  const fila = await ejecutar('revision actual', db
    .from('propuesta_revisiones')
    .select('id,estado,actualizado_en')
    .eq('id', revisionId)
    .single());
  return fila;
}

const ZONA = 'America/Tijuana';
function fechaLocal(offsetDias = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + offsetDias * 86_400_000));
}
function instante(dias, hora, minuto = 0) {
  const hh = String(hora).padStart(2, '0');
  const mm = String(minuto).padStart(2, '0');
  return new Date(`${fechaLocal(dias)}T${hh}:${mm}:00-07:00`).toISOString();
}
function soloFecha(dias) {
  return fechaLocal(dias);
}

// ---------------------------------------------------------------------------
// Maestro existente (solo lectura)
// ---------------------------------------------------------------------------

async function cargarMaestro() {
  console.log('MAESTRO EXISTENTE');

  const clientes = await ejecutar('clientes', db
    .from('clientes')
    .select('id,folio,nombre_comercial,condiciones_pago,estado')
    .eq('estado', 'activo')
    .order('folio'));
  asegurar(clientes.length >= 5, 'Se necesitan al menos 5 clientes activos.');

  const catalogo = await ejecutar('catalogo_materiales', db
    .from('catalogo_materiales')
    .select('id,codigo,nombre,unidad_base,costo_vigente')
    .eq('activo', true)
    .order('orden'));
  asegurar(catalogo.length >= 6, 'Faltan materiales de catálogo.');

  const legado = await ejecutar('materiales', db
    .from('materiales')
    .select('id,codigo,unidad_control,costo_unitario_control,stock_actual_control')
    .order('codigo'));
  asegurar(legado.length >= 6, 'Faltan materiales legacy.');

  const procesos = await ejecutar('catalogo_procesos', db
    .from('catalogo_procesos')
    .select('id,codigo,nombre')
    .eq('activo', true)
    .order('orden'));
  asegurar(procesos.length >= 4, 'Faltan procesos de catálogo.');

  const recursos = await ejecutar('recursos_planeacion', db
    .from('recursos_planeacion')
    .select('id,codigo,nombre,grupo_equipo_id,area,costo_hora_interno')
    .eq('activo', true)
    .order('codigo'));
  asegurar(recursos.length >= 5, 'Faltan recursos de planeación.');

  const usuarios = await ejecutar('usuarios', db
    .from('usuarios')
    .select('id,email,rol,nombre_completo')
    .eq('activo', true));
  const porCorreo = Object.fromEntries(usuarios.map((u) => [u.email.toLowerCase(), u.id]));
  for (const correo of ['ales_2_@hotmail.com', 'ventas@ccmanufacturing.mx', 'gerencia@ccmanufacturing.mx', 'finanzas@ccmanufacturing.mx', 'jorge.ramirez@ccmanufacturing.mx', 'luis.torres@ccmanufacturing.mx', 'sergio.pena@ccmanufacturing.mx']) {
    asegurar(porCorreo[correo], `Falta el usuario ${correo}.`);
  }

  const cuentas = await ejecutar('cuentas_bancarias', db
    .from('cuentas_bancarias')
    .select('id,banco,moneda')
    .eq('activa', true)
    .order('creado_en'));
  asegurar(cuentas.length > 0, 'Faltan cuentas bancarias activas.');

  const espesores = await ejecutar('catalogo_espesores', db
    .from('catalogo_espesores')
    .select('id,material_id,etiqueta')
    .eq('activo', true));

  const maestro = { clientes, catalogo, legado, procesos, recursos, usuarios: porCorreo, cuentas, espesores };
  paso(`${clientes.length} clientes · ${catalogo.length} materiales · ${recursos.length} máquinas · ${usuarios.length} usuarios`);
  return maestro;
}

const porCodigo = (lista) => Object.fromEntries(lista.map((fila) => [fila.codigo, fila]));

// ---------------------------------------------------------------------------
// RFQ (pipeline) + ítems + operaciones
// ---------------------------------------------------------------------------

const RFQ = [
  {
    n: 1, clave: 'prospecto_epp', empresa: 'Electrodomésticos del Pacífico', contacto: 'Iván Cárdenas',
    etapa: 'prospecto', estado_rfq: 'NEW', cliente: 4, canal: 'CORREO', prioridad: 'normal',
    descripcion: 'Charolas y soportes para nueva línea de refrigeración.',
    items: [
      { codigo: 'EPP-CHA-101', descripcion: 'Charola portacables 40x12 cm', cantidad: 180, material: 'LAM-GALV-18', acabado: 'Galvanizado natural' },
      { codigo: 'EPP-SOP-102', descripcion: 'Soporte lateral plegado', cantidad: 90, material: 'LAM-CR-14', acabado: 'Pintura negra' },
    ],
    proxima: { codigo: 'FOLLOW_UP', texto: 'Llamar al comprador para confirmar alcance', dias: 1 },
  },
  {
    n: 2, clave: 'incompleto_transporte', empresa: 'Transportes y Plataformas Baja', contacto: 'Javier Ríos',
    etapa: 'prospecto', estado_rfq: 'INCOMPLETE', cliente: null, canal: 'WHATSAPP', prioridad: 'baja',
    descripcion: 'Plataforma de carga; falta plano y capacidad.',
    items: [],
    proxima: { codigo: 'REQUEST_MISSING_INFO', texto: 'Solicitar plano y peso de la plataforma', dias: 1 },
  },
  {
    n: 3, clave: 'contactado_dmt', empresa: 'Dispositivos Médicos Tijuana', contacto: 'Héctor Pineda',
    etapa: 'contactado', estado_rfq: 'READY_FOR_PROPOSAL', cliente: 6, canal: 'VISITA', prioridad: 'alta',
    descripcion: 'Gabinetes de acero inoxidable para equipo médico.',
    items: [
      { codigo: 'DMT-GAB-103', descripcion: 'Gabinete inoxidable 80x50x30 cm', cantidad: 24, material: 'LAM-INOX-16', acabado: 'Inoxidable sanitario' },
      { codigo: 'DMT-TAP-104', descripcion: 'Tapa maquinada con bisagras', cantidad: 24, material: 'LAM-INOX-16', acabado: 'Inoxidable sanitario' },
    ],
    proxima: { codigo: 'CONFIRM_SPECIFICATION', texto: 'Confirmar tolerancias y acabado sanitario', dias: 1 },
  },
  {
    n: 4, clave: 'cotizado_mab', empresa: 'Maquinados Aeroespaciales Baja', contacto: 'Diana Ochoa',
    etapa: 'cotizado', estado_rfq: 'READY_FOR_PROPOSAL', cliente: 1, canal: 'CORREO', prioridad: 'alta',
    descripcion: 'Soportes y placas maquinadas para ensamble aeroespacial.',
    items: [
      { codigo: 'MAB-SOP-105', descripcion: 'Soporte estructural 6061-T6', cantidad: 60, material: 'PLACA-A36-12', acabado: 'Anodizado externo' },
      { codigo: 'MAB-PLA-106', descripcion: 'Placa base maquinada', cantidad: 30, material: 'PLACA-A36-12', acabado: 'Natural' },
    ],
    proxima: { codigo: 'PREPARE_NEW_REVISION', texto: 'Preparar propuesta con doble turno de CNC', dias: 1 },
  },
  {
    n: 5, clave: 'negociacion_aet', empresa: 'Aceros y Estructuras Tijuana', contacto: 'Fernando Lozano',
    etapa: 'negociacion', estado_rfq: 'READY_FOR_PROPOSAL', cliente: 2, canal: 'TELEFONO', prioridad: 'urgente',
    descripcion: 'Marcos estructurales para andamio, entrega escalonada.',
    items: [
      { codigo: 'AET-MAR-107', descripcion: 'Marco estructural 2x1 m', cantidad: 150, material: 'PTR-2X2-11', acabado: 'Pintura electrostática' },
    ],
    proxima: { codigo: 'RESOLVE_CUSTOMER_QUESTIONS', texto: 'Cerrar descuento por volumen', dias: 1 },
  },
  {
    n: 6, clave: 'ganada_imn', empresa: 'Industrias Metálicas del Norte', contacto: 'Roberto Valdez',
    etapa: 'ganada', estado_rfq: 'READY_FOR_PROPOSAL', cliente: 0, canal: 'REFERIDO', prioridad: 'alta',
    descripcion: 'Tolvas y refuerzos para línea de alimentos.',
    items: [
      { codigo: 'IMN-TOL-108', descripcion: 'Tolva de recepción 1.2 m³', cantidad: 40, material: 'LAM-CR-14', acabado: 'Pintura alimenticia' },
      { codigo: 'IMN-REF-109', descripcion: 'Refuerzo lateral tolva', cantidad: 80, material: 'PTR-2X2-11', acabado: 'Natural' },
    ],
    proxima: { codigo: 'CONFIRM_RECEIPT', texto: 'Confirmar recepción de la orden', dias: 1 },
  },
  {
    n: 7, clave: 'perdida_epp', empresa: 'Electrodomésticos del Pacífico', contacto: 'Iván Cárdenas',
    etapa: 'perdida', estado_rfq: 'CANCELLED', cliente: 4, canal: 'CORREO', prioridad: 'baja',
    descripcion: 'Prototipo de caja de control.',
    motivo: 'Precio fuera de presupuesto; el cliente lo fabricará internamente.',
    items: [],
    proxima: null,
  },
  {
    n: 8, clave: 'prospecto_mib', empresa: 'Muebles Industriales Bravo', contacto: 'Sandra Bravo',
    etapa: 'prospecto', estado_rfq: 'NEW', cliente: 3, canal: 'WHATSAPP', prioridad: 'normal',
    descripcion: 'Estantería industrial para nuevo almacén.',
    items: [
      { codigo: 'MIB-EST-110', descripcion: 'Estante industrial 5 niveles', cantidad: 36, material: 'PTR-2X2-11', acabado: 'Pintura epóxica' },
    ],
    proxima: { codigo: 'WAIT_CUSTOMER_RESPONSE', texto: 'Esperar confirmación de medidas', dias: 1 },
  },
  {
    n: 9, clave: 'cotizado_ecm', empresa: 'Exhibidores Comerciales MX', contacto: 'Paola Gutiérrez',
    etapa: 'cotizado', estado_rfq: 'READY_FOR_PROPOSAL', cliente: 3, canal: 'CORREO', prioridad: 'normal',
    descripcion: 'Exhibidores de piso para temporada navideña.',
    items: [
      { codigo: 'ECM-EXH-111', descripcion: 'Exhibidor piso 4 niveles', cantidad: 60, material: 'TUBO-CUAD-1', acabado: 'Pintura electrostática' },
    ],
    proxima: { codigo: 'FOLLOW_UP', texto: 'Enviar propuesta y confirmar fecha de entrega', dias: 1 },
  },
];

const PROCESOS_POR_ITEM = {
  'EPP-CHA-101': ['LASER_FIBRA', 'DOB'],
  'EPP-SOP-102': ['LASER_FIBRA', 'DOB', 'ACABADO'],
  'DMT-GAB-103': ['LASER_FIBRA', 'DOB', 'SOLD', 'ACABADO'],
  'DMT-TAP-104': ['LASER_FIBRA', 'DOB'],
  'MAB-SOP-105': ['MAQUINADO', 'ACABADO'],
  'MAB-PLA-106': ['MAQUINADO'],
  'AET-MAR-107': ['LASER_FIBRA', 'SOLD', 'ACABADO'],
  'IMN-TOL-108': ['LASER_FIBRA', 'DOB', 'SOLD'],
  'IMN-REF-109': ['SOLD'],
  'MIB-EST-110': ['LASER_FIBRA', 'DOB', 'SOLD', 'ACABADO'],
  'ECM-EXH-111': ['LASER_FIBRA', 'DOB', 'SOLD', 'ACABADO'],
};

async function asegurarContactos(maestro) {
  const ventas = maestro.usuarios['ventas@ccmanufacturing.mx'];
  const existentes = await ejecutar('contactos', db
    .from('contactos_cliente')
    .select('id,cliente_id')
    .eq('activo', true));
  const porCliente = new Map(existentes.map((c) => [c.cliente_id, c.id]));
  const contactos = {};

  for (const rfq of RFQ) {
    if (rfq.cliente === null) continue;
    const cliente = maestro.clientes[rfq.cliente % maestro.clientes.length];
    if (porCliente.has(cliente.id)) {
      contactos[rfq.n] = porCliente.get(cliente.id);
      continue;
    }
    const id = uid('2661ab00', rfq.n);
    await insertar('contactos_cliente', [{
      id,
      cliente_id: cliente.id,
      nombre: rfq.contacto,
      puesto: 'Compras',
      correo: `${rfq.contacto.toLowerCase().split(' ')[0]}@${rfq.empresa.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14)}.mx`,
      telefono: `+52 664 ${100 + rfq.n} ${2000 + rfq.n * 13}`,
      es_principal: true,
      creado_por: ventas,
    }]);
    porCliente.set(cliente.id, id);
    contactos[rfq.n] = id;
  }
  return contactos;
}

async function sembrarRfq(maestro) {
  console.log('RFQ');
  const materiales = porCodigo(maestro.catalogo);
  const procesos = porCodigo(maestro.procesos);
  const ventas = maestro.usuarios['ventas@ccmanufacturing.mx'];
  const gerencia = maestro.usuarios['gerencia@ccmanufacturing.mx'];
  const contactos = await asegurarContactos(maestro);
  paso(`${Object.keys(contactos).length} contactos de cliente disponibles`);

  const filas = [];
  for (const [indice, rfq] of RFQ.entries()) {
    const cliente = rfq.cliente === null ? null : maestro.clientes[rfq.cliente % maestro.clientes.length];
    const creado = instante(0, 7 + indice, (indice * 7) % 60);
    const folioOp = await rpc('generar_folio_cnc');
    filas.push({
      id: uid('2661a000', rfq.n),
      folio_op: folioOp,
      etapa: rfq.etapa,
      estado_rfq: rfq.estado_rfq,
      empresa: rfq.empresa,
      nombre_contacto: rfq.contacto,
      correo: `${rfq.contacto.toLowerCase().split(' ')[0]}@${rfq.empresa.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14)}.mx`,
      telefono: `+52 664 ${100 + rfq.n} ${2000 + rfq.n * 13}`,
      cliente_id: cliente?.id ?? null,
      contacto_id: contactos[rfq.n] ?? null,
      vendedor_id: ventas,
      responsable_id: gerencia,
      moneda: rfq.n === 4 ? 'USD' : 'MXN',
      condiciones_pago: cliente?.condiciones_pago ?? 'contado',
      prioridad: rfq.prioridad,
      iva_porcentaje: 16,
      etiquetas: rfq.etapa === 'ganada' ? ['produccion'] : ['seguimiento'],
      motivo_perdida: rfq.motivo ?? null,
      notas_perdida: rfq.motivo ? 'Se conserva la oportunidad para reactivarla el próximo trimestre.' : null,
      fecha_solicitud: creado,
      fecha_ultimo_contacto: creado,
      fecha_requerida: soloFecha(rfq.etapa === 'prospecto' ? 5 : 3),
      fecha_envio_cotizacion: ['cotizado', 'negociacion', 'ganada'].includes(rfq.etapa) ? instante(0, 11, 30) : null,
      descripcion_general: rfq.descripcion,
      canal: rfq.canal,
      proxima_accion_codigo: rfq.proxima?.codigo ?? null,
      proxima_accion_texto: rfq.proxima?.texto ?? null,
      fecha_proxima_accion: rfq.proxima ? soloFecha(rfq.proxima.dias) : null,
      responsable_proxima_accion_id: rfq.proxima ? ventas : null,
      creado_en: creado,
      actualizado_en: creado,
    });
  }

  await insertar('pipeline', filas);
  paso(`${filas.length} RFQ creadas (prospecto, incompleta, cotizada, negociación, ganada y perdida)`);

  const items = [];
  const operaciones = [];
  for (const rfq of RFQ) {
    rfq.items.forEach((item, indice) => {
      const material = materiales[item.material];
      const id = uid('2661b000', rfq.n * 10 + indice + 1);
      items.push({
        id,
        rfq_id: uid('2661a000', rfq.n),
        numero: indice + 1,
        codigo: `IT${String(indice + 1).padStart(2, '0')}`,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        material_id: material?.id ?? null,
        espesor_id: maestro.espesores.find((e) => e.material_id === material?.id)?.id ?? null,
        acabado: item.acabado,
        notas: `Pieza ${item.codigo}. Requerimiento capturado en la solicitud del cliente.`,
        estado: 'activo',
        creado_en: instante(0, 8 + rfq.n, 15),
      });
      (PROCESOS_POR_ITEM[item.codigo] ?? []).forEach((codigoProceso, orden) => {
        if (!procesos[codigoProceso]) return;
        operaciones.push({ rfq_item_id: id, proceso_id: procesos[codigoProceso].id, orden: orden + 1 });
      });
    });
  }

  if (items.length > 0) {
    await insertar('rfq_items', items);
    await insertar('rfq_item_operaciones', operaciones);

    const archivosTecnicos = RFQ
      .filter((rfq) => rfq.items.length > 0)
      .map((rfq) => ({
        id: uid('2661ac00', rfq.n),
        entidad: 'rfq',
        entidad_id: uid('2661a000', rfq.n),
        tema_codigo: 'plano_cliente',
        clase: 'CAD',
        nombre_original: `PLANO-${rfq.items[0].codigo}.pdf`,
        nombre_erp: `rfq/${rfq.n}/plano.pdf`,
        bucket: 'rfq',
        ruta_storage: `rfq/${uid('2661a000', rfq.n)}/plano.pdf`,
        mime: 'application/pdf',
        tamano_bytes: 180000 + rfq.n * 1200,
        version: 1,
        vigente: true,
        subido_por: ventas,
        creado_en: instante(0, 8 + rfq.n, 45),
      }));
    await insertar('archivos', archivosTecnicos);
  }
  paso(`${items.length} ítems, ${operaciones.length} operaciones y ${RFQ.filter((r) => r.items.length > 0).length} planos técnicos`);

  for (const rfq of RFQ.filter((r) => r.items.length > 0)) {
    await rpc('registrar_version_rfq', {
      p_rfq_id: uid('2661a000', rfq.n),
      p_causa: 'CABECERA',
      p_actor_id: ventas,
      p_correlation_id: randomUUID(),
    });
  }
  paso(`${RFQ.filter((r) => r.items.length > 0).length} versiones congeladas del RFQ`);
}

// ---------------------------------------------------------------------------
// Propuestas (flujo real: crear_propuesta → validar → enviar → aceptar)
// ---------------------------------------------------------------------------

const PROPUESTAS = [
  {
    n: 1, rfq: 4, destino: 'DRAFT', factor: 2.4, hora: 10,
    costos: { material: 78000, maquina: 16000, mano_obra: 42000, gastos_directos: 12000, subcontratacion: 9000 },
  },
  {
    n: 2, rfq: 5, destino: 'SENT', factor: 2.2, hora: 13, canal: 'CORREO', destinoEnvio: 'contacto@aetijuana.mx',
    costos: { material: 145000, maquina: 24000, mano_obra: 62000, gastos_directos: 18000 },
  },
  {
    n: 3, rfq: 9, destino: 'SENT', factor: 2.3, hora: 15, canal: 'CORREO', destinoEnvio: 'proyectos@exhibidoresmx.com',
    costos: { material: 52000, maquina: 12000, mano_obra: 31000, gastos_directos: 7500 },
  },
  {
    n: 4, rfq: 3, destino: 'SENT', factor: 2.6, hora: 16, canal: 'VISITA', destinoEnvio: 'proyectos@dmtmedica.mx',
    costos: { material: 96000, maquina: 21000, mano_obra: 58000, gastos_directos: 15000, subcontratacion: 12000 },
  },
  {
    n: 5, rfq: 6, destino: 'SALE_CONFIRMED', factor: 2.35, hora: 9, canal: 'CORREO', destinoEnvio: 'compras@imnorte.mx',
    compromisoDias: 3,
    costos: { material: 118000, maquina: 26000, mano_obra: 64000, gastos_directos: 16000 },
  },
];

async function archivarPdf(revisionId, folioRevision, adminId) {
  const archivoId = randomUUID();
  const hash = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  await insertar('archivos', [{
    id: archivoId,
    entidad: 'propuesta_revision',
    entidad_id: revisionId,
    tema_codigo: 'propuesta_pdf',
    clase: 'PDF',
    nombre_original: `${folioRevision}.pdf`,
    nombre_erp: `${folioRevision}.pdf`,
    bucket: 'propuestas',
    ruta_storage: `propuestas/${revisionId}/${folioRevision}.pdf`,
    mime: 'application/pdf',
    tamano_bytes: 245760,
    hash_sha256: hash,
    version: 1,
    vigente: true,
    subido_por: adminId,
    creado_en: instante(0, 12, 0),
  }]);
  await insertar('propuesta_pdfs', [{
    revision_id: revisionId,
    archivo_id: archivoId,
    contenido_hash: hash,
    version: 1,
    vigente: true,
    generado_por: adminId,
  }]);
}

async function sembrarPropuestas(maestro) {
  console.log('PROPUESTAS');
  const admin = maestro.usuarios['ales_2_@hotmail.com'];
  const materiales = porCodigo(maestro.catalogo);

  for (const propuesta of PROPUESTAS) {
    const creada = await rpc('crear_propuesta', {
      p_rfq_id: uid('2661a000', propuesta.rfq),
      p_actor: admin,
      p_correlation_id: randomUUID(),
    });
    const { propuestaId, revisionId, propuestaFolio, revisionFolio } = creada;

    const items = await ejecutar('ítems de propuesta', db
      .from('propuesta_items')
      .select('id,material_id')
      .eq('revision_id', revisionId));

    for (const item of items) {
      const material = materiales[Object.keys(materiales).find((codigo) => materiales[codigo].id === item.material_id)];
      const precio = Math.round((material?.costo_vigente ?? 1000) * propuesta.factor);
      await actualizar('propuesta_items', { precio_unitario: precio }, { id: item.id });
    }

    const revisionDraft = await revisionActual(revisionId);
    await rpc('editar_costos_revision', {
      p_revision_id: revisionId,
      p_datos: {
        actualizado_en: revisionDraft.actualizado_en,
        costos: Object.entries(propuesta.costos)
          .filter(([, monto]) => monto > 0)
          .map(([categoria, monto]) => ({ categoria, monto })),
      },
      p_actor: admin,
      p_correlation_id: randomUUID(),
    });

    if (propuesta.destino === 'DRAFT') {
      paso(`${propuestaFolio} · RFQ #${propuesta.rfq} · DRAFT · ${items.length} ítem(s)`);
      continue;
    }

    let revision = await revisionActual(revisionId);
    await rpc('validar_revision', {
      p_revision_id: revisionId,
      p_datos: { actualizado_en: revision.actualizado_en },
      p_actor: admin,
      p_correlation_id: randomUUID(),
    });

    await archivarPdf(revisionId, revisionFolio, admin);

    await rpc('enviar_revision', {
      p_revision_id: revisionId,
      p_canal: propuesta.canal,
      p_destino: propuesta.destinoEnvio,
      p_actor: admin,
      p_correlation_id: randomUUID(),
    });

    if (propuesta.destino === 'SALE_CONFIRMED') {
      revision = await revisionActual(revisionId);
      await rpc('aceptar_revision', {
        p_revision_id: revisionId,
        p_datos: {
          actualizado_en: revision.actualizado_en,
          canal: propuesta.canal,
          destino: propuesta.destinoEnvio,
          fecha_compromiso_comercial: soloFecha(propuesta.compromisoDias ?? 3),
        },
        p_actor: admin,
        p_correlation_id: randomUUID(),
      });
      revision = await revisionActual(revisionId);
      await rpc('confirmar_venta', {
        p_revision_id: revisionId,
        p_actualizado_en: revision.actualizado_en,
        p_actor: admin,
        p_correlation_id: randomUUID(),
      });
    }

    paso(`${propuestaFolio} · RFQ #${propuesta.rfq} · ${propuesta.destino} · ${items.length} ítem(s)`);
    void propuestaId;
  }
}

// ---------------------------------------------------------------------------
// Órdenes, planeación y producción
// ---------------------------------------------------------------------------

const ORDENES = [
  {
    clave: 'borrador', cliente: 2, prioridad: 'normal', compromisoDias: 1, horaCompromiso: 14,
    partidas: [
      { codigo: 'ECM-BOR-201', descripcion: 'Base metálica para exhibidor', cantidad: 40, unidad: 'pieza', material: 'LAM-CR-14', minutos: 42, maquina: 'LASER-FIBRA-01' },
      { codigo: 'ECM-BOR-202', descripcion: 'Refuerzo posterior', cantidad: 80, unidad: 'pieza', material: 'LAM-GALV-18', minutos: 15, maquina: 'DOB-METAL-01' },
    ],
  },
  {
    clave: 'programada_hoy', cliente: 0, prioridad: 'alta', compromisoDias: 3, horaCompromiso: 17,
    partidas: [
      { codigo: 'IMN-PRG-203', descripcion: 'Gabinete metálico 60x40x25 cm', cantidad: 120, unidad: 'pieza', material: 'LAM-CR-14', minutos: 38, maquina: 'LASER-FIBRA-01' },
      { codigo: 'IMN-PRG-204', descripcion: 'Charola portacables 30x10 cm', cantidad: 240, unidad: 'pieza', material: 'LAM-GALV-18', minutos: 12, maquina: 'DOB-METAL-01' },
    ],
    programar: [
      { partida: 'IMN-PRG-203', recurso: 'LASER-FIBRA-01', dias: 0, turno: 'vespertino', horas: 5 },
      { partida: 'IMN-PRG-204', recurso: 'DOB-METAL-01', dias: 0, turno: 'vespertino', horas: 4 },
    ],
  },
  {
    clave: 'programada_manana', cliente: 2, prioridad: 'urgente', compromisoDias: 4, horaCompromiso: 12,
    partidas: [
      { codigo: 'AET-PRG-205', descripcion: 'Marco estructural para andamio 2x1 m', cantidad: 150, unidad: 'pieza', material: 'PTR-2X2-11', minutos: 22, maquina: 'SOLD-MIG-01' },
      { codigo: 'AET-PRG-206', descripcion: 'Placa de anclaje', cantidad: 150, unidad: 'pieza', material: 'PLACA-A36-12', minutos: 10, maquina: 'PINT-LINEA-01' },
    ],
    programar: [
      { partida: 'AET-PRG-205', recurso: 'SOLD-MIG-01', dias: 1, turno: 'matutino', horas: 6 },
      { partida: 'AET-PRG-206', recurso: 'PINT-LINEA-01', dias: 1, turno: 'matutino', horas: 3 },
    ],
  },
  {
    clave: 'preparacion', cliente: 3, prioridad: 'alta', compromisoDias: 2, horaCompromiso: 16,
    partidas: [
      { codigo: 'MIB-PRE-207', descripcion: 'Estante industrial 5 niveles', cantidad: 30, unidad: 'pieza', material: 'PTR-2X2-11', minutos: 70, maquina: 'CNC-HAAS-01' },
    ],
    preparar: { partida: 'MIB-PRE-207', recurso: 'CNC-HAAS-01', dias: 0, turno: 'vespertino', horas: 5, operador: 'luis.torres@ccmanufacturing.mx' },
  },
  {
    clave: 'en_proceso', cliente: 0, prioridad: 'urgente', compromisoDias: 2, horaCompromiso: 18,
    partidas: [
      { codigo: 'IMN-EPR-208', descripcion: 'Tolva de recepción 1.2 m³', cantidad: 120, unidad: 'pieza', material: 'LAM-CR-14', minutos: 3, maquina: 'LASER-FIBRA-01' },
      { codigo: 'IMN-EPR-209', descripcion: 'Refuerzo lateral tolva', cantidad: 80, unidad: 'pieza', material: 'PTR-2X2-11', minutos: 25, maquina: 'SOLD-MIG-01' },
    ],
    activa: { partida: 'IMN-EPR-208', recurso: 'LASER-FIBRA-01', dias: 0, turno: 'matutino', horas: 6, operador: 'jorge.ramirez@ccmanufacturing.mx', producido: 46, scrap: 2, consumo: 18.5 },
    pendiente: { partida: 'IMN-EPR-209', recurso: 'SOLD-MIG-01', dias: 1, turno: 'vespertino', horas: 4 },
  },
  {
    clave: 'pausada', cliente: 1, prioridad: 'normal', compromisoDias: 3, horaCompromiso: 15,
    partidas: [
      { codigo: 'MAB-PAU-210', descripcion: 'Soporte estructural aluminio 6061-T6', cantidad: 80, unidad: 'pieza', material: 'PLACA-A36-12', minutos: 45, maquina: 'CNC-HAAS-02' },
    ],
    pausa: { partida: 'MAB-PAU-210', recurso: 'CNC-HAAS-02', dias: 0, turno: 'matutino', horas: 6, operador: 'sergio.pena@ccmanufacturing.mx', producido: 12, motivo: 'MATERIAL', nota: 'Falta de placa A36; el proveedor entrega mañana 10:00.' },
  },
  {
    clave: 'completada_hoy', cliente: 2, prioridad: 'alta', compromisoDias: 0, horaCompromiso: 18,
    partidas: [
      { codigo: 'AET-COM-211', descripcion: 'Base metálica para bomba centrífuga', cantidad: 50, unidad: 'pieza', material: 'PLACA-A36-12', minutos: 52, maquina: 'SOLD-MIG-01' },
    ],
    completar: { recurso: 'SOLD-MIG-01', operador: 'luis.torres@ccmanufacturing.mx', inicioHora: 6, finHora: 11, consumo: 62 },
    entrega: { cantidad: 30, recibido: 'Almacén Aceros y Estructuras Tijuana' },
    ar: { monto: 186000, moneda: 'MXN', tc: 1, venceDias: 15, factura: 'FAC-1031' },
  },
  {
    clave: 'completada_ayer', cliente: 3, prioridad: 'normal', compromisoDias: -1, horaCompromiso: 16,
    partidas: [
      { codigo: 'MIB-COM-212', descripcion: 'Perchero exhibidor línea blanca', cantidad: 60, unidad: 'pieza', material: 'TUBO-CUAD-1', minutos: 26, maquina: 'DOB-METAL-01' },
    ],
    completar: { recurso: 'DOB-METAL-01', operador: 'jorge.ramirez@ccmanufacturing.mx', inicioHora: 7, finHora: 13, consumo: 38, dias: -1 },
    entrega: { cantidad: 60, recibido: 'Recepción Muebles Industriales Bravo' },
    ar: { monto: 98000, moneda: 'MXN', tc: 1, venceDias: 30, factura: 'FAC-1027' },
    pago: { monto: 98000, cuentaBanco: 'BBVA', referencia: 'SPEI-1027' },
  },
  {
    clave: 'cancelada', cliente: 4, prioridad: 'baja', compromisoDias: 6, horaCompromiso: 12,
    partidas: [
      { codigo: 'EPP-CAN-213', descripcion: 'Caja de control prototipo', cantidad: 15, unidad: 'pieza', material: 'LAM-GALV-18', minutos: 30, maquina: 'LASER-FIBRA-01' },
    ],
    motivoCancelacion: 'El cliente canceló el prototipo por cambio de diseño.',
  },
];

function partidaJson(partida, maestro) {
  const legado = maestro.legado.find((m) => m.codigo === partida.material);
  return {
    codigo_pieza: partida.codigo,
    descripcion: partida.descripcion,
    cantidad_solicitada: partida.cantidad,
    unidad_medida: partida.unidad,
    material_id: legado?.id ?? null,
    tiempo_estimado_minutos: partida.minutos,
    maquina_asignada: partida.maquina,
  };
}

function recursosPorCodigo(maestro) {
  return Object.fromEntries(maestro.recursos.map((r) => [r.codigo, r]));
}

async function crearOrdenEspecificacion(especificacion, maestro) {
  const cliente = maestro.clientes[especificacion.cliente % maestro.clientes.length];
  const [creada] = await rpc('crear_orden_manual', {
    p_cliente_id: cliente.id,
    p_fecha_compromiso: instante(especificacion.compromisoDias, especificacion.horaCompromiso),
    p_prioridad: especificacion.prioridad,
    p_partidas: especificacion.partidas.map((p) => partidaJson(p, maestro)),
  });
  const partidas = await ejecutar('partidas de la orden', db
    .from('partidas_orden_produccion')
    .select('id,codigo_pieza,cantidad_solicitada,catalogo_material_id,material_id')
    .eq('orden_id', creada.id));
  return { ...creada, partidas };
}

async function marcarProgramada(orden) {
  await rpc('cambiar_estado_orden', {
    p_orden_id: orden.id,
    p_estado_actual: 'borrador',
    p_estado_nuevo: 'programada',
  });
}

async function programar(orden, partida, plan, maestro, actorId) {
  const recurso = recursosPorCodigo(maestro)[plan.recurso];
  asegurar(recurso, `Recurso ${plan.recurso} inexistente.`);
  const [programacion] = await rpc('programar_partida_recurso_auditada', {
    p_orden_id: orden.id,
    p_partida_id: partida.id,
    p_recurso_id: recurso.id,
    p_secuencia: 1,
    p_fecha_programada: soloFecha(plan.dias),
    p_turno: plan.turno,
    p_horas_estimadas: plan.horas,
    p_orden_prioridad: 2,
    p_actor_id: actorId,
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

async function stockDisponible(materialId) {
  const fila = await ejecutar('stock material', db
    .from('materiales')
    .select('stock_actual_control')
    .eq('id', materialId)
    .single());
  return Number(fila?.stock_actual_control ?? 0);
}

async function sembrarOrdenes(maestro) {
  console.log('ÓRDENES Y PRODUCCIÓN');
  const creadas = {};
  const actor = maestro.usuarios['gerencia@ccmanufacturing.mx'];
  const admin = maestro.usuarios['ales_2_@hotmail.com'];

  for (const especificacion of ORDENES) {
    const orden = await crearOrdenEspecificacion(especificacion, maestro);
    creadas[especificacion.clave] = orden;
    paso(`${orden.folio} · ${especificacion.clave} · ${orden.partidas.length} partida(s)`);
  }

  const buscarPartida = (orden, codigo) => {
    const partida = orden.partidas.find((p) => p.codigo_pieza === codigo);
    asegurar(partida, `Partida ${codigo} no encontrada en ${orden.folio}.`);
    return partida;
  };

  // Planeación de hoy y mañana.
  for (const clave of ['programada_hoy', 'programada_manana']) {
    const especificacion = ORDENES.find((o) => o.clave === clave);
    const orden = creadas[clave];
    await marcarProgramada(orden);
    for (const plan of especificacion.programar) {
      await programar(orden, buscarPartida(orden, plan.partida), plan, maestro, actor);
    }
  }
  paso('Planeación de hoy y mañana distribuida en 4 máquinas');

  // En preparación: lista para que el operador arranque.
  {
    const especificacion = ORDENES.find((o) => o.clave === 'preparacion');
    const orden = creadas.preparacion;
    await marcarProgramada(orden);
    const partida = buscarPartida(orden, especificacion.preparar.partida);
    const programacion = await programar(orden, partida, especificacion.preparar, maestro, actor);
    await activarPreparacion(programacion);
    await rpc('asignar_operador_a_partida_op', {
      p_partida_id: partida.id,
      p_operador_id: maestro.usuarios[especificacion.preparar.operador],
    });
  }
  paso('OP en preparación con operador asignado para hoy');

  // En proceso con sesión viva.
  {
    const especificacion = ORDENES.find((o) => o.clave === 'en_proceso');
    const orden = creadas.en_proceso;
    const plan = especificacion.activa;
    const partida = buscarPartida(orden, plan.partida);
    await marcarProgramada(orden);

    const programacion = await programar(orden, partida, plan, maestro, actor);
    await programar(orden, buscarPartida(orden, especificacion.pendiente.partida), especificacion.pendiente, maestro, actor);
    await activarPreparacion(programacion);
    await rpc('asignar_operador_a_partida_op', { p_partida_id: partida.id, p_operador_id: maestro.usuarios[plan.operador] });
    await rpc('iniciar_sesion_trabajo_operador', {
      p_orden_id: orden.id,
      p_partida_id: partida.id,
      p_programacion_id: programacion.id,
      p_operador_id: maestro.usuarios[plan.operador],
      p_verificacion: { material: true, espesor: true, cantidad: true, archivo: true, proceso_equipo: true, observaciones: 'Material y plano verificados al arranque de turno.' },
    });
    await rpc('registrar_avance_partida_op', {
      p_partida_id: partida.id,
      p_operador_id: maestro.usuarios[plan.operador],
      p_cantidad_producida: plan.producido,
      p_cantidad_scrap: plan.scrap,
    });
    const stockActivo = await stockDisponible(partida.material_id);
    const consumoActivo = Math.min(plan.consumo, stockActivo);
    if (consumoActivo > 0) {
      await rpc('registrar_consumo_material_op', {
        p_partida_id: partida.id,
        p_material_id: partida.catalogo_material_id,
        p_cantidad_usada: consumoActivo,
        p_cantidad_scrap: 0.6,
        p_actor_id: admin,
      });
    }
  }
  paso('OP en proceso con sesión viva, avance y consumo');

  // Pausada con motivo.
  {
    const especificacion = ORDENES.find((o) => o.clave === 'pausada');
    const orden = creadas.pausada;
    const plan = especificacion.pausa;
    const partida = buscarPartida(orden, plan.partida);
    await marcarProgramada(orden);
    const programacion = await programar(orden, partida, plan, maestro, actor);
    await activarPreparacion(programacion);
    await rpc('asignar_operador_a_partida_op', { p_partida_id: partida.id, p_operador_id: maestro.usuarios[plan.operador] });
    const [sesion] = await rpc('iniciar_sesion_trabajo_operador', {
      p_orden_id: orden.id,
      p_partida_id: partida.id,
      p_programacion_id: programacion.id,
      p_operador_id: maestro.usuarios[plan.operador],
      p_verificacion: { material: true, espesor: true, cantidad: true, archivo: true, proceso_equipo: true, observaciones: 'Arranque de turno con material parcial.' },
    });
    await rpc('cerrar_sesion_trabajo_operador', {
      p_sesion_id: sesion.id,
      p_operador_id: maestro.usuarios[plan.operador],
      p_piezas_producidas: plan.producido,
      p_estado_destino: 'pausada',
      p_motivo_pausa: plan.motivo,
      p_notas: plan.nota,
    });
    await actualizar('ordenes_produccion', { estado: 'pausada' }, { id: orden.id });
  }
  paso('OP pausada hoy con motivo de material');

  // Órdenes terminadas (histórico inmediato: hoy y ayer).
  for (const clave of ['completada_hoy', 'completada_ayer']) {
    const especificacion = ORDENES.find((o) => o.clave === clave);
    const orden = creadas[clave];
    const plan = especificacion.completar;
    const dias = plan.dias ?? 0;
    const partida = orden.partidas[0];
    const inicio = instante(dias, plan.inicioHora);
    const fin = instante(dias, plan.finHora);
    const horas = plan.finHora - plan.inicioHora;
    const programacionId = uid('2661e000', clave === 'completada_hoy' ? 1 : 2);

    await insertar('programacion_areas', [{
      id: programacionId,
      orden_id: orden.id,
      partida_id: partida.id,
      recurso_id: recursosPorCodigo(maestro)[plan.recurso].id,
      secuencia: 1,
      estado_planeacion: 'completada',
      fecha_programada: soloFecha(dias),
      turno: 'matutino',
      horas_estimadas: horas,
      orden_prioridad: 1,
    }]);

    const sesionId = uid('2661f000', clave === 'completada_hoy' ? 1 : 2);
    await insertar('sesiones_trabajo', [{
      id: sesionId,
      orden_id: orden.id,
      partida_id: partida.id,
      programacion_id: programacionId,
      operador_id: maestro.usuarios[plan.operador],
      fecha_inicio: inicio,
      fecha_fin: fin,
      horas_brutas: horas + 0.5,
      horas_netas: horas,
      piezas_producidas: partida.cantidad_solicitada,
      estado_sesion: 'finalizada',
      notas: 'Lote terminado conforme a especificación.',
    }]);

    await insertar('registros_tiempo_operador', [
      { partida_id: partida.id, operador_id: maestro.usuarios[plan.operador], accion: 'inicio', fecha_registro: inicio, notas: 'Inicio de turno' },
      { partida_id: partida.id, operador_id: maestro.usuarios[plan.operador], accion: 'fin', fecha_registro: fin, notas: 'Fin de lote' },
    ]);

    await insertar('registros_avance_partida', [{
      partida_id: partida.id,
      operador_id: maestro.usuarios[plan.operador],
      cantidad_producida: partida.cantidad_solicitada,
      cantidad_scrap: 1,
      sesion_trabajo_id: sesionId,
    }]);

    await actualizar('partidas_orden_produccion', {
      cantidad_producida: partida.cantidad_solicitada,
      cantidad_scrap: 1,
      tiempo_real_minutos: horas * 60,
      operador_asignado_id: maestro.usuarios[plan.operador],
    }, { id: partida.id });

    const legado = maestro.legado.find((m) => m.codigo === especificacion.partidas[0].material);
    const stock = await stockDisponible(legado.id);
    const consumo = Math.min(plan.consumo, stock);
    if (consumo > 0) {
      await rpc('registrar_movimiento_inventario', {
        p_material_id: legado.id,
        p_tipo: 'salida_produccion',
        p_prefijo_folio: 'SAL',
        p_cantidad_control: consumo,
        p_costo_unitario_momento: Number((legado.costo_unitario_control ?? 0).toFixed(4)),
        p_orden_id: orden.id,
        p_referencia_externa: `CONSUMO-${orden.folio}`,
        p_notas: `Consumo real de ${partida.codigo_pieza}`,
      });
    }
    await insertar('registros_consumo_material', [{
      partida_id: partida.id,
      material_id: legado.id,
      catalogo_material_id: partida.catalogo_material_id,
      cantidad_usada: consumo,
      cantidad_scrap: 0,
      costo_unitario_momento: Number((legado.costo_unitario_control ?? 0).toFixed(4)),
      actor_id: admin,
    }]);

    await actualizar('ordenes_produccion', {
      estado: 'completada',
      fecha_inicio: inicio,
      fecha_fin: fin,
    }, { id: orden.id });

    const [nota] = await rpc('generar_nota_entrega', {
      p_orden_id: orden.id,
      p_recibido_por: especificacion.entrega.recibido,
      p_firma_cliente_url: '',
      p_creado_por: admin,
      p_partidas: [{ partida_id: partida.id, cantidad_entregada: especificacion.entrega.cantidad }],
    });
    creadas[clave].nota = nota;
  }
  paso('2 OP completadas (hoy y ayer) con sesión, consumo y nota de entrega');

  // Cancelada con motivo.
  {
    const orden = creadas.cancelada;
    await rpc('cambiar_estado_orden', {
      p_orden_id: orden.id,
      p_estado_actual: 'borrador',
      p_estado_nuevo: 'cancelada',
      p_motivo_cancelacion: ORDENES.find((o) => o.clave === 'cancelada').motivoCancelacion,
    });
  }
  paso('1 OP cancelada con motivo');

  return creadas;
}

// ---------------------------------------------------------------------------
// Compras, gastos y cobranza
// ---------------------------------------------------------------------------

async function sembrarComprasYGastos(maestro, creadas) {
  console.log('COMPRAS Y GASTOS');
  const finanzas = maestro.usuarios['finanzas@ccmanufacturing.mx'];
  const materiales = porCodigo(maestro.catalogo);
  const proveedor = (await ejecutar('proveedores', db.from('proveedores').select('id,nombre_comercial').order('creado_en')))[0];

  const compraMaterial = await rpc('crear_compra', {
    p_proveedor_id: proveedor.id,
    p_orden_id: creadas.en_proceso.id,
    p_monto_subtotal: 86500,
    p_monto_iva: 13840,
    p_moneda: 'MXN',
    p_tipo_cambio: 1,
    p_fecha_vencimiento: soloFecha(12),
    p_notas: 'Lámina rolada en frío para la OP en proceso.',
    p_actor_id: finanzas,
    p_correlation_id: randomUUID(),
    p_rubro_costo: 'material',
    p_concepto: 'Lámina CR calibre 14',
    p_material_id: materiales['LAM-CR-14'].id,
    p_cantidad: 80,
    p_unidad: 'hoja',
    p_costo_unitario: 1081.25,
  });
  const [compraConfirmada] = await rpc('cambiar_estado_compra', {
    p_compra_id: compraMaterial[0].id,
    p_actualizado_en_esperado: compraMaterial[0].actualizado_en,
    p_estado_destino: 'CONFIRMADA',
    p_motivo: 'Orden de compra confirmada con el proveedor.',
    p_actor_id: finanzas,
    p_correlation_id: randomUUID(),
  });
  await rpc('cambiar_estado_compra', {
    p_compra_id: compraConfirmada.id,
    p_actualizado_en_esperado: compraConfirmada.actualizado_en,
    p_estado_destino: 'RECIBIDA',
    p_motivo: 'Material recibido en almacén y verificado contra orden.',
    p_actor_id: finanzas,
    p_correlation_id: randomUUID(),
  });
  paso(`Compra ${compraMaterial[0].folio_sii ?? compraMaterial[0].folio ?? '—'} recibida hoy`);

  const compraSubcontrato = await rpc('crear_compra', {
    p_proveedor_id: proveedor.id,
    p_orden_id: creadas.pausada.id,
    p_monto_subtotal: 24000,
    p_monto_iva: 3840,
    p_moneda: 'MXN',
    p_tipo_cambio: 1,
    p_fecha_vencimiento: soloFecha(20),
    p_notas: 'Tratamiento térmico de soportes; se libera hasta completar el lote.',
    p_actor_id: finanzas,
    p_correlation_id: randomUUID(),
    p_rubro_costo: 'subcontratacion',
    p_concepto: 'Tratamiento térmico de 80 soportes',
    p_material_id: null,
    p_cantidad: null,
    p_unidad: null,
    p_costo_unitario: null,
  });
  await rpc('cambiar_estado_compra', {
    p_compra_id: compraSubcontrato[0].id,
    p_actualizado_en_esperado: compraSubcontrato[0].actualizado_en,
    p_estado_destino: 'CONFIRMADA',
    p_motivo: 'Confirmada con el proveedor para mañana.',
    p_actor_id: finanzas,
    p_correlation_id: randomUUID(),
  });
  paso('1 compra de subcontratación confirmada para mañana');

  const gastos = [
    { categoria: 'consumibles', descripcion: 'Discos de corte y desbaste para el turno', subtotal: 3860, dias: 0, estado: 'pagado', metodo: 'tarjeta', comprobante: 'TKT-2510', proveedor: proveedor.id, orden: null },
    { categoria: 'logistica', descripcion: 'Flete local de entrega parcial AET', subtotal: 2900, dias: 0, estado: 'pendiente', metodo: null, comprobante: 'REC-FL-2510', proveedor: null, orden: 'completada_hoy' },
    { categoria: 'mantenimiento', descripcion: 'Revisión preventiva del centro Haas VF-4', subtotal: 7800, dias: -1, estado: 'pendiente', metodo: null, comprobante: 'SRV-2510', proveedor: null, orden: null },
  ];
  for (const gasto of gastos) {
    const iva = Number((gasto.subtotal * 0.16).toFixed(2));
    const [registrado] = await rpc('registrar_gasto', {
      p_orden_id: gasto.orden ? creadas[gasto.orden].id : null,
      p_proveedor_id: gasto.proveedor,
      p_categoria: gasto.categoria,
      p_descripcion: gasto.descripcion,
      p_monto_subtotal: gasto.subtotal,
      p_monto_iva: iva,
      p_monto_total: Number((gasto.subtotal + iva).toFixed(2)),
      p_moneda: 'MXN',
      p_tipo_cambio: 1,
      p_fecha_gasto: instante(gasto.dias, 12, 0),
      p_fecha_vencimiento: soloFecha(8),
      p_comprobante_url: null,
      p_folio_comprobante: gasto.comprobante,
      p_metodo_pago: gasto.metodo,
      p_datos_ocr_json: null,
      p_notas: null,
      p_creado_por: finanzas,
      p_cuenta_bancaria_id: null,
    });
    if (gasto.estado === 'pagado') {
      await rpc('cambiar_estado_gasto', {
        p_gasto_id: registrado.id,
        p_nuevo_estado: 'pagado',
        p_usuario_id: finanzas,
        p_estado_esperado: 'pendiente',
      });
    }
    paso(`Gasto ${registrado.folio} · ${gasto.categoria} · ${gasto.estado}`);
  }
}

async function sembrarCobranza(maestro, creadas) {
  console.log('COBRANZA');
  const finanzas = maestro.usuarios['finanzas@ccmanufacturing.mx'];

  for (const clave of ['completada_hoy', 'completada_ayer']) {
    const especificacion = ORDENES.find((o) => o.clave === clave);
    const orden = creadas[clave];
    const ar = especificacion.ar;
    const [cuenta] = await rpc('abrir_cuenta_por_cobrar', {
      p_orden_id: orden.id,
      p_monto_total: ar.monto,
      p_moneda: ar.moneda,
      p_tipo_cambio_origen: ar.tc,
      p_fecha_vencimiento: instante(ar.venceDias, 12, 0),
      p_folio_factura_remision: ar.factura,
    });
    creadas[clave].ar = cuenta;
    paso(`CxC ${ar.factura} · $${ar.monto.toLocaleString('es-MX')} · vence en ${ar.venceDias} días`);
  }

  const pago = ORDENES.find((o) => o.clave === 'completada_ayer').pago;
  const cuentaBanco = maestro.cuentas.find((c) => c.banco.includes(pago.cuentaBanco) && c.moneda === 'MXN') ?? maestro.cuentas[0];
  const resultado = await rpc('registrar_pago_ar_atomico', {
    p_ar_id: creadas.completada_ayer.ar.id,
    p_monto_pagado: pago.monto,
    p_moneda_pago: 'MXN',
    p_tipo_cambio_pago: 1,
    p_metodo_pago: 'transferencia',
    p_referencia: pago.referencia,
    p_usuario_id: finanzas,
    p_solicitud_id: randomUUID(),
    p_notas: 'Pago recibido completo de Muebles Industriales Bravo.',
    p_cuenta_bancaria_id: cuentaBanco.id,
  });
  paso(`Pago aplicado · recibo ${resultado?.[0]?.folio_recibo ?? '—'}`);

  await rpc('crear_promesa_pago', {
    p_cuenta_id: creadas.completada_hoy.ar.id,
    p_fecha_prometida: soloFecha(6),
    p_monto: 186000,
    p_actor_id: finanzas,
    p_correlation_id: randomUUID(),
  });
  paso('Promesa de pago de AET para la próxima semana');
}

// ---------------------------------------------------------------------------
// Comentarios, notificaciones y meta
// ---------------------------------------------------------------------------

async function sembrarSocial(maestro, creadas) {
  console.log('COMENTARIOS Y METAS');
  const ventas = maestro.usuarios['ventas@ccmanufacturing.mx'];
  const gerencia = maestro.usuarios['gerencia@ccmanufacturing.mx'];
  const jorge = maestro.usuarios['jorge.ramirez@ccmanufacturing.mx'];

  await insertar('comentarios_registro', [
    { entidad_tipo: 'orden', entidad_id: creadas.en_proceso.id, autor_id: ventas, contenido: 'El cliente confirmó que la tolva se entrega sin pintura. @Jorge Ramírez Ortega avísame al terminar el lote de hoy.', menciones_json: [jorge] },
    { entidad_tipo: 'orden', entidad_id: creadas.pausada.id, autor_id: gerencia, contenido: 'La placa A36 llega mañana a las 10:00. @Sergio Peña Domínguez retoma el centro Haas en cuanto esté descargada.', menciones_json: [] },
    { entidad_tipo: 'orden', entidad_id: creadas.completada_hoy.id, autor_id: ventas, contenido: 'Entrega parcial de 30 bases; el resto sale mañana por la tarde.', menciones_json: [] },
  ]);

  await insertar('notificaciones_usuario', [
    { usuario_id: ventas, emisor_id: gerencia, tipo: 'estado_orden', titulo: 'Planeación de mañana lista', mensaje: 'AET queda programada mañana en soldadura y pintura.', enlace: '/ordenes', leida: false },
    { usuario_id: gerencia, emisor_id: null, tipo: 'alerta_sistema', titulo: 'Máquina pausada por material', mensaje: 'Centro Haas VF-4 pausado: falta placa A36 hasta mañana.', enlace: '/ordenes', leida: false },
    { usuario_id: ventas, emisor_id: null, tipo: 'alerta_sistema', titulo: 'CxC con promesa de pago', mensaje: 'AET prometió pagar la factura FAC-1031 la próxima semana.', enlace: '/clientes', leida: false },
  ]);

  const primeroDelMes = `${fechaLocal().slice(0, 7)}-01`;
  await insertar('metas_vendedor', [{
    vendedor_id: ventas,
    mes: primeroDelMes,
    meta_mensual_mxn: 1250000,
    porcentaje_comision: 2.5,
  }]);
  paso('3 comentarios, 3 notificaciones y meta mensual');
}

// ---------------------------------------------------------------------------
// Verificación
// ---------------------------------------------------------------------------

async function contar(tabla) {
  const { count, error } = await db.from(tabla).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`COUNT ${tabla} → ${error.message}`);
  return count ?? 0;
}

async function verificar() {
  console.log('VERIFICACIÓN');
  const esperado = {
    pipeline: 9,
    rfq_items: 10,
    propuestas: 5,
    ordenes_produccion: 9,
    programacion_areas: 8,
    sesiones_trabajo: 4,
    cuentas_por_cobrar: 2,
    compras: 2,
    gastos: 3,
  };
  let fallos = 0;
  for (const [tabla, minimo] of Object.entries(esperado)) {
    const n = await contar(tabla);
    const ok = n >= minimo;
    if (!ok) fallos += 1;
    console.log(`  ${ok ? 'OK  ' : 'FALTA'} ${tabla}: ${n} (esperado >= ${minimo})`);
  }

  const maestro = {
    clientes: await contar('clientes'),
    materiales: await contar('materiales'),
    catalogo_materiales: await contar('catalogo_materiales'),
    catalogo_espesores: await contar('catalogo_espesores'),
    proveedores: await contar('proveedores'),
    recursos_planeacion: await contar('recursos_planeacion'),
    usuarios: await contar('usuarios'),
  };
  console.log('  Maestro conservado:', JSON.stringify(maestro));

  if (fallos > 0) throw new Error(`Verificación con ${fallos} tabla(s) por debajo de lo esperado.`);
  console.log('Verificación correcta.');
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

async function principal() {
  if (MODO === 'verificar') {
    await verificar();
    return;
  }

  const maestro = await cargarMaestro();
  await sembrarRfq(maestro);
  await sembrarPropuestas(maestro);
  const creadas = await sembrarOrdenes(maestro);
  await sembrarComprasYGastos(maestro, creadas);
  await sembrarCobranza(maestro, creadas);
  await sembrarSocial(maestro, creadas);
  console.log('\nOperación de hoy y mañana sembrada.');
  await verificar();
}

principal().catch((error) => {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
});
