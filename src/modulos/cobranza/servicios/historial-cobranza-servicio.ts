import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { ErrorCobranza } from '@/modulos/cobranza/servicios/cobranza-servicio';
import {
  filaAMovimientoSaldoFavor,
  filaAPagoAR,
  type MovimientoSaldoFavor,
  type PagoAR,
} from '@/modulos/cobranza/tipos/cobranza';
import {
  filaAPartidaOrdenCobranza,
  validarEstadoCuenta,
  validarMonedaCuenta,
  type CuentaBancariaCobranza,
  type CuentaHistorial,
  type DetalleOrdenCobranza,
  type HistorialCuenta,
  type PartidaOrdenCobranza,
  type ReciboPagoPersistido,
} from '@/modulos/cobranza/tipos/historial';
import type {
  ConsultarCuentasBancariasInput,
  ConsultarDetalleOrdenInput,
  ConsultarHistorialCuentaInput,
  ConsultarReciboInput,
} from '@/modulos/cobranza/validaciones/cobranza';

/**
 * Lecturas navegables de Cobranza. Todas reciben el cliente Supabase de la
 * sesión: RLS es la frontera de autorización y nunca se usa el rol de servicio.
 *
 * Toda consulta de lista pagina con `range` y pide `count: 'exact'`; ninguna se
 * deja abierta al tope implícito de PostgREST (`max_rows`).
 */

export const PAGOS_POR_PAGINA = 20;
export const MOVIMIENTOS_POR_PAGINA = 20;
export const PARTIDAS_POR_PAGINA = 25;
/** Catálogo corto: se acota igual para no depender del tope del servidor. */
export const CUENTAS_BANCARIAS_MAXIMAS = 100;

function rangoPagina(pagina: number | undefined, porPagina: number): { pagina: number; desde: number; hasta: number } {
  const solicitada = Math.max(1, pagina ?? 1);
  const desde = (solicitada - 1) * porPagina;
  return { pagina: solicitada, desde, hasta: desde + porPagina - 1 };
}

function nombreCliente(fila: { nombre_comercial: string | null; razon_social: string }): string {
  return fila.nombre_comercial || fila.razon_social;
}

/**
 * Historial de una cuenta: pagos de la cuenta y movimientos del monedero de su
 * cliente. El `clienteId` recibido es solo una expectativa de la UI; el dueño
 * real sale de la fila y una discrepancia aborta la consulta.
 */
export async function obtenerHistorialCuentaServicio(
  cliente: SupabaseClient<Database>,
  entrada: ConsultarHistorialCuentaInput,
): Promise<HistorialCuenta> {
  const { data: filaCuenta, error: errorCuenta } = await cliente
    .from('cuentas_por_cobrar')
    .select('id, orden_id, cliente_id, referencia_interna, folio_factura_remision, monto_total, saldo_pendiente, moneda, estado, fecha_emision, fecha_vencimiento')
    .eq('id', entrada.arId)
    .maybeSingle();
  if (errorCuenta) throw new ErrorCobranza('desconocido', errorCuenta.message);
  // RLS también devuelve "no existe" cuando la fila está fuera del alcance.
  if (!filaCuenta) throw new ErrorCobranza('cuenta_inexistente');
  if (entrada.clienteId && entrada.clienteId !== filaCuenta.cliente_id) {
    throw new ErrorCobranza('cuenta_no_disponible', 'cuenta_cliente_no_corresponde');
  }

  const rangoPagos = rangoPagina(entrada.paginaPagos, PAGOS_POR_PAGINA);
  const rangoMovimientos = rangoPagina(entrada.paginaMovimientos, MOVIMIENTOS_POR_PAGINA);

  const [contexto, pagos, movimientos] = await Promise.all([
    cliente
      .from('clientes')
      .select('id, nombre_comercial, razon_social')
      .eq('id', filaCuenta.cliente_id)
      .maybeSingle(),
    cliente
      .from('pagos_ar')
      .select('*', { count: 'exact' })
      .eq('ar_id', entrada.arId)
      // `id` desempata: sin orden total, dos pagos del mismo instante pueden
      // repetirse o desaparecer entre páginas.
      .order('creado_en', { ascending: false })
      .order('id', { ascending: false })
      .range(rangoPagos.desde, rangoPagos.hasta),
    cliente
      .from('movimientos_saldo_favor')
      .select('*', { count: 'exact' })
      .eq('cliente_id', filaCuenta.cliente_id)
      .order('creado_en', { ascending: false })
      .order('id', { ascending: false })
      .range(rangoMovimientos.desde, rangoMovimientos.hasta),
  ]);
  if (pagos.error) throw new ErrorCobranza('desconocido', pagos.error.message);
  if (movimientos.error) throw new ErrorCobranza('desconocido', movimientos.error.message);
  if (contexto.error) throw new ErrorCobranza('desconocido', contexto.error.message);

  const folioOrden = await folioDeOrden(cliente, filaCuenta.orden_id);
  const cuenta: CuentaHistorial = {
    id: filaCuenta.id,
    referenciaInterna: filaCuenta.referencia_interna,
    ordenId: filaCuenta.orden_id,
    clienteId: filaCuenta.cliente_id,
    clienteNombre: contexto.data ? nombreCliente(contexto.data) : 'Cliente no disponible',
    folioOrden,
    folioFacturaRemision: filaCuenta.folio_factura_remision,
    moneda: validarMonedaCuenta(filaCuenta.moneda),
    montoTotal: Number(filaCuenta.monto_total),
    saldoPendiente: Number(filaCuenta.saldo_pendiente),
    estado: validarEstadoCuenta(filaCuenta.estado),
    fechaEmision: filaCuenta.fecha_emision,
    fechaVencimiento: filaCuenta.fecha_vencimiento,
  };

  return {
    cuenta,
    pagos: {
      registros: (pagos.data ?? []).map(filaAPagoAR) satisfies PagoAR[],
      total: pagos.count ?? 0,
      pagina: rangoPagos.pagina,
      porPagina: PAGOS_POR_PAGINA,
    },
    movimientos: {
      registros: (movimientos.data ?? []).map(filaAMovimientoSaldoFavor) satisfies MovimientoSaldoFavor[],
      total: movimientos.count ?? 0,
      pagina: rangoMovimientos.pagina,
      porPagina: MOVIMIENTOS_POR_PAGINA,
    },
  };
}

async function folioDeOrden(cliente: SupabaseClient<Database>, ordenId: string): Promise<string> {
  const { data, error } = await cliente
    .from('ordenes_produccion')
    .select('folio')
    .eq('id', ordenId)
    .maybeSingle();
  if (error) throw new ErrorCobranza('desconocido', error.message);
  return data?.folio ?? 'Orden no disponible';
}

/**
 * Detalle técnico de la OP asociada a una cuenta. Sin costos ni tiempos
 * valorizados: `ver_finanzas` autoriza cartera, no el costeo de producción.
 */
export async function obtenerDetalleOrdenCobranzaServicio(
  cliente: SupabaseClient<Database>,
  entrada: ConsultarDetalleOrdenInput,
): Promise<DetalleOrdenCobranza> {
  const { data: filaOrden, error: errorOrden } = await cliente
    .from('ordenes_produccion')
    .select('id, folio, estado, prioridad, fecha_compromiso, fecha_inicio, fecha_fin, cliente_id')
    .eq('id', entrada.ordenId)
    .maybeSingle();
  if (errorOrden) throw new ErrorCobranza('desconocido', errorOrden.message);
  if (!filaOrden) throw new ErrorCobranza('cuenta_inexistente');

  const rango = rangoPagina(entrada.paginaPartidas, PARTIDAS_POR_PAGINA);
  const [contexto, partidas] = await Promise.all([
    cliente
      .from('clientes')
      .select('id, nombre_comercial, razon_social')
      .eq('id', filaOrden.cliente_id)
      .maybeSingle(),
    cliente
      .from('partidas_orden_produccion')
      .select('id, codigo_pieza, descripcion, cantidad_solicitada, cantidad_producida, cantidad_scrap, unidad_medida, maquina_asignada', { count: 'exact' })
      .eq('orden_id', entrada.ordenId)
      .order('codigo_pieza', { ascending: true })
      .order('id', { ascending: true })
      .range(rango.desde, rango.hasta),
  ]);
  if (partidas.error) throw new ErrorCobranza('desconocido', partidas.error.message);
  if (contexto.error) throw new ErrorCobranza('desconocido', contexto.error.message);

  return {
    id: filaOrden.id,
    folio: filaOrden.folio,
    estado: filaOrden.estado,
    prioridad: filaOrden.prioridad,
    fechaCompromiso: filaOrden.fecha_compromiso,
    fechaInicio: filaOrden.fecha_inicio,
    fechaFin: filaOrden.fecha_fin,
    clienteNombre: contexto.data ? nombreCliente(contexto.data) : 'Cliente no disponible',
    partidas: {
      registros: (partidas.data ?? []).map(filaAPartidaOrdenCobranza) satisfies PartidaOrdenCobranza[],
      total: partidas.count ?? 0,
      pagina: rango.pagina,
      porPagina: PARTIDAS_POR_PAGINA,
    },
  };
}

/**
 * Reconstruye un recibo desde el pago persistido, sin depender de haberlo
 * registrado en esta sesión. El crédito al monedero se toma del movimiento real
 * en MXN; no se convierte el sobrepago con un tipo de cambio inventado.
 */
export async function obtenerReciboPagoServicio(
  cliente: SupabaseClient<Database>,
  entrada: ConsultarReciboInput,
): Promise<ReciboPagoPersistido> {
  const { data: filaPago, error: errorPago } = await cliente
    .from('pagos_ar')
    .select('*')
    .eq('id', entrada.pagoId)
    .maybeSingle();
  if (errorPago) throw new ErrorCobranza('desconocido', errorPago.message);
  if (!filaPago) throw new ErrorCobranza('cuenta_inexistente');
  const pago = filaAPagoAR(filaPago);

  const { data: filaCuenta, error: errorCuenta } = await cliente
    .from('cuentas_por_cobrar')
    .select('id, orden_id, cliente_id, referencia_interna, folio_factura_remision, monto_total, saldo_pendiente, moneda, estado')
    .eq('id', pago.arId)
    .maybeSingle();
  if (errorCuenta) throw new ErrorCobranza('desconocido', errorCuenta.message);
  if (!filaCuenta) throw new ErrorCobranza('cuenta_no_disponible');

  const [contexto, movimientos, cuentaBancaria] = await Promise.all([
    cliente
      .from('clientes')
      .select('id, nombre_comercial, razon_social')
      .eq('id', filaCuenta.cliente_id)
      .maybeSingle(),
    obtenerCreditoPago(cliente, pago.id),
    pago.cuentaBancariaId ? cuentaBancariaPorId(cliente, pago.cuentaBancariaId) : Promise.resolve(null),
  ]);
  if (contexto.error) throw new ErrorCobranza('desconocido', contexto.error.message);

  return {
    pagoId: pago.id,
    folioRecibo: pago.folioRecibo,
    referenciaInterna: filaCuenta.referencia_interna,
    fecha: pago.creadoEn,
    folioOrden: await folioDeOrden(cliente, filaCuenta.orden_id),
    folioFacturaRemision: filaCuenta.folio_factura_remision,
    clienteNombre: contexto.data ? nombreCliente(contexto.data) : 'Cliente no disponible',
    metodoPago: pago.metodoPago,
    referenciaBancaria: pago.referenciaBancaria,
    notas: pago.notas,
    cuentaBancaria,
    montoPagado: pago.montoPagado,
    monedaPago: pago.monedaPago,
    tipoCambioPago: pago.tipoCambioPago,
    montoAplicadoAr: pago.montoAplicadoAr,
    montoSobrepagoAr: pago.montoSobrepagoAr,
    monedaCuenta: validarMonedaCuenta(filaCuenta.moneda),
    totalDocumento: Number(filaCuenta.monto_total),
    saldoActualCuenta: Number(filaCuenta.saldo_pendiente),
    estadoActualCuenta: validarEstadoCuenta(filaCuenta.estado),
    creditoMonederoMxn: movimientos,
  };
}

async function cuentaBancariaPorId(
  cliente: SupabaseClient<Database>,
  cuentaBancariaId: string,
): Promise<CuentaBancariaCobranza | null> {
  const { data, error } = await cliente.rpc('consultar_bancos_cobranza', { p_cuenta_id: cuentaBancariaId });
  if (error) throw new ErrorCobranza('desconocido', error.message);
  return data?.[0] ? bancoDeProyeccion(data[0]) : null;
}

function bancoDeProyeccion(fila: Database['public']['Functions']['consultar_bancos_cobranza']['Returns'][number]): CuentaBancariaCobranza {
  return { id: fila.id, banco: fila.banco, numeroCuentaEnmascarado: fila.numero_cuenta_enmascarado, moneda: validarMonedaCuenta(fila.moneda), titular: fila.titular };
}

/** Catálogo financiero autorizado y enmascarado en SQL; no accede a configuración. */
export async function obtenerCuentasBancariasActivasServicio(
  cliente: SupabaseClient<Database>,
  entrada: ConsultarCuentasBancariasInput = {},
): Promise<CuentaBancariaCobranza[]> {
  const bancos: CuentaBancariaCobranza[] = [];
  for (let desde = 0; ; desde += CUENTAS_BANCARIAS_MAXIMAS) {
    const { data, error } = await cliente.rpc('consultar_bancos_cobranza', { p_moneda: entrada.moneda, p_desde: desde });
    if (error) throw new ErrorCobranza('desconocido', error.message);
    bancos.push(...(data ?? []).map(bancoDeProyeccion));
    if (!data || data.length < CUENTAS_BANCARIAS_MAXIMAS) return bancos;
  }
}

async function obtenerCreditoPago(cliente: SupabaseClient<Database>, pagoId: string): Promise<number | null> {
  let total = 0;
  let encontrados = 0;
  for (let desde = 0; ; desde += 100) {
    const { data, error, count } = await cliente.from('movimientos_saldo_favor')
      .select('id, monto', { count: 'exact' }).eq('pago_ar_id', pagoId).eq('tipo', 'credito_sobrepago')
      .order('id').range(desde, desde + 99);
    if (error) throw new ErrorCobranza('desconocido', error.message);
    if (!data?.length && encontrados < (count ?? 0)) throw new ErrorCobranza('desconocido', 'historial_incompleto');
    encontrados += data?.length ?? 0;
    total += (data ?? []).reduce((suma, fila) => suma + Number(fila.monto), 0);
    if (encontrados >= (count ?? 0)) return encontrados ? Number(total.toFixed(4)) : null;
  }
}
