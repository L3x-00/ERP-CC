'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { calcularTotalesCotizacion } from '@/modulos/pipeline/servicios/calcular-totales-cotizacion';

const esquemaBusqueda = z.string().trim().max(30);

export interface OrdenSinAr {
  id: string;
  folio: string;
  clienteNombre: string;
  fechaEntrega: string;
  condicionPago: string | null;
  cotizacionId: string | null;
  monedaSugerida: 'MXN' | 'USD';
  subtotalSugerido: number | null;
  descuentoSugerido: number | null;
  ivaSugerido: number | null;
  totalSugerido: number | null;
  tipoCambioSugerido: number | null;
}

/** Solo muestra órdenes entregadas sin AR; el alta vuelve a comprobarlo bajo lock en SQL. */
export async function obtenerOrdenesSinArAccion(busqueda: unknown): Promise<RespuestaAccion<OrdenSinAr[]>> {
  const analisis = esquemaBusqueda.safeParse(busqueda);
  if (!analisis.success) return { exito: false, error: 'Busca por un folio de hasta 30 caracteres.' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'ver_finanzas')) || !(await can(usuario, 'registrar_pagos'))) {
    return { exito: false, error: 'Sin permiso para consultar órdenes facturables.' };
  }

  const admin = crearClienteSupabaseAdmin();
  let consulta = admin.from('ordenes_produccion')
    .select('id, folio, cliente_id, cotizacion_id, archivada_en')
    .eq('estado', 'completada').eq('es_interna', false)
    .not('archivada_en', 'is', null)
    .order('archivada_en', { ascending: false }).limit(50);
  if (analisis.data) {
    const folio = analisis.data.replace(/[%_\\]/g, '');
    consulta = consulta.ilike('folio', `%${folio}%`);
  }
  const { data: ordenes, error: errorOrdenes } = await consulta;
  if (errorOrdenes) return { exito: false, error: 'No se pudieron consultar las órdenes entregadas.' };
  if (!ordenes?.length) return { exito: true, datos: [] };

  const ids = ordenes.map((orden) => orden.id);
  const clientesIds = [...new Set(ordenes.map((orden) => orden.cliente_id))];
  const cotizacionesIds = [...new Set(ordenes.map((orden) => orden.cotizacion_id).filter((id): id is string => !!id))];
  const [cuentas, clientes, cotizaciones, configuracion] = await Promise.all([
    admin.from('cuentas_por_cobrar').select('orden_id').in('orden_id', ids),
    admin.from('clientes').select('id, nombre_comercial, condiciones_pago, estado').in('id', clientesIds),
    cotizacionesIds.length
      ? admin.from('pipeline').select('id, moneda, iva_porcentaje').in('id', cotizacionesIds)
      : Promise.resolve({ data: [], error: null }),
    admin.from('configuracion_sistema').select('tipo_cambio_usd').limit(1).maybeSingle(),
  ]);
  if (cuentas.error || clientes.error || cotizaciones.error || configuracion.error) {
    return { exito: false, error: 'No se pudieron completar los datos de las órdenes.' };
  }
  const conCuenta = new Set((cuentas.data ?? []).map((cuenta) => cuenta.orden_id));
  const clientesPorId = new Map((clientes.data ?? []).map((cliente) => [cliente.id, cliente]));
  const cotizacionesPorId = new Map((cotizaciones.data ?? []).map((cotizacion) => [cotizacion.id, cotizacion]));

  const lineasPorCotizacion = new Map<string, { descripcion: string; cantidad: number; precioUnitario: number; esDescuento: boolean }[]>();
  if (cotizacionesIds.length) {
    for (let inicio = 0; ; inicio += 1000) {
      const { data: lineas, error } = await admin.from('cotizacion_lineas')
        .select('pipeline_id, descripcion, cantidad, precio_unitario, es_descuento')
        .in('pipeline_id', cotizacionesIds).order('id').range(inicio, inicio + 999);
      if (error) return { exito: false, error: 'No se pudo calcular la propuesta de la cotización.' };
      for (const linea of lineas ?? []) {
        const actual = lineasPorCotizacion.get(linea.pipeline_id) ?? [];
        actual.push({ descripcion: linea.descripcion, cantidad: Number(linea.cantidad), precioUnitario: Number(linea.precio_unitario), esDescuento: linea.es_descuento });
        lineasPorCotizacion.set(linea.pipeline_id, actual);
      }
      if ((lineas?.length ?? 0) < 1000) break;
    }
  }

  const disponibles: OrdenSinAr[] = [];
  for (const orden of ordenes) {
    if (conCuenta.has(orden.id) || !orden.archivada_en) continue;
    const cliente = clientesPorId.get(orden.cliente_id);
    if (!cliente || cliente.estado !== 'activo') continue;
    const cotizacion = orden.cotizacion_id ? cotizacionesPorId.get(orden.cotizacion_id) : null;
    const moneda = cotizacion?.moneda === 'USD' ? 'USD' : 'MXN';
    const lineas = orden.cotizacion_id ? lineasPorCotizacion.get(orden.cotizacion_id) : undefined;
    const totales = cotizacion && lineas?.length
      ? calcularTotalesCotizacion(lineas, Number(cotizacion.iva_porcentaje), moneda)
      : null;
    disponibles.push({
      id: orden.id, folio: orden.folio, clienteNombre: cliente.nombre_comercial,
      fechaEntrega: orden.archivada_en, condicionPago: cliente.condiciones_pago,
      cotizacionId: orden.cotizacion_id,
      monedaSugerida: moneda,
      subtotalSugerido: totales?.subtotal ?? null,
      descuentoSugerido: totales?.descuento ?? null,
      ivaSugerido: totales?.iva ?? null,
      totalSugerido: totales?.total ?? null,
      tipoCambioSugerido: moneda === 'USD' ? Number(configuracion.data?.tipo_cambio_usd ?? 0) || null : 1,
    });
  }
  return { exito: true, datos: disponibles };
}
