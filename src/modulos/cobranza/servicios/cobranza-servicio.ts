import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/compartido/tipos/supabase';
import {
  calcularAgingPorCliente,
  type ResumenAgingCliente,
} from '@/modulos/cobranza/servicios/aging-servicio';
import {
  filaACuentaPorCobrar,
  filaAMovimientoSaldoFavor,
  filaAPagoAR,
  type CuentaPorCobrar,
  type MovimientoSaldoFavor,
  type PagoAR,
} from '@/modulos/cobranza/tipos/cobranza';
import type {
  AplicarSaldoFavorInput,
  ConsultarCarteraInput,
  CrearCuentaPorCobrarInput,
  RegistrarPagoInput,
} from '@/modulos/cobranza/validaciones/cobranza';

export type CodigoErrorCobranza =
  | 'cuenta_inexistente'
  | 'cuenta_no_disponible'
  | 'saldo_insuficiente'
  | 'solicitud_invalida'
  | 'orden_no_lista'
  | 'desconocido';

export class ErrorCobranza extends Error {
  constructor(
    public readonly codigo: CodigoErrorCobranza,
    mensaje?: string,
  ) {
    super(mensaje);
    this.name = 'ErrorCobranza';
  }
}

export interface CuentaAbierta {
  id: string;
  clienteId: string;
  saldoPendiente: number;
  moneda: string;
  estado: string;
}

export interface PagoRegistrado {
  pagoId: string;
  folioRecibo: string;
  arId: string;
  saldoPendiente: number;
  estadoAr: string;
  montoAplicadoAr: number;
  montoSobrepagoAr: number;
  saldoAFavorMxn: number;
  idempotente: boolean;
}

export interface SaldoFavorAplicado {
  pagoId: string;
  folioRecibo: string;
  arId: string;
  saldoPendiente: number;
  estadoAr: string;
  montoAplicadoAr: number;
  saldoAFavorMxn: number;
  idempotente: boolean;
}

export interface CuentaCartera extends CuentaPorCobrar {
  clienteNombre: string;
  saldoAFavorMxn: number;
  folioOrden: string;
  estadoProduccion: string;
}

export interface ResumenCartera {
  cuentas: CuentaCartera[];
  agingPorCliente: ResumenAgingCliente[];
  totalPendienteMxn: number;
}

function codigoDesdeMensaje(mensaje: string | undefined): CodigoErrorCobranza {
  if (mensaje?.includes('orden_no_lista_para_cobranza')) return 'orden_no_lista';
  if (mensaje?.includes('saldo_a_favor_insuficiente')) return 'saldo_insuficiente';
  if (mensaje?.includes('solicitud_')) return 'solicitud_invalida';
  if (mensaje?.includes('cuenta_inexistente')) return 'cuenta_inexistente';
  if (mensaje?.includes('cuenta_') || mensaje?.includes('orden_no')) return 'cuenta_no_disponible';
  return 'desconocido';
}

function lanzarErrorCobranza(mensaje: string | undefined): never {
  throw new ErrorCobranza(codigoDesdeMensaje(mensaje), mensaje);
}

function numeroSeguro(valor: number): number {
  return Number.isFinite(valor) ? valor : 0;
}

/** Abre una cuenta AR desde una orden lista, con el importe capturado por Contabilidad. */
export async function abrirCuentaPorCobrarServicio(
  admin: SupabaseClient<Database>,
  entrada: CrearCuentaPorCobrarInput,
): Promise<CuentaAbierta> {
  const { data, error } = await admin.rpc('abrir_cuenta_por_cobrar', {
    p_orden_id: entrada.ordenId,
    p_monto_total: entrada.montoTotal,
    p_moneda: entrada.moneda,
    p_tipo_cambio_origen: entrada.tipoCambioOrigen,
    p_fecha_vencimiento: entrada.fechaVencimiento,
    p_folio_factura_remision: entrada.folioFacturaRemision,
  });
  if (error) lanzarErrorCobranza(error.message);
  const fila = data?.[0];
  if (!fila?.id) throw new ErrorCobranza('desconocido');

  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    saldoPendiente: Number(fila.saldo_pendiente),
    moneda: fila.moneda,
    estado: fila.estado,
  };
}

/** Registra un pago externo mediante la RPC idempotente; los saldos nunca se calculan aquí. */
export async function registrarPagoServicio(
  admin: SupabaseClient<Database>,
  entrada: RegistrarPagoInput & { usuarioId: string },
): Promise<PagoRegistrado> {
  const { data, error } = await admin.rpc('registrar_pago_ar_atomico', {
    p_ar_id: entrada.arId,
    p_monto_pagado: entrada.montoPagado,
    p_moneda_pago: entrada.monedaPago,
    p_tipo_cambio_pago: entrada.tipoCambioPago,
    p_metodo_pago: entrada.metodoPago,
    p_referencia: entrada.referenciaBancaria ?? '',
    p_usuario_id: entrada.usuarioId,
    p_solicitud_id: entrada.solicitudId,
    p_notas: entrada.notas,
    p_cuenta_bancaria_id: entrada.cuentaBancariaId,
  });
  if (error) lanzarErrorCobranza(error.message);
  const fila = data?.[0];
  if (!fila?.pago_id || !fila.folio_recibo) throw new ErrorCobranza('desconocido');

  return {
    pagoId: fila.pago_id,
    folioRecibo: fila.folio_recibo,
    arId: fila.ar_id,
    saldoPendiente: Number(fila.saldo_pendiente),
    estadoAr: fila.estado_ar,
    montoAplicadoAr: Number(fila.monto_aplicado_ar),
    montoSobrepagoAr: Number(fila.monto_sobrepago_ar),
    saldoAFavorMxn: Number(fila.saldo_a_favor_mxn),
    idempotente: fila.idempotente,
  };
}

/** Debita el monedero MXN y aplica la equivalencia a la cuenta bajo una sola transacción. */
export async function aplicarSaldoFavorServicio(
  admin: SupabaseClient<Database>,
  entrada: AplicarSaldoFavorInput & { usuarioId: string },
): Promise<SaldoFavorAplicado> {
  const { data, error } = await admin.rpc('aplicar_saldo_favor_ar', {
    p_cliente_id: entrada.clienteId,
    p_ar_id: entrada.arId,
    p_monto_mxn: entrada.montoAAplicar,
    p_usuario_id: entrada.usuarioId,
    p_solicitud_id: entrada.solicitudId,
  });
  if (error) lanzarErrorCobranza(error.message);
  const fila = data?.[0];
  if (!fila?.pago_id || !fila.folio_recibo) throw new ErrorCobranza('desconocido');

  return {
    pagoId: fila.pago_id,
    folioRecibo: fila.folio_recibo,
    arId: fila.ar_id,
    saldoPendiente: Number(fila.saldo_pendiente),
    estadoAr: fila.estado_ar,
    montoAplicadoAr: Number(fila.monto_aplicado_ar),
    saldoAFavorMxn: Number(fila.saldo_a_favor_mxn),
    idempotente: fila.idempotente,
  };
}

function nombreCliente(
  fila: Pick<Tables<'clientes'>, 'nombre_comercial' | 'razon_social'>,
): string {
  return fila.nombre_comercial || fila.razon_social;
}

/** Lee cartera con el cliente Supabase de sesión: RLS conserva la frontera de consulta. */
export async function obtenerResumenCarteraServicio(
  cliente: SupabaseClient<Database>,
  filtros: ConsultarCarteraInput,
): Promise<ResumenCartera> {
  let consulta = cliente
    .from('cuentas_por_cobrar')
    .select('*')
    .order('fecha_vencimiento', { ascending: true });

  if (filtros.clienteId) consulta = consulta.eq('cliente_id', filtros.clienteId);
  if (filtros.estados?.length) consulta = consulta.in('estado', filtros.estados);
  if (filtros.moneda) consulta = consulta.eq('moneda', filtros.moneda);
  if (filtros.soloVencidas) {
    consulta = consulta
      .in('estado', ['pendiente', 'parcial'])
      .lt('fecha_vencimiento', filtros.fechaReferencia ?? new Date().toISOString());
  }

  const { data: filasCuenta, error: errorCuentas } = await consulta;
  if (errorCuentas) throw new ErrorCobranza('desconocido', errorCuentas.message);
  const cuentas = (filasCuenta ?? []).map(filaACuentaPorCobrar);
  if (cuentas.length === 0) {
    return { cuentas: [], agingPorCliente: [], totalPendienteMxn: 0 };
  }

  const idsCliente = [...new Set(cuentas.map((cuenta) => cuenta.clienteId))];
  const idsOrden = [...new Set(cuentas.map((cuenta) => cuenta.ordenId))];
  const [clientes, ordenes] = await Promise.all([
    cliente.from('clientes').select('id, nombre_comercial, razon_social, saldo_a_favor').in('id', idsCliente),
    cliente.from('ordenes_produccion').select('id, folio, estado').in('id', idsOrden),
  ]);
  if (clientes.error || ordenes.error) {
    throw new ErrorCobranza('desconocido', clientes.error?.message ?? ordenes.error?.message);
  }

  const clientesPorId = new Map((clientes.data ?? []).map((fila) => [
    fila.id,
    { nombre: nombreCliente(fila), saldoAFavorMxn: Number(fila.saldo_a_favor) },
  ]));
  const ordenesPorId = new Map((ordenes.data ?? []).map((fila) => [fila.id, fila]));
  const cuentasCartera = cuentas.map((cuenta) => {
    const orden = ordenesPorId.get(cuenta.ordenId);
    return {
      ...cuenta,
      clienteNombre: clientesPorId.get(cuenta.clienteId)?.nombre ?? 'Cliente no disponible',
      saldoAFavorMxn: clientesPorId.get(cuenta.clienteId)?.saldoAFavorMxn ?? 0,
      folioOrden: orden?.folio ?? 'Orden no disponible',
      estadoProduccion: orden?.estado ?? 'sin_datos',
    } satisfies CuentaCartera;
  });
  const fechaReferencia = filtros.fechaReferencia ?? new Date().toISOString();
  const agingPorCliente = calcularAgingPorCliente(cuentas, fechaReferencia);
  const totalPendienteMxn = agingPorCliente.reduce(
    (total, resumen) => total + numeroSeguro(resumen.totalPendiente),
    0,
  );

  return { cuentas: cuentasCartera, agingPorCliente, totalPendienteMxn: Number(totalPendienteMxn.toFixed(4)) };
}

export async function obtenerPagosCuentaServicio(
  cliente: SupabaseClient<Database>,
  arId: string,
): Promise<PagoAR[]> {
  const { data, error } = await cliente
    .from('pagos_ar')
    .select('*')
    .eq('ar_id', arId)
    .order('creado_en', { ascending: false });
  if (error) throw new ErrorCobranza('desconocido', error.message);
  return (data ?? []).map(filaAPagoAR);
}

export async function obtenerMovimientosSaldoFavorServicio(
  cliente: SupabaseClient<Database>,
  clienteId: string,
): Promise<MovimientoSaldoFavor[]> {
  const { data, error } = await cliente
    .from('movimientos_saldo_favor')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false });
  if (error) throw new ErrorCobranza('desconocido', error.message);
  return (data ?? []).map(filaAMovimientoSaldoFavor);
}

export function mensajeErrorCobranza(error: unknown): string {
  if (error instanceof ErrorCobranza) {
    if (error.codigo === 'saldo_insuficiente') return 'El cliente no tiene saldo a favor suficiente';
    if (error.codigo === 'orden_no_lista') return 'La orden todavía no está lista para abrir cobranza';
    if (error.codigo === 'cuenta_no_disponible') return 'La cuenta no está disponible para este movimiento';
  }
  return 'No se pudo completar la operación de cobranza';
}
