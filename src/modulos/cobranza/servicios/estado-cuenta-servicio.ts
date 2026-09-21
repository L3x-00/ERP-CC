/**
 * Resumen del estado de cuenta por cliente (OBS-27 ampliado): convierte las
 * órdenes, sus partidas, la cotización de origen y las AR ligadas en una fila
 * legible por orden con su saldo. Función pura para pruebas deterministas.
 */

export interface OrdenCrudaEstadoCuenta {
  id: string;
  folio: string;
  estado: string;
  fechaCompromiso: string;
  esInterna: boolean;
  /** OBS-21: las órdenes archivadas (entregadas) no se muestran en el estado. */
  archivadaEn: string | null;
  cotizacionId: string | null;
  cotizacionFolio: string | null;
  cotizacionMoneda: string;
  partidas: readonly { cantidadSolicitada: number; cantidadProducida: number }[];
}

export interface CuentaCrudaEstadoCuenta {
  ordenId: string;
  montoTotal: number;
  saldoPendiente: number;
  estado: string;
  /** D-04: `null` mientras la cuenta no es cobrable (aún sin entrega). */
  fechaVencimiento: string | null;
  cobrableDesde: string | null;
  moneda: string;
}

export interface LineaCotizacionCruda {
  cantidad: number;
  precioUnitario: number;
  esDescuento: boolean;
}

export type SituacionCobroOrden =
  | 'no_exigible'
  | 'por_entregar'
  | 'por_cobrar'
  | 'vencido'
  | 'pagado'
  | 'sin_ar';

export interface FilaOrdenEstadoCuenta {
  id: string;
  folio: string;
  estado: string;
  esInterna: boolean;
  /** Visible en el estado de cuenta: ni archivada (entregada) ni cancelada. */
  abierta: boolean;
  fechaCompromiso: string;
  cotizacionFolio: string | null;
  moneda: 'MXN' | 'USD';
  solicitado: number;
  producido: number;
  avancePorcentaje: number;
  cotizadoSinIva: number | null;
  totalAr: number;
  abonado: number;
  saldo: number;
  situacion: SituacionCobroOrden;
}

function monedaSegura(moneda: string): 'MXN' | 'USD' {
  return moneda === 'USD' ? 'USD' : 'MXN';
}

function vencimientoMs(cuenta: { fechaVencimiento: string | null }): number {
  if (cuenta.fechaVencimiento === null) return Number.POSITIVE_INFINITY;
  const tiempo = new Date(cuenta.fechaVencimiento).getTime();
  return Number.isFinite(tiempo) ? tiempo : Number.POSITIVE_INFINITY;
}

function situacionDeOrden(
  cuentas: readonly CuentaCrudaEstadoCuenta[],
  estadoOrden: string,
  hoy: Date,
): SituacionCobroOrden {
  const vigentes = cuentas.filter((cuenta) => cuenta.estado !== 'cancelado');
  const conSaldo = vigentes.filter((cuenta) => cuenta.saldoPendiente > 0.00005);
  if (vigentes.length === 0) {
    return estadoOrden === 'completada' ? 'sin_ar' : 'no_exigible';
  }
  if (conSaldo.length === 0) return 'pagado';
  // D-04: una cuenta sin entrega aún no es exigible; solo cuando existe al
  // menos una cuenta cobrable se evalúa vencimiento.
  const cobrables = conSaldo.filter((cuenta) => cuenta.cobrableDesde !== null);
  if (cobrables.length === 0) return 'por_entregar';
  const vencida = cobrables.some((cuenta) => vencimientoMs(cuenta) < hoy.getTime());
  return vencida ? 'vencido' : 'por_cobrar';
}

/** Total cotizado sin IVA: las líneas de descuento se restan del subtotal. */
export function totalCotizadoSinIva(
  lineas: readonly LineaCotizacionCruda[] | undefined,
): number | null {
  if (!lineas || lineas.length === 0) return null;
  return lineas.reduce(
    (suma, linea) =>
      suma + (linea.esDescuento ? -1 : 1) * Number(linea.cantidad) * Number(linea.precioUnitario),
    0,
  );
}

export function resumirOrdenesEstadoCuenta(
  ordenes: readonly OrdenCrudaEstadoCuenta[],
  cuentas: readonly CuentaCrudaEstadoCuenta[],
  lineasPorCotizacion: ReadonlyMap<string, readonly LineaCotizacionCruda[]>,
  hoy: Date,
): FilaOrdenEstadoCuenta[] {
  const cuentasPorOrden = new Map<string, CuentaCrudaEstadoCuenta[]>();
  for (const cuenta of cuentas) {
    const actuales = cuentasPorOrden.get(cuenta.ordenId) ?? [];
    actuales.push(cuenta);
    cuentasPorOrden.set(cuenta.ordenId, actuales);
  }

  return ordenes.map((orden) => {
    const propias = cuentasPorOrden.get(orden.id) ?? [];
    const solicitado = orden.partidas.reduce(
      (suma, partida) => suma + Number(partida.cantidadSolicitada),
      0,
    );
    const producido = orden.partidas.reduce(
      (suma, partida) => suma + Number(partida.cantidadProducida),
      0,
    );
    const totalAr = propias
      .filter((cuenta) => cuenta.estado !== 'cancelado')
      .reduce((suma, cuenta) => suma + Number(cuenta.montoTotal), 0);
    const abonado = propias
      .filter((cuenta) => cuenta.estado !== 'cancelado')
      .reduce((suma, cuenta) => suma + (Number(cuenta.montoTotal) - Number(cuenta.saldoPendiente)), 0);
    const saldo = propias
      .filter((cuenta) => cuenta.estado !== 'cancelado')
      .reduce((suma, cuenta) => suma + Number(cuenta.saldoPendiente), 0);

    return {
      id: orden.id,
      folio: orden.folio,
      estado: orden.estado,
      esInterna: orden.esInterna,
      abierta: orden.archivadaEn === null && orden.estado !== 'cancelada',
      fechaCompromiso: orden.fechaCompromiso,
      cotizacionFolio: orden.cotizacionFolio,
      moneda: monedaSegura(orden.cotizacionMoneda),
      solicitado,
      producido,
      avancePorcentaje:
        solicitado <= 0 ? 0 : Math.min(100, Math.round((producido / solicitado) * 100)),
      cotizadoSinIva: orden.cotizacionId
        ? totalCotizadoSinIva(lineasPorCotizacion.get(orden.cotizacionId))
        : null,
      totalAr,
      abonado,
      saldo,
      situacion: situacionDeOrden(propias, orden.estado, hoy),
    };
  });
}

export const ETIQUETA_SITUACION_ORDEN: Record<SituacionCobroOrden, string> = {
  no_exigible: 'No exigible (en proceso)',
  por_entregar: 'Por cobrar al entregar',
  por_cobrar: 'Por cobrar',
  vencido: 'Vencido',
  pagado: 'Pagado',
  sin_ar: 'Sin AR',
};

/** Días de atraso de la cartera vencida (0 si no hay nada vencido). */
export function diasAtrasoMaximo(
  cuentas: readonly {
    estado: string;
    saldoPendiente: number;
    fechaVencimiento: string | null;
  }[],
  hoy: Date,
): number {
  const vigentes = cuentas.filter(
    (cuenta) => cuenta.estado !== 'cancelado' && cuenta.saldoPendiente > 0.00005,
  );
  let maximo = 0;
  for (const cuenta of vigentes) {
    if (cuenta.fechaVencimiento === null) continue;
    const vencimiento = new Date(cuenta.fechaVencimiento).getTime();
    if (!Number.isFinite(vencimiento)) continue;
    const dias = Math.floor((hoy.getTime() - vencimiento) / 86_400_000);
    if (dias > maximo) maximo = dias;
  }
  return maximo;
}
