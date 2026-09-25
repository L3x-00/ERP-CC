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
  | 'cuenta_ya_existe'
  | 'sin_permiso'
  | 'pago_ya_reversado'
  | 'saldo_favor_insuficiente'
  | 'abono_heredado_ya_registrado'
  | 'abono_heredado_invalido'
  | 'cuenta_con_pagos_estructurados'
  | 'cuenta_cancelada'
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
  if (mensaje?.includes('sin_permiso_ar_excepcion')) return 'sin_permiso';
  if (mensaje?.includes('cuenta_por_cobrar_ya_existe')) return 'cuenta_ya_existe';
  if (mensaje?.includes('orden_no_entregada_para_ar')) return 'orden_no_lista';
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
  entrada: CrearCuentaPorCobrarInput & { actorId: string },
): Promise<CuentaAbierta> {
  const { data, error } = await admin.rpc('abrir_ar_excepcion_entregada', {
    p_orden_id: entrada.ordenId,
    p_monto_total: entrada.montoTotal,
    p_moneda: entrada.moneda,
    p_tipo_cambio_origen: entrada.tipoCambioOrigen,
    p_fecha_vencimiento: entrada.fechaVencimiento,
    p_folio_factura: entrada.folioFacturaRemision,
    p_actor_id: entrada.actorId,
  });
  if (error) lanzarErrorCobranza(error.message);
  const fila = data?.[0];
  if (!fila?.cuenta_id) throw new ErrorCobranza('desconocido');

  return {
    id: fila.cuenta_id,
    clienteId: fila.cliente_id,
    saldoPendiente: entrada.montoTotal,
    moneda: entrada.moneda,
    estado: 'pendiente',
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
  const filasCuenta: Tables<'cuentas_por_cobrar'>[] = [];
  for (let desde = 0; ; desde += 200) {
    let consulta = cliente
      .from('cuentas_por_cobrar')
      .select('*', { count: 'exact' })
      .order('fecha_vencimiento', { ascending: true })
      .order('id', { ascending: true });

    if (filtros.clienteId) consulta = consulta.eq('cliente_id', filtros.clienteId);
    if (filtros.estados?.length) consulta = consulta.in('estado', filtros.estados);
    if (filtros.moneda) consulta = consulta.eq('moneda', filtros.moneda);
    if (filtros.soloVencidas) {
      consulta = consulta
        .in('estado', ['pendiente', 'parcial'])
        .lt('fecha_vencimiento', filtros.fechaReferencia ?? new Date().toISOString());
    }

  const { data, error: errorCuentas, count } = await consulta.range(desde, desde + 199);
  if (errorCuentas) throw new ErrorCobranza('desconocido', errorCuentas.message);
  if (!data?.length && filasCuenta.length < (count ?? 0)) throw new ErrorCobranza('desconocido', 'cartera_incompleta');
  filasCuenta.push(...(data ?? []));
  if (filasCuenta.length >= (count ?? 0)) break;
  }
  const cuentas = filasCuenta.map(filaACuentaPorCobrar);
  if (cuentas.length === 0) {
    return { cuentas: [], agingPorCliente: [], totalPendienteMxn: 0 };
  }

  const idsCliente = [...new Set(cuentas.map((cuenta) => cuenta.clienteId))];
  const idsOrden = [...new Set(cuentas.map((cuenta) => cuenta.ordenId))];
  const clientes: Pick<Tables<'clientes'>, 'id' | 'nombre_comercial' | 'razon_social' | 'saldo_a_favor'>[] = [];
  const ordenes: Pick<Tables<'ordenes_produccion'>, 'id' | 'folio' | 'estado'>[] = [];
  // Lotes acotados evitan URLs de miles de IDs y el límite implícito de filas.
  for (let desde = 0; desde < Math.max(idsCliente.length, idsOrden.length); desde += 100) {
    const [grupoClientes, grupoOrdenes] = await Promise.all([
      desde < idsCliente.length ? cliente.from('clientes').select('id, nombre_comercial, razon_social, saldo_a_favor').in('id', idsCliente.slice(desde, desde + 100)) : Promise.resolve({ data: [], error: null }),
      desde < idsOrden.length ? cliente.from('ordenes_produccion').select('id, folio, estado').in('id', idsOrden.slice(desde, desde + 100)) : Promise.resolve({ data: [], error: null }),
    ]);
    if (grupoClientes.error || grupoOrdenes.error) throw new ErrorCobranza('desconocido', grupoClientes.error?.message ?? grupoOrdenes.error?.message);
    clientes.push(...(grupoClientes.data ?? []));
    ordenes.push(...(grupoOrdenes.data ?? []));
  }

  const clientesPorId = new Map(clientes.map((fila) => [
    fila.id,
    { nombre: nombreCliente(fila), saldoAFavorMxn: Number(fila.saldo_a_favor) },
  ]));
  const ordenesPorId = new Map(ordenes.map((fila) => [fila.id, fila]));
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

/** AR-08: reverso trazable de un pago; el pago original no se edita ni se borra. */
export async function reversarPagoServicio(
  admin: SupabaseClient<Database>,
  entrada: { pagoId: string; motivo: string; actorId: string },
): Promise<{ pagoId: string; arId: string; folioRecibo: string; saldoPendiente: number; estadoAr: string; monederoRevertidoMxn: number }> {
  const { data, error } = await admin.rpc('reversar_pago_ar', {
    p_pago_id: entrada.pagoId,
    p_motivo: entrada.motivo,
    p_actor_id: entrada.actorId,
  });
  if (error) lanzarErrorCobranza(error.message);
  const fila = data?.[0];
  if (!fila?.pago_id) throw new ErrorCobranza('desconocido');
  return {
    pagoId: fila.pago_id,
    arId: fila.ar_id,
    folioRecibo: fila.folio_recibo,
    saldoPendiente: Number(fila.saldo_pendiente),
    estadoAr: fila.estado_ar,
    monederoRevertidoMxn: Number(fila.monedero_revertido_mxn),
  };
}

/** AR-09: registra una sola vez el anticipo heredado no estructurado. */
export async function registrarAbonoHeredadoServicio(
  admin: SupabaseClient<Database>,
  entrada: { arId: string; monto: number; notas?: string; actorId: string },
): Promise<{ arId: string; saldoPendiente: number; estado: string; abonoHeredado: number }> {
  const { data, error } = await admin.rpc('registrar_abono_heredado_ar', {
    p_ar_id: entrada.arId,
    p_monto: entrada.monto,
    p_notas: entrada.notas ?? '',
    p_actor_id: entrada.actorId,
  });
  if (error) lanzarErrorCobranza(error.message);
  const fila = data?.[0];
  if (!fila?.ar_id) throw new ErrorCobranza('desconocido');
  return {
    arId: fila.ar_id,
    saldoPendiente: Number(fila.saldo_pendiente),
    estado: fila.estado,
    abonoHeredado: Number(fila.abono_heredado),
  };
}

export function mensajeErrorCobranza(error: unknown): string {
  if (error instanceof ErrorCobranza) {
    if (error.codigo === 'saldo_insuficiente') return 'El cliente no tiene saldo a favor suficiente';
    if (error.codigo === 'orden_no_lista') return 'La orden todavía no está lista para abrir cobranza';
    if (error.codigo === 'cuenta_ya_existe') return 'La orden ya tiene una cuenta por cobrar. Actualiza la cartera.';
    if (error.codigo === 'sin_permiso') return 'Tu permiso para registrar facturas ya no está vigente.';
    if (error.codigo === 'cuenta_no_disponible') return 'La cuenta no está disponible para este movimiento';
    if (error.codigo === 'pago_ya_reversado') return 'Ese pago ya fue reversado antes.';
    if (error.codigo === 'saldo_favor_insuficiente') return 'El monedero no tiene el crédito original; revisa movimientos antes de reversar.';
    if (error.codigo === 'abono_heredado_ya_registrado') return 'El anticipo heredado ya está registrado en esta cuenta.';
    if (error.codigo === 'cuenta_con_pagos_estructurados') return 'La cuenta ya tiene pagos registrados; el anticipo heredado solo se captura antes de cobrar.';
    if (error.codigo === 'cuenta_cancelada') return 'La cuenta está cancelada.';
    if (error.codigo === 'abono_heredado_invalido') return 'El anticipo heredado debe ser mayor a cero.';
  }
  return 'No se pudo completar la operación de cobranza';
}
