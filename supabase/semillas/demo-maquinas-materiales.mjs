#!/usr/bin/env node
/**
 * Demo de máquinas, tarifas y espesores.
 *
 * Completa las máquinas ya configuradas con tarifa por uso (estación/grupo/
 * recurso), agrega espesores al catálogo de materiales y los asigna a los
 * ítems de RFQ/Propuesta existentes. Local por defecto; remoto solo con
 * `DEMO_DESTINO=remoto` + `CONFIRMAR_DEMO_REMOTO=<ref>`.
 */

import { createClient } from '@supabase/supabase-js';
import { cargarEntornoLocal, exigirSupabaseLocal } from './guardia-supabase-local.mjs';

cargarEntornoLocal();

function requerir(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre}`);
  return valor;
}

if (process.env.CONFIRMAR_DEMO !== 'si') {
  throw new Error('Define CONFIRMAR_DEMO=si para sembrar la demo de máquinas.');
}
if (process.env.DEMO_DESTINO === 'remoto') {
  const ref = 'pwnecbcynnqnvfwmvrnn';
  if (process.env.CONFIRMAR_DEMO_REMOTO !== ref) {
    throw new Error(`Define CONFIRMAR_DEMO_REMOTO=${ref} para el proyecto remoto.`);
  }
  if (new URL(requerir('NEXT_PUBLIC_SUPABASE_URL')).hostname !== `${ref}.supabase.co`) {
    throw new Error(`El host remoto no coincide con ${ref}.`);
  }
  console.log(`MODO REMOTO AUTORIZADO: ${ref}`);
} else {
  exigirSupabaseLocal('Demo máquinas/tarifas/espesores');
}

const db = createClient(
  requerir('NEXT_PUBLIC_SUPABASE_URL'),
  requerir('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function paso(texto) {
  console.log(`  · ${texto}`);
}

const ESTACIONES = {
  laser: {
    maquinaHora: 950,
    preparacionHora: 480,
    consumoGasHora: 1.2,
    gas: { O2: 9, N2: 28, aire: 2.5 },
    segundosPerforacion: {
      'Acero al carbono': { hasta3Mm: 1.2, hasta6Mm: 2, mayor6Mm: 3.5 },
      'Acero inoxidable': { hasta3Mm: 1.5, hasta6Mm: 2.6, mayor6Mm: 4.4 },
      Aluminio: { hasta3Mm: 0.9, hasta6Mm: 1.6, mayor6Mm: 2.8 },
      Otro: { hasta3Mm: 1.2, hasta6Mm: 2.2, mayor6Mm: 3.8 },
    },
  },
  router: { maquinaHora: 800, preparacionHora: 420, endmill: 140, ballnose: 175 },
  doblado: {
    maquinaHora: 700,
    preparacionHora: 430,
    segundoOperarioHora: 340,
    longitudMaximaMm: 3000,
    factorLongitudMaxima: 0.4,
    piezasHora: { simple: 60, media: 40, compleja: 20 },
  },
  fabricacion: {
    manoObraHora: 400,
    soldaduraHora: 520,
    consumiblesHora: 90,
    acabadoHora: 360,
  },
};

const GRUPOS = {
  CNC_ROUTER: 800,
  LASER_FIBRA: 950,
  PRESS_BRAKE: 700,
  SOLDADURA: 520,
  MAQUINADO: 650,
};

const RECURSOS = {
  'CNC-HAAS-01': { grupo: 'MAQUINADO', tarifa: 650 },
  'CNC-HAAS-02': { grupo: 'MAQUINADO', tarifa: 620 },
  'DOB-METAL-01': { grupo: 'PRESS_BRAKE', tarifa: 700 },
  'LASER-FIBRA-01': { grupo: 'LASER_FIBRA', tarifa: 950 },
  'PINT-LINEA-01': { grupo: null, tarifa: 460 },
  'SOLD-MIG-01': { grupo: 'SOLDADURA', tarifa: 520 },
};

const ESPESORES = {
  'LAM-CR-14': [1.5, 2, 3],
  'LAM-INOX-16': [1.5, 2, 3],
  'LAM-GALV-18': [1.5, 2, 3],
  'PTR-2X2-11': [2, 3, 4],
  'TUBO-CUAD-1': [1.5, 2],
  'PLACA-A36-12': [6, 9, 12],
};

async function actualizarTarifas() {
  const { data, error } = await db
    .from('configuracion_sistema')
    .select('tarifas_json')
    .eq('id', 'main')
    .single();
  if (error) throw error;
  const actual = data?.tarifas_json ?? {};
  const { error: errorUpdate } = await db
    .from('configuracion_sistema')
    .update({ tarifas_json: { ...actual, estaciones: ESTACIONES } })
    .eq('id', 'main');
  if (errorUpdate) throw errorUpdate;
  paso('Tarifas de estación configuradas (láser, router, doblado, fabricación)');
}

async function actualizarGrupos() {
  const { data: grupos, error } = await db.from('grupos_equipo').select('id,codigo');
  if (error) throw error;
  for (const grupo of grupos ?? []) {
    const tarifa = GRUPOS[grupo.codigo];
    if (tarifa === undefined) continue;
    const { error: errorUpdate } = await db
      .from('grupos_equipo')
      .update({ tarifa_hora: tarifa, tarifa_moneda: 'MXN' })
      .eq('id', grupo.id);
    if (errorUpdate) throw errorUpdate;
  }
  paso(`${Object.keys(GRUPOS).length} grupos con tarifa por hora`);
  return new Map((grupos ?? []).map((grupo) => [grupo.codigo, grupo.id]));
}

async function actualizarRecursos(gruposPorCodigo) {
  const { data: recursos, error } = await db
    .from('recursos_planeacion')
    .select('id,codigo')
    .order('codigo');
  if (error) throw error;
  let actualizados = 0;
  for (const recurso of recursos ?? []) {
    const config = RECURSOS[recurso.codigo];
    if (!config) continue;
    const { error: errorUpdate } = await db.from('recursos_planeacion').update({
      grupo_equipo_id: config.grupo ? gruposPorCodigo.get(config.grupo) ?? null : null,
      tarifa_override_activa: true,
      tarifa_override_hora: config.tarifa,
      tarifa_override_moneda: 'MXN',
    }).eq('id', recurso.id);
    if (errorUpdate) throw errorUpdate;
    actualizados += 1;
  }
  paso(`${actualizados} máquinas con tarifa por uso`);
}

async function sembrarEspesores() {
  const { data: materiales, error } = await db
    .from('catalogo_materiales').select('id,codigo').order('orden');
  if (error) throw error;
  const porCodigo = new Map((materiales ?? []).map((m) => [m.codigo, m.id]));
  const filas = [];
  for (const [codigo, medidas] of Object.entries(ESPESORES)) {
    const materialId = porCodigo.get(codigo);
    if (!materialId) continue;
    for (const [indice, mm] of medidas.entries()) {
      filas.push({
        material_id: materialId,
        etiqueta: `${mm.toFixed(1)} mm`,
        espesor_mm: mm,
        activo: true,
        orden: indice + 1,
      });
    }
  }
  if (filas.length > 0) {
    const { error: errorInsert } = await db
      .from('catalogo_espesores')
      .upsert(filas, { onConflict: 'material_id,etiqueta' });
    if (errorInsert) throw errorInsert;
  }
  paso(`${filas.length} espesores en ${Object.keys(ESPESORES).length} materiales`);
  return filas;
}

async function asignarEspesores() {
  const { data: espesores, error } = await db
    .from('catalogo_espesores').select('id,material_id,espesor_mm').order('orden');
  if (error) throw error;
  const primeroPorMaterial = new Map();
  for (const fila of espesores ?? []) {
    if (!primeroPorMaterial.has(fila.material_id)) {
      primeroPorMaterial.set(fila.material_id, fila.id);
    }
  }

  const { data: itemsRfq } = await db
    .from('rfq_items').select('id,material_id,espesor_id').not('material_id', 'is', null);
  let rfq = 0;
  for (const item of itemsRfq ?? []) {
    const espesorId = primeroPorMaterial.get(item.material_id);
    if (!espesorId || item.espesor_id === espesorId) continue;
    const { error: errorUpdate } = await db
      .from('rfq_items').update({ espesor_id: espesorId }).eq('id', item.id);
    if (!errorUpdate) rfq += 1;
  }

  const { data: itemsPropuesta } = await db
    .from('propuesta_items').select('id,material_id,espesor_id').not('material_id', 'is', null);
  let propuesta = 0;
  for (const item of itemsPropuesta ?? []) {
    const espesorId = primeroPorMaterial.get(item.material_id);
    if (!espesorId || item.espesor_id === espesorId) continue;
    const { error: errorUpdate } = await db
      .from('propuesta_items').update({ espesor_id: espesorId }).eq('id', item.id);
    if (!errorUpdate) propuesta += 1;
  }
  paso(`Espesor asignado: ${rfq} ítem(s) RFQ, ${propuesta} ítem(s) Propuesta`);
}

async function principal() {
  console.log('DEMO MÁQUINAS / TARIFAS / ESPESORES\n');
  await actualizarTarifas();
  const grupos = await actualizarGrupos();
  await actualizarRecursos(grupos);
  await sembrarEspesores();
  await asignarEspesores();
  console.log('\nDemo de máquinas y materiales completada.');
}

principal().catch((error) => {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
});
