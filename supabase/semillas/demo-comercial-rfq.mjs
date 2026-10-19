#!/usr/bin/env node
/**
 * Demo comercial — ítems RFQ y propuestas adicionales.
 *
 * Completa la demo después de `demo-cliente.mjs` y `demo-finanzas-c10.mjs`.
 * Crea ítems/operaciones para los RFQ que aún no los tienen y 2 propuestas
 * DRAFT adicionales. Solo toca el stack local salvo que se autorice el remoto
 * con `DEMO_DESTINO=remoto` + `CONFIRMAR_DEMO_REMOTO=<ref>`.
 */

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cargarEntornoLocal, exigirSupabaseLocal } from './guardia-supabase-local.mjs';

cargarEntornoLocal();

function requerir(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre}`);
  return valor;
}

if (process.env.CONFIRMAR_DEMO !== 'si') {
  throw new Error('Define CONFIRMAR_DEMO=si para sembrar la demo comercial.');
}
if (process.env.DEMO_DESTINO === 'remoto') {
  const ref = 'pwnecbcynnqnvfwmvrnn';
  if (process.env.CONFIRMAR_DEMO_REMOTO !== ref) {
    throw new Error(`Define CONFIRMAR_DEMO_REMOTO=${ref} para sembrar el proyecto remoto.`);
  }
  if (new URL(requerir('NEXT_PUBLIC_SUPABASE_URL')).hostname !== `${ref}.supabase.co`) {
    throw new Error(`El host remoto no coincide con ${ref}.`);
  }
  console.log(`MODO REMOTO AUTORIZADO: ${ref}`);
} else {
  exigirSupabaseLocal('Demo comercial RFQ/propuestas');
}

const db = createClient(
  requerir('NEXT_PUBLIC_SUPABASE_URL'),
  requerir('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function insertar(tabla, filas) {
  const { data, error } = await db.from(tabla).insert(filas).select();
  if (error) throw new Error(`INSERT ${tabla}: ${error.message}`);
  return data;
}

async function rpc(nombre, args) {
  const { data, error } = await db.rpc(nombre, args);
  if (error) throw new Error(`${nombre}: ${error.message}`);
  return data;
}

function paso(texto) {
  console.log(`  · ${texto}`);
}

async function sembrarItemsRfq(materiales, procesos) {
  const { data: pipeline, error } = await db
    .from('pipeline')
    .select('id,folio_op,etapa,empresa')
    .order('creado_en');
  if (error) throw error;
  const { data: existentes } = await db.from('rfq_items').select('rfq_id');
  const conItems = new Set((existentes ?? []).map((fila) => fila.rfq_id));
  let creados = 0;
  let omitidos = 0;

  for (const [indice, rfq] of (pipeline ?? []).entries()) {
    if (conItems.has(rfq.id)) continue;
    const itemUno = randomUUID();
    const itemDos = randomUUID();
    try {
      await insertar('rfq_items', [
        {
          id: itemUno,
          rfq_id: rfq.id,
          numero: 1,
          codigo: 'IT01',
          descripcion: `Pieza principal para ${rfq.empresa ?? rfq.folio_op}`,
          cantidad: 10 + indice,
          material_id: materiales[indice % materiales.length]?.id ?? null,
          acabado: indice % 2 === 0 ? 'Pintura electrostática' : 'Natural',
          notas: 'Requerimiento demo con tolerancia general',
          estado: 'activo',
        },
        {
          id: itemDos,
          rfq_id: rfq.id,
          numero: 2,
          codigo: 'IT02',
          descripcion: `Componente secundario para ${rfq.empresa ?? rfq.folio_op}`,
          cantidad: 5 + (indice % 7),
          material_id: materiales[(indice + 1) % materiales.length]?.id ?? null,
          acabado: 'Natural',
          notas: 'Componente demo para ensamble',
          estado: 'activo',
        },
      ]);
      await insertar('rfq_item_operaciones', [
        { rfq_item_id: itemUno, proceso_id: procesos[indice % procesos.length].id, orden: 1 },
        { rfq_item_id: itemUno, proceso_id: procesos[(indice + 1) % procesos.length].id, orden: 2 },
        { rfq_item_id: itemDos, proceso_id: procesos[(indice + 2) % procesos.length].id, orden: 1 },
      ]);
      creados += 1;
    } catch (error) {
      omitidos += 1;
      console.log(`  Aviso: RFQ ${rfq.folio_op} sin ítems (${error.message})`);
    }
  }
  paso(`RFQ con ítems nuevos: ${creados}; omitidos: ${omitidos}`);
}

async function sembrarPropuestasExtra(materiales, procesos) {
  const { data: propuestas } = await db.from('propuestas').select('rfq_id');
  const usados = new Set((propuestas ?? []).map((fila) => fila.rfq_id));
  const { data: pipeline, error } = await db
    .from('pipeline')
    .select('id,folio_op,etapa,empresa,cliente_id')
    .not('cliente_id', 'is', null)
    .order('creado_en');
  if (error) throw error;
  const disponibles = (pipeline ?? []).filter((fila) => !usados.has(fila.id)).slice(0, 2);
  if (disponibles.length === 0) {
    paso('No hay RFQ adicionales con cliente para propuestas extra');
    return;
  }

  const { data: admin } = await db
    .from('usuarios').select('id').eq('email', 'ales_2_@hotmail.com').single();
  const { data: ventas } = await db
    .from('usuarios').select('id').eq('email', 'ventas@ccmanufacturing.mx').single();
  if (!admin?.id || !ventas?.id) throw new Error('Faltan usuarios demo');

  for (const [indice, rfq] of disponibles.entries()) {
    const { data: itemsRfq } = await db
      .from('rfq_items').select('id,numero,codigo,descripcion,cantidad,material_id')
      .eq('rfq_id', rfq.id).order('numero');
    const propuestaId = randomUUID();
    const revisionId = randomUUID();
    const folio = `CNC-82${String(indice + 1).padStart(2, '0')}_01`;

    await insertar('propuestas', [{
      id: propuestaId,
      rfq_id: rfq.id,
      cliente_id: rfq.cliente_id,
      folio_cnc: folio,
      estado: 'SENT',
      responsable_id: ventas.id,
      creado_por: admin.id,
    }]);
    const { data: revision, error: errorRevision } = await db
      .from('propuesta_revisiones').insert({
        id: revisionId,
        propuesta_id: propuestaId,
        letra: 'A',
        folio_revision: `${folio}-A`,
        estado: 'DRAFT',
        motivo_creacion: 'Propuesta demo adicional',
        snapshot_cabecera: { moneda: 'MXN', iva_porcentaje: 16 },
        creado_por: admin.id,
      }).select('id,actualizado_en').single();
    if (errorRevision || !revision) throw new Error(errorRevision?.message ?? 'Sin revisión');

    const items = (itemsRfq?.length ? itemsRfq : [{
      id: null, numero: 1, codigo: 'IT01',
      descripcion: `Pieza para ${rfq.empresa}`, cantidad: 10,
      material_id: materiales[indice % materiales.length]?.id ?? null,
    }]);
    await insertar('propuesta_items', items.map((item) => ({
      revision_id: revisionId,
      rfq_item_id: item.id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      cantidad: Number(item.cantidad),
      material_id: item.material_id ?? materiales[0]?.id ?? null,
      precio_unitario: 12500 + indice * 3500,
      activo: true,
    })));

    const total = 180000 + indice * 45000;
    await rpc('editar_costos_revision', {
      p_revision_id: revisionId,
      p_datos: {
        actualizado_en: revision.actualizado_en,
        costos: [
          { categoria: 'material', monto: Math.round(total * 0.52) },
          { categoria: 'mano_obra', monto: Math.round(total * 0.22) },
          { categoria: 'gastos_directos', monto: Math.round(total * 0.08) },
          { categoria: 'subcontratacion', monto: Math.round(total * 0.04) },
        ],
      },
      p_actor: admin.id,
      p_correlation_id: randomUUID(),
    });
    paso(`Propuesta ${folio} · ${rfq.folio_op} · ${items.length} ítem(s)`);
  }
}

async function principal() {
  console.log('DEMO COMERCIAL RFQ / PROPUESTAS\n');
  const { data: materiales, error: errorMateriales } = await db
    .from('catalogo_materiales').select('id,codigo').eq('activo', true).order('orden');
  const { data: procesos, error: errorProcesos } = await db
    .from('catalogo_procesos').select('id,codigo').eq('activo', true).order('orden');
  if (errorMateriales || !materiales?.length) throw new Error('Faltan materiales demo');
  if (errorProcesos || !procesos?.length) throw new Error('Faltan procesos demo');
  await sembrarItemsRfq(materiales, procesos);
  await sembrarPropuestasExtra(materiales, procesos);
  console.log('\nDemo comercial completada.');
}

principal().catch((error) => {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
});
