#!/usr/bin/env node
/**
 * Demo C10 — propuestas con costeo, compras, facturas y tesorería.
 *
 * Se ejecuta DESPUÉS de `demo-cliente.mjs sembrar` sobre el stack LOCAL.
 * También admite el proyecto remoto autorizado con `DEMO_DESTINO=remoto` y
 * `CONFIRMAR_DEMO_REMOTO=<ref>`; el modo local sigue siendo el predeterminado.
 * Es una semilla de presentación: datos ficticios coherentes.
 *
 * Uso:
 *   $env:CONFIRMAR_DEMO='si'; node supabase/semillas/demo-finanzas-c10.mjs
 *
 * Requisitos: guardia de loopback, `NEXT_PUBLIC_SUPABASE_URL` y
 * `SUPABASE_SERVICE_ROLE_KEY` locales.
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
  throw new Error('Define CONFIRMAR_DEMO=si para sembrar la demo de Finanzas.');
}
if (process.env.DEMO_DESTINO === 'remoto') {
  const ref = 'pwnecbcynnqnvfwmvrnn';
  if (process.env.CONFIRMAR_DEMO_REMOTO !== ref) {
    throw new Error(`Define CONFIRMAR_DEMO_REMOTO=${ref} para sembrar el proyecto remoto.`);
  }
  const host = new URL(requerir('NEXT_PUBLIC_SUPABASE_URL')).hostname;
  if (host !== `${ref}.supabase.co`) {
    throw new Error(`El host remoto no coincide con el proyecto autorizado (${ref}).`);
  }
  console.log(`MODO REMOTO AUTORIZADO: ${ref}`);
} else {
  exigirSupabaseLocal('Demo Finanzas C10');
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

async function obtenerBase() {
  const { data: admin, error: errorAdmin } = await db
    .from('usuarios').select('id').eq('email', 'ales_2_@hotmail.com').single();
  if (errorAdmin || !admin) throw new Error('Falta el administrador de demo');
  const { data: ventas, error: errorVentas } = await db
    .from('usuarios').select('id').eq('email', 'ventas@ccmanufacturing.mx').single();
  if (errorVentas || !ventas) throw new Error('Falta el usuario de ventas');
  const { data: bancos, error: errorBancos } = await db
    .from('cuentas_bancarias').select('id,moneda,banco').order('creado_en');
  if (errorBancos) throw errorBancos;
  const { data: materiales, error: errorMateriales } = await db
    .from('catalogo_materiales').select('id,codigo').order('orden').limit(1);
  if (errorMateriales || !materiales?.[0]) throw new Error('Falta el catálogo de materiales');
  const { data: ordenes, error: errorOrdenes } = await db
    .from('ordenes_produccion')
    .select('id,folio,cliente_id,estado,propuesta_revision_id,snapshot_json')
    .eq('estado', 'completada')
    .order('folio')
    .limit(3);
  if (errorOrdenes || (ordenes ?? []).length < 3) throw new Error('Faltan órdenes completadas demo');

  return {
    adminId: admin.id,
    ventasId: ventas.id,
    bancos: bancos ?? [],
    materialId: materiales[0].id,
    ordenes: ordenes ?? [],
  };
}

const PROPUESTAS = [
  { folio: 'CNC-8101_01', venta: 300000, costo: 208000 },
  { folio: 'CNC-8102_01', venta: 160000, costo: 112000 },
  { folio: 'CNC-8103_01', venta: 220000, costo: 151000 },
];

async function sembrarPropuestas(base) {
  const existentes = await db.from('propuestas').select('id', { count: 'exact', head: true });
  if ((existentes.count ?? 0) > 0) {
    paso('Propuestas ya existentes; no se duplican');
    return;
  }

  const { data: pipelines } = await db
    .from('pipeline').select('id,cliente_id').order('creado_en').limit(3);
  if (!pipelines || pipelines.length < 3) throw new Error('Faltan oportunidades demo');

  for (const [indice, definicion] of PROPUESTAS.entries()) {
    const orden = base.ordenes[indice];
    if (!orden) throw new Error(`No hay orden completada para ${definicion.folio}`);
    const pipeline = pipelines[indice];
    const propuestaId = randomUUID();
    const revisionId = randomUUID();

    await insertar('propuestas', [{
      id: propuestaId,
      rfq_id: pipeline.id,
      cliente_id: orden.cliente_id,
      folio_cnc: definicion.folio,
      estado: 'SENT',
      responsable_id: base.ventasId,
      creado_por: base.adminId,
    }]);

    const { data: revision } = await db.from('propuesta_revisiones').insert({
      id: revisionId,
      propuesta_id: propuestaId,
      letra: 'A',
      folio_revision: `${definicion.folio}-A`,
      estado: 'DRAFT',
      motivo_creacion: 'Demo financiera',
      snapshot_cabecera: { moneda: 'MXN', iva_porcentaje: 16 },
      creado_por: base.adminId,
    }).select('id,actualizado_en').single();
    if (!revision) throw new Error('No se creó la revisión demo');

    await insertar('propuesta_items', [{
      revision_id: revisionId,
      codigo: 'IT01',
      descripcion: `Fabricación de pieza para ${orden.folio}`,
      cantidad: 1,
      material_id: base.materialId,
      precio_unitario: definicion.venta,
      activo: true,
    }]);

    const costoMaterial = Math.round(definicion.costo * 0.62);
    const costoManoObra = Math.round(definicion.costo * 0.22);
    const costoGastos = Math.round(definicion.costo * 0.10);
    const costoSubcontratacion = definicion.costo - costoMaterial - costoManoObra - costoGastos;
    await rpc('editar_costos_revision', {
      p_revision_id: revisionId,
      p_datos: {
        actualizado_en: revision.actualizado_en,
        costos: [
          { categoria: 'material', monto: costoMaterial },
          { categoria: 'mano_obra', monto: costoManoObra },
          { categoria: 'gastos_directos', monto: costoGastos },
          { categoria: 'subcontratacion', monto: costoSubcontratacion },
        ],
      },
      p_actor: base.adminId,
      p_correlation_id: randomUUID(),
    });

    const { error: errorOrden } = await db.from('ordenes_produccion').update({
      propuesta_revision_id: revisionId,
      snapshot_json: { totales: { subtotal: definicion.venta, moneda: 'MXN', tipo_cambio: 1 } },
      fecha_compromiso_comercial: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    }).eq('id', orden.id);
    if (errorOrden) throw new Error(`Vincular propuesta a ${definicion.orden}: ${errorOrden.message}`);
    paso(`${definicion.folio} · estimado ${definicion.venta} · ${orden.folio}`);
  }
}

async function sembrarCompras(base) {
  const existentes = await db.from('compras').select('id', { count: 'exact', head: true });
  if ((existentes.count ?? 0) > 0) {
    paso('Compras ya existentes; no se duplican');
    return;
  }

  const proveedores = await db.from('proveedores').select('id').order('nombre_comercial').limit(3);
  if (!proveedores.data || proveedores.data.length < 3) throw new Error('Faltan proveedores demo');
  const banco = base.bancos.find((fila) => fila.moneda === 'MXN');
  if (!banco) throw new Error('Falta cuenta MXN');

  const compras = [
    {
      id: randomUUID(), folio: 'CG-8101_0001', proveedor: proveedores.data[0].id,
      orden: base.ordenes[0], estado: 'RECIBIDA', subtotal: 120000, iva: 19200,
      rubro: 'material', recibida: true,
    },
    {
      id: randomUUID(), folio: 'CG-8102_0001', proveedor: proveedores.data[1].id,
      orden: base.ordenes[1], estado: 'CONFIRMADA', subtotal: 9000, iva: 1440,
      rubro: 'subcontratacion', recibida: false,
    },
    {
      id: randomUUID(), folio: 'CG-8103_0001', proveedor: proveedores.data[2].id,
      orden: base.ordenes[2], estado: 'RECIBIDA', subtotal: 18000, iva: 2880,
      rubro: 'gastos_directos', recibida: true,
    },
    {
      id: randomUUID(), folio: 'CG-8104_0001', proveedor: proveedores.data[0].id,
      orden: base.ordenes[0], estado: 'PAGADA', subtotal: 5000, iva: 800,
      rubro: 'subcontratacion', recibida: false,
    },
  ];

  for (const compra of compras) {
    if (!compra.orden) throw new Error('Falta orden para compra demo');
    await insertar('compras', [{
      id: compra.id,
      folio_sii: compra.folio,
      proveedor_id: compra.proveedor,
      orden_id: compra.orden.id,
      estado: compra.estado,
      monto_subtotal: compra.subtotal,
      monto_iva: compra.iva,
      monto_total: compra.subtotal + compra.iva,
      moneda: 'MXN',
      tipo_cambio: 1,
      saldo_pendiente: compra.estado === 'PAGADA' ? 0 : compra.subtotal + compra.iva,
      creado_por: base.adminId,
      rubro_costo: compra.rubro,
      recibida_en: compra.recibida ? new Date().toISOString() : null,
    }]);
  }

  await insertar('pagos_compra', [{
    compra_id: compras[0].id,
    monto: 60000,
    metodo_pago: 'transferencia',
    referencia: 'SPEI-DEMO-8101',
    cuenta_bancaria_id: banco.id,
    creado_por: base.adminId,
  }]);
  paso('4 compras, 1 pago a proveedor y aviso de pago sin recepción');
}

async function sembrarFacturas(base) {
  const existentes = await db.from('facturas').select('id', { count: 'exact', head: true });
  if ((existentes.count ?? 0) > 0) {
    paso('Facturas ya existentes; no se duplican');
    return;
  }

  const { data: notas } = await db.from('notas_entrega').select('id,folio,orden_id').order('folio');
  if (!notas || notas.length < 2) throw new Error('Faltan entregas demo');
  const nota = notas[0];
  const notaDos = notas[1];

  const borrador = await rpc('crear_factura_borrador', {
    p_entrega_id: nota.id,
    p_datos: { subtotal: 200000, iva: 32000, total: 232000, rfc_receptor: 'XAXX010101000' },
    p_actor_id: base.adminId,
    p_correlation_id: randomUUID(),
  });
  if (!borrador?.[0]) throw new Error('No se creó la factura demo');
  const emitida = await rpc('emitir_factura', {
    p_factura_id: borrador[0].id,
    p_actualizado_en_esperado: borrador[0].actualizado_en,
    p_folio_fiscal: 'FAC-DEMO-8101',
    p_rfc_receptor: 'XAXX010101000',
    p_uuid_fiscal: null,
    p_actor_id: base.adminId,
    p_correlation_id: randomUUID(),
  });
  if (!emitida?.[0]) throw new Error('No se emitió la factura demo');

  await rpc('crear_factura_borrador', {
    p_entrega_id: notaDos.id,
    p_datos: { subtotal: 100000, iva: 16000, total: 116000, rfc_receptor: 'XAXX010101000' },
    p_actor_id: base.adminId,
    p_correlation_id: randomUUID(),
  });
  paso('1 factura emitida y 1 borrador vinculados a entregas/CxC');
}

async function sembrarTesoreria(base) {
  const existentes = await db.from('saldos_iniciales_tesoreria').select('cuenta_id', { count: 'exact', head: true });
  if ((existentes.count ?? 0) > 0) {
    paso('Tesorería ya existente; no se duplica');
    return;
  }

  let bancoMxn = base.bancos.find((fila) => fila.moneda === 'MXN');
  let bancoUsd = base.bancos.find((fila) => fila.moneda === 'USD');
  if (!bancoMxn || !bancoUsd) throw new Error('Faltan cuentas bancarias demo');

  const { data: nuevoBanco } = await db.from('cuentas_bancarias').insert({
    banco: 'HSBC México',
    numero_cuenta: '0216500441',
    clabe: '021180021650044126',
    moneda: 'MXN',
    titular: 'CC Manufacturing Group S. de R.L. de C.V.',
    activa: true,
  }).select('id,moneda').single();
  if (!nuevoBanco) throw new Error('No se creó la cuenta HSBC');

  await insertar('saldos_iniciales_tesoreria', [
    { cuenta_id: bancoMxn.id, monto: 250000, moneda: 'MXN', tipo_cambio: 1, creado_por: base.adminId, actualizado_por: base.adminId },
    { cuenta_id: bancoUsd.id, monto: 12000, moneda: 'USD', tipo_cambio: 18.75, creado_por: base.adminId, actualizado_por: base.adminId },
    { cuenta_id: nuevoBanco.id, monto: 80000, moneda: 'MXN', tipo_cambio: 1, creado_por: base.adminId, actualizado_por: base.adminId },
  ]);

  const salida = randomUUID();
  const entrada = randomUUID();
  await insertar('movimientos_tesoreria', [{
    id: salida,
    cuenta_id: bancoMxn.id,
    tipo: 'TRANSFERENCIA_SALIDA',
    monto: 30000,
    moneda: 'MXN',
    referencia: 'Traspaso a HSBC',
    creado_por: base.adminId,
  }]);
  await insertar('movimientos_tesoreria', [{
    id: entrada,
    cuenta_id: nuevoBanco.id,
    tipo: 'TRANSFERENCIA_ENTRADA',
    monto: 30000,
    moneda: 'MXN',
    referencia: 'Traspaso desde BBVA',
    par_movimiento_id: salida,
    creado_por: base.adminId,
  }]);
  await db.from('movimientos_tesoreria').update({ par_movimiento_id: entrada }).eq('id', salida);

  const { data: pago } = await db
    .from('pagos_ar')
    .select('id,cuenta_bancaria_id')
    .not('cuenta_bancaria_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (pago) {
    await insertar('conciliaciones_tesoreria', [{
      cuenta_id: pago.cuenta_bancaria_id,
      entidad: 'cobro',
      entidad_id: pago.id,
      conciliado_por: base.adminId,
    }]);
  }
  paso('Saldos iniciales, transferencia enlazada y cobro conciliado');
}

async function principal() {
  console.log('DEMO FINANZAS C10\n');
  const base = await obtenerBase();
  await sembrarPropuestas(base);
  await sembrarCompras(base);
  await sembrarFacturas(base);
  await sembrarTesoreria(base);
  console.log('\nDemo financiera sembrada.');
}

principal().catch((error) => {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
});
