import { calcularTotalesPropuesta } from '@/modulos/propuestas/servicios/calcular-totales-propuesta';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import type {
  ImporteCotizacionHistorial,
  ImporteRevisionHistorial,
  LineaCotizacionHistorial,
  MonedaHistorial,
  PropuestaComercialHistorial,
  RevisionComercialHistorial,
} from '@/modulos/clientes/tipos/historial';

/**
 * Cálculo puro del importe que muestra el historial del cliente. Solo usa
 * precios de venta: nunca costos, ruteo ni márgenes.
 */

/** Estados en los que la revisión aún no sale al cliente y su precio puede no estar capturado. */
const ESTADOS_PRE_ENVIO: readonly EstadoPropuesta[] = ['DRAFT', 'PENDING_APPROVAL', 'READY_TO_SEND'];

/** Estados de una propuesta que ya no compite como cotización vigente. */
const ESTADOS_DESCARTADOS: readonly EstadoPropuesta[] = ['REJECTED', 'CLOSED'];

type ItemResumible = {
  cantidad: number;
  precioUnitario: number;
  esDescuento: boolean;
  activo: boolean;
};

/**
 * Resume los ítems de una revisión con el mismo cálculo que la ficha de
 * Propuestas (`calcularTotalesPropuesta`, espejo de `calcular_totales_revision`)
 * pero con costo en cero: el historial no recibe costos.
 *
 * @param entrada.items Ítems de la revisión; `null` si no fueron legibles.
 * @param entrada.moneda Moneda de la cabecera; `null` si no se reconoce (no se asume).
 * @param entrada.ivaPorcentaje IVA de la cabecera; `null` si no es legible (se omiten IVA y total).
 */
export function resumirItemsRevision(entrada: {
  items: readonly ItemResumible[] | null;
  moneda: MonedaHistorial | null;
  ivaPorcentaje: number | null;
}): Pick<RevisionComercialHistorial, 'partidasActivas' | 'conPrecio' | 'importe'> {
  if (entrada.items === null) {
    return { partidasActivas: null, conPrecio: null, importe: null };
  }

  const activos = entrada.items.filter((item) => item.activo);
  const conPrecio = activos.some((item) => item.precioUnitario > 0);
  if (entrada.moneda === null) {
    return { partidasActivas: activos.length, conPrecio, importe: null };
  }

  const totales = calcularTotalesPropuesta({
    items: activos,
    costoTotal: 0,
    ivaPorcentaje: entrada.ivaPorcentaje ?? 0,
    moneda: entrada.moneda,
  });
  const importe: ImporteRevisionHistorial = {
    subtotal: totales.subtotal,
    iva: entrada.ivaPorcentaje === null ? null : totales.iva,
    total: entrada.ivaPorcentaje === null ? null : totales.total,
    ivaPorcentaje: entrada.ivaPorcentaje,
    moneda: entrada.moneda,
  };
  return { partidasActivas: activos.length, conPrecio, importe };
}

/**
 * Qué se puede afirmar del importe de una revisión:
 * - `no-legible`: sus ítems o su moneda no se pudieron leer; no se muestra monto.
 * - `pendiente`: sin ítems activos, o antes de enviarse y sin ningún precio
 *   capturado (el precio por defecto es 0, que ahí no es un importe real).
 * - `disponible`: el importe es el registrado, incluido un cero real (p. ej.
 *   una revisión ya enviada cuyos precios son 0).
 */
export function situacionImporteRevision(
  revision: Pick<RevisionComercialHistorial, 'estado' | 'partidasActivas' | 'conPrecio' | 'importe'>,
): 'no-legible' | 'pendiente' | 'disponible' {
  if (revision.partidasActivas === null) return 'no-legible';
  if (
    revision.partidasActivas === 0 ||
    (revision.conPrecio === false && ESTADOS_PRE_ENVIO.includes(revision.estado))
  ) {
    return 'pendiente';
  }
  return revision.importe === null ? 'no-legible' : 'disponible';
}

/** Más reciente primero; el `id` desempata para que el resultado sea estable. */
function porActualizacionDescendente(
  a: Pick<PropuestaComercialHistorial, 'actualizadoEn' | 'id'>,
  b: Pick<PropuestaComercialHistorial, 'actualizadoEn' | 'id'>,
): number {
  return b.actualizadoEn.localeCompare(a.actualizadoEn) || b.id.localeCompare(a.id);
}

/**
 * Elige la propuesta y la revisión que representan la cotización:
 * 1. una propuesta con revisión aceptada (la más reciente) y esa revisión;
 * 2. si no, la propuesta más reciente que no esté rechazada ni cerrada, con su
 *    revisión vigente;
 * 3. si no, la más reciente de las descartadas.
 * Sin revisión vigente se toma la letra más alta. `revision` es `null` cuando
 * la propuesta no tiene revisiones legibles o la indicada no está entre ellas.
 */
export function elegirRevisionComercial(
  propuestas: readonly PropuestaComercialHistorial[],
): { propuesta: PropuestaComercialHistorial; revision: RevisionComercialHistorial | null } | null {
  const ordenadas = [...propuestas].sort(porActualizacionDescendente);
  const propuesta =
    ordenadas.find((fila) => fila.revisionAceptadaId !== null) ??
    ordenadas.find((fila) => !ESTADOS_DESCARTADOS.includes(fila.estado)) ??
    ordenadas[0];
  if (!propuesta) return null;

  const revisiones = propuesta.revisiones ?? [];
  const indicada = propuesta.revisionAceptadaId ?? propuesta.revisionVigenteId;
  const revision =
    indicada !== null
      ? (revisiones.find((fila) => fila.id === indicada) ?? null)
      : ([...revisiones].sort((a, b) => b.letra.localeCompare(a.letra))[0] ?? null);
  return { propuesta, revision };
}

/**
 * Decide qué importe mostrar para una cotización (RFQ). Orden de prioridad:
 *
 * 1. La revisión aceptada de una Propuesta manda sobre cualquier línea del
 *    cotizador anterior: es lo realmente vendido y las líneas antiguas son una
 *    cotización superada que no debe verse como venta cerrada. Si esa revisión
 *    no se puede leer no se cae al cotizador: se informa el error.
 * 2. Sin revisión aceptada, las líneas del cotizador anterior se conservan.
 * 3. Sin líneas —el RFQ ya pasó a Propuesta— el importe sale de la revisión
 *    vigente (`elegirRevisionComercial`).
 *
 * Si no se pudo leer Propuestas (`null`) no se sabe si existe una revisión
 * aceptada, así que tampoco se adivina con el cotizador: error. Si el rol no ve
 * Propuestas (`undefined`) lo único legible es el cotizador anterior, que se
 * conserva. Un cero solo se presenta como importe cuando la fuente lo registra
 * de verdad; si falta el dato, falta el permiso o falló la lectura se informa
 * tal cual y nunca se rellena con `$0.00`.
 *
 * @param entrada.lineas Líneas del cotizador anterior; `null` si no fueron legibles.
 * @param entrada.subtotalLineas Subtotal de `lineas`; `null` si `lineas` es `null`.
 * @param entrada.propuestas Propuestas del RFQ: `undefined` si no se consultaron
 *   (el rol no ve Propuestas); `null` si la lectura falló.
 */
export function resolverImporteCotizacion(entrada: {
  lineas: readonly LineaCotizacionHistorial[] | null;
  subtotalLineas: number | null;
  moneda: MonedaHistorial;
  propuestas: readonly PropuestaComercialHistorial[] | null | undefined;
}): ImporteCotizacionHistorial {
  const { lineas, subtotalLineas, moneda, propuestas } = entrada;
  const importeCotizador: ImporteCotizacionHistorial | null =
    lineas !== null && lineas.length > 0 && subtotalLineas !== null
      ? { tipo: 'cotizador', subtotal: subtotalLineas, moneda }
      : null;

  if (propuestas === undefined) {
    if (importeCotizador) return importeCotizador;
    return lineas === null ? { tipo: 'error' } : { tipo: 'sin-permiso' };
  }
  if (propuestas === null) return { tipo: 'error' };

  const elegida = elegirRevisionComercial(propuestas);
  const hayRevisionAceptada = elegida !== null && elegida.propuesta.revisionAceptadaId !== null;
  if (importeCotizador && !hayRevisionAceptada) return importeCotizador;

  if (elegida === null) {
    // Sin Propuesta solo se puede afirmar que no hay importe si el cotizador
    // anterior se leyó y está vacío; si no se leyó, el dato podría existir.
    return lineas === null ? { tipo: 'error' } : { tipo: 'sin-datos' };
  }

  const { propuesta, revision } = elegida;
  if (revision === null) return { tipo: 'error' };

  const situacion = situacionImporteRevision(revision);
  if (situacion === 'no-legible') return { tipo: 'error' };

  const origen = {
    propuestaId: propuesta.id,
    folioCnc: propuesta.folioCnc,
    folioRevision: revision.folioRevision,
    letra: revision.letra,
    estadoRevision: revision.estado,
    aceptada: propuesta.revisionAceptadaId === revision.id,
  };
  if (situacion === 'pendiente') return { tipo: 'pendiente', origen };
  if (revision.importe === null) return { tipo: 'error' };

  return {
    tipo: 'propuesta',
    subtotal: revision.importe.subtotal,
    iva: revision.importe.iva,
    total: revision.importe.total,
    moneda: revision.importe.moneda,
    origen,
  };
}
