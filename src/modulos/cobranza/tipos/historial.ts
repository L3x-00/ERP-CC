import type { ResultadoPaginado } from '@/compartido/tipos/indice';
import type { Tables } from '@/compartido/tipos/supabase';
import {
  ESTADOS_CUENTA_POR_COBRAR,
  MONEDAS_COBRANZA,
  type EstadoCuentaPorCobrar,
  type MetodoPagoAR,
  type MonedaCobranza,
  type MovimientoSaldoFavor,
  type PagoAR,
} from '@/modulos/cobranza/tipos/cobranza';

/**
 * Contratos de lectura de Cobranza: historial de una cuenta, detalle técnico de
 * su orden y catálogo de cuentas bancarias para el registro de pagos.
 *
 * Los importes conservan el contrato de Fase 8: `monedaCuenta` gobierna los
 * montos de la cuenta y los aplicados; el monedero siempre es MXN.
 */

/** Encabezado de la cuenta consultada; el saldo es el vigente al momento de leer. */
export interface CuentaHistorial {
  id: string;
  referenciaInterna: string;
  ordenId: string;
  clienteId: string;
  clienteNombre: string;
  folioOrden: string;
  folioFacturaRemision: string | null;
  moneda: MonedaCobranza;
  montoTotal: number;
  saldoPendiente: number;
  estado: EstadoCuentaPorCobrar;
  fechaEmision: string;
  /** D-04: `null` mientras la cuenta no es cobrable. */
  fechaVencimiento: string | null;
  /** AR-01: desglose y condiciones para la ficha integral. */
  montoSubtotal: number | null;
  montoIva: number | null;
  cobrableDesde: string | null;
  condicionesPago: string | null;
  /** AR-09: anticipo heredado ya aplicado, separado de los pagos correctibles. */
  abonoHeredado: number;
  /** AR-08: pagos de esta cuenta que ya tienen reverso y no se corrigen de nuevo. */
  pagosReversados: string[];
  /** AR-16: trazabilidad de la anulación administrativa. */
  motivoAnulacion: string | null;
  anuladaEn: string | null;
  /** CAS para corregir/anular sin sobrescribir otra pantalla. */
  actualizadoEn: string;
}

/** Historial navegable: cada entidad pagina por separado para no truncarse. */
export interface HistorialCuenta {
  cuenta: CuentaHistorial;
  pagos: ResultadoPaginado<PagoAR>;
  movimientos: ResultadoPaginado<MovimientoSaldoFavor>;
}

/** Partida técnica de la OP; sin costos, que exigen `ver_finanzas` de otro alcance. */
export interface PartidaOrdenCobranza {
  id: string;
  codigoPieza: string;
  descripcion: string | null;
  cantidadSolicitada: number;
  cantidadProducida: number;
  cantidadScrap: number;
  unidadMedida: string;
  maquinaAsignada: string | null;
}

/** Detalle contextual de la OP abierto desde el folio de la cartera. */
export interface DetalleOrdenCobranza {
  id: string;
  folio: string;
  estado: string;
  prioridad: string;
  fechaCompromiso: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  clienteNombre: string;
  partidas: ResultadoPaginado<PartidaOrdenCobranza>;
}

/**
 * Recibo reconstruido desde el pago persistido. `saldoActualCuenta` es el saldo
 * de hoy, no el que la cuenta tenía cuando se emitió el recibo: el esquema no
 * persiste ese corte histórico y no se infiere.
 */
export interface ReciboPagoPersistido {
  pagoId: string;
  folioRecibo: string;
  referenciaInterna: string;
  fecha: string;
  folioOrden: string;
  folioFacturaRemision: string | null;
  clienteNombre: string;
  metodoPago: MetodoPagoAR;
  referenciaBancaria: string | null;
  notas: string | null;
  cuentaBancaria: CuentaBancariaCobranza | null;
  /** Importe capturado, en `monedaPago`. */
  montoPagado: number;
  monedaPago: MonedaCobranza;
  tipoCambioPago: number;
  /** Aplicado y sobrepago, ambos en `monedaCuenta`. */
  montoAplicadoAr: number;
  montoSobrepagoAr: number;
  monedaCuenta: MonedaCobranza;
  totalDocumento: number;
  saldoActualCuenta: number;
  estadoActualCuenta: EstadoCuentaPorCobrar;
  /** Crédito real al monedero (MXN) persistido por este pago; null si no hubo. */
  creditoMonederoMxn: number | null;
}

/** Cuenta bancaria activa; el número viaja enmascarado hacia el navegador. */
export interface CuentaBancariaCobranza {
  id: string;
  banco: string;
  numeroCuentaEnmascarado: string;
  moneda: MonedaCobranza;
  titular: string;
}

/** Proyecciones mínimas: las consultas piden solo estas columnas. */
type FilaCuentaBancaria = Pick<
  Tables<'cuentas_bancarias'>,
  'id' | 'banco' | 'numero_cuenta' | 'moneda' | 'titular'
>;
type FilaPartidaOrden = Pick<
  Tables<'partidas_orden_produccion'>,
  | 'id'
  | 'codigo_pieza'
  | 'descripcion'
  | 'cantidad_solicitada'
  | 'cantidad_producida'
  | 'cantidad_scrap'
  | 'unidad_medida'
  | 'maquina_asignada'
>;

/** Solo los últimos cuatro dígitos: el número completo no necesita salir del servidor. */
export function enmascararNumeroCuenta(numero: string): string {
  const limpio = numero.trim();
  return limpio.length <= 4 ? `••${limpio}` : `••••${limpio.slice(-4)}`;
}

export function filaACuentaBancariaCobranza(fila: FilaCuentaBancaria): CuentaBancariaCobranza {
  const moneda = MONEDAS_COBRANZA.find((valor) => valor === fila.moneda);
  if (!moneda) throw new Error(`Moneda inválida en cuenta bancaria: ${fila.moneda}`);

  return {
    id: fila.id,
    banco: fila.banco,
    numeroCuentaEnmascarado: enmascararNumeroCuenta(fila.numero_cuenta),
    moneda,
    titular: fila.titular,
  };
}

export function filaAPartidaOrdenCobranza(fila: FilaPartidaOrden): PartidaOrdenCobranza {
  return {
    id: fila.id,
    codigoPieza: fila.codigo_pieza,
    descripcion: fila.descripcion,
    cantidadSolicitada: Number(fila.cantidad_solicitada),
    cantidadProducida: Number(fila.cantidad_producida),
    cantidadScrap: Number(fila.cantidad_scrap),
    unidadMedida: fila.unidad_medida,
    maquinaAsignada: fila.maquina_asignada,
  };
}

/** El estado de la cuenta llega como `text`; un valor fuera del contrato no se propaga. */
export function validarEstadoCuenta(valor: string): EstadoCuentaPorCobrar {
  const estado = ESTADOS_CUENTA_POR_COBRAR.find((permitido) => permitido === valor);
  if (!estado) throw new Error(`Estado de cuenta inválido: ${valor}`);
  return estado;
}

export function validarMonedaCuenta(valor: string): MonedaCobranza {
  const moneda = MONEDAS_COBRANZA.find((permitida) => permitida === valor);
  if (!moneda) throw new Error(`Moneda de cuenta inválida: ${valor}`);
  return moneda;
}
