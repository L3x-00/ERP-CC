import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

/** Promesa de pago de una AR (SII-B8 F3). */
export type PromesaPago = {
  id: string;
  cuentaId: string;
  fechaPrometida: string;
  monto: number;
  estado: 'VIGENTE' | 'CUMPLIDA' | 'VENCIDA' | 'CANCELADA';
  motivoCancelacion: string | null;
  creadoEn: string;
  actualizadoEn: string;
};

function mapPromesa(fila: {
  id: string;
  cuenta_id: string;
  fecha_prometida: string;
  monto: number;
  estado: string;
  motivo_cancelacion: string | null;
  creado_en: string;
  actualizado_en: string;
}): PromesaPago {
  return {
    id: fila.id,
    cuentaId: fila.cuenta_id,
    fechaPrometida: fila.fecha_prometida,
    monto: Number(fila.monto),
    estado: fila.estado as PromesaPago['estado'],
    motivoCancelacion: fila.motivo_cancelacion,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Promesa vigente o vencida de una cuenta (máximo una activa). */
export async function obtenerPromesaActiva(
  cliente: SupabaseClient<Database>,
  cuentaId: string,
): Promise<PromesaPago | null> {
  const { data, error } = await cliente
    .from('promesas_pago')
    .select('id, cuenta_id, fecha_prometida, monto, estado, motivo_cancelacion, creado_en, actualizado_en')
    .eq('cuenta_id', cuentaId)
    .in('estado', ['VIGENTE', 'VENCIDA'])
    .maybeSingle();
  if (error) throw new Error('No se pudo cargar la promesa');
  return data ? mapPromesa(data) : null;
}

export type ClienteCobrable = {
  clienteId: string;
  nombre: string;
  saldoTotal: number;
  cuentas: number;
};

/** Clientes con cuentas cobrables (para el cobro repartido). */
export async function obtenerClientesCobrables(
  cliente: SupabaseClient<Database>,
): Promise<ClienteCobrable[]> {
  const { data: cuentas, error } = await cliente
    .from('cuentas_por_cobrar')
    .select('cliente_id, saldo_pendiente')
    .in('estado', ['pendiente', 'parcial'])
    .not('cobrable_desde', 'is', null);
  if (error) throw new Error('No se pudieron cargar las cuentas');

  const porCliente = new Map<string, { saldoTotal: number; cuentas: number }>();
  for (const cuenta of cuentas ?? []) {
    const actual = porCliente.get(cuenta.cliente_id) ?? { saldoTotal: 0, cuentas: 0 };
    actual.saldoTotal += Number(cuenta.saldo_pendiente);
    actual.cuentas += 1;
    porCliente.set(cuenta.cliente_id, actual);
  }

  const ids = [...porCliente.keys()];
  const nombrePorId = new Map<string, string>();
  if (ids.length > 0) {
    const { data: clientes } = await cliente
      .from('clientes')
      .select('id, razon_social, nombre_comercial')
      .in('id', ids);
    for (const registro of clientes ?? []) {
      nombrePorId.set(registro.id, registro.nombre_comercial || registro.razon_social);
    }
  }

  return [...porCliente.entries()]
    .map(([clienteId, resumen]) => ({
      clienteId,
      nombre: nombrePorId.get(clienteId) ?? '—',
      saldoTotal: resumen.saldoTotal,
      cuentas: resumen.cuentas,
    }))
    .sort((a, b) => b.saldoTotal - a.saldoTotal);
}

export type CuentaCobrableMultiple = {
  id: string;
  referenciaInterna: string;
  folioOrden: string;
  saldo: number;
  moneda: string;
};

/** Cuentas cobrables de un cliente, más antiguas primero. */
export async function obtenerCuentasCobrablesCliente(
  cliente: SupabaseClient<Database>,
  clienteId: string,
): Promise<CuentaCobrableMultiple[]> {
  const { data: cuentas, error } = await cliente
    .from('cuentas_por_cobrar')
    .select('id, referencia_interna, saldo_pendiente, moneda, orden_id')
    .eq('cliente_id', clienteId)
    .in('estado', ['pendiente', 'parcial'])
    .not('cobrable_desde', 'is', null)
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false });
  if (error) throw new Error('No se pudieron cargar las cuentas del cliente');

  const ordenIds = [...new Set((cuentas ?? []).map((cuenta) => cuenta.orden_id))];
  const folioPorOrden = new Map<string, string>();
  if (ordenIds.length > 0) {
    const { data: ordenes } = await cliente
      .from('ordenes_produccion')
      .select('id, folio, folio_sii')
      .in('id', ordenIds);
    for (const orden of ordenes ?? []) {
      folioPorOrden.set(orden.id, orden.folio_sii ?? orden.folio);
    }
  }

  return (cuentas ?? []).map((cuenta) => ({
    id: cuenta.id,
    referenciaInterna: cuenta.referencia_interna,
    folioOrden: folioPorOrden.get(cuenta.orden_id) ?? '—',
    saldo: Number(cuenta.saldo_pendiente),
    moneda: cuenta.moneda,
  }));
}
