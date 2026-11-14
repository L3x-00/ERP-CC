import type {
  EstadoPasoRutaFicha,
  PasoRutaFicha,
  RutaItemFicha,
} from '@/modulos/ordenes/tipos/ficha-orden';
import type { SnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';

/**
 * Proyecciones por LISTA BLANCA del snapshot interno de la orden para la ficha. El snapshot trae
 * precios, tarifas y costos junto a lo operativo: aquí se lee campo a campo y nunca se copia el
 * objeto, de modo que lo que no esté nombrado no puede llegar al cliente.
 */

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

export function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
}

export function numero(valor: unknown): number | null {
  const convertido = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== ''
    ? Number(valor)
    : Number.NaN;
  return Number.isFinite(convertido) ? convertido : null;
}

function pasosDelItem(
  item: SnapshotOrdenSii['items'][number],
  estadosPorSecuencia: ReadonlyMap<number, EstadoPasoRutaFicha> | undefined,
  estadoSinRegistro: EstadoPasoRutaFicha,
): PasoRutaFicha[] {
  const ruteo = Array.isArray(item.ruteo) ? item.ruteo : [];
  const pasos: PasoRutaFicha[] = [];
  ruteo.forEach((paso, indice) => {
    if (!esObjeto(paso)) return;
    const secuencia = numero(paso.secuencia) ?? indice + 1;
    pasos.push({
      secuencia,
      proceso: texto(paso.proceso_nombre) ?? 'Proceso',
      prepHoras: numero(paso.setup_horas),
      operacionHoras: numero(paso.run_horas),
      estado: estadosPorSecuencia?.get(secuencia) ?? estadoSinRegistro,
    });
  });
  if (pasos.length === 0) {
    // Snapshot antiguo sin ruteo estructurado: solo se conoce la lista de operaciones.
    const operaciones = Array.isArray(item.operaciones) ? item.operaciones : [];
    operaciones.forEach((operacion, indice) => {
      const nombre = esObjeto(operacion) ? texto(operacion.nombre) ?? texto(operacion.codigo) : null;
      pasos.push({
        secuencia: indice + 1,
        proceso: nombre ?? 'Operación',
        prepHoras: null,
        operacionHoras: null,
        estado: estadosPorSecuencia?.get(indice + 1) ?? estadoSinRegistro,
      });
    });
  }
  return pasos.sort((a, b) => a.secuencia - b.secuencia);
}

/** Nombres de los procesos de un ítem en el orden de su ruta, sin horas ni tarifas. */
export function nombresProcesosDelItem(item: SnapshotOrdenSii['items'][number]): string[] {
  return pasosDelItem(item, undefined, 'sin_registro').map((paso) => paso.proceso);
}

/** Estados reales de la ruta indexados por ítem visible (`ITxx`) y por ítem del snapshot. */
export interface EstadosRutaFicha {
  porCodigoItem: ReadonlyMap<string, ReadonlyMap<number, EstadoPasoRutaFicha>>;
  porItemId: ReadonlyMap<string, ReadonlyMap<number, EstadoPasoRutaFicha>>;
  /** Orden producida/cerrada: lo que no tenga registro propio ya se completó. */
  ordenConcluida: boolean;
}

const ESTADO_POR_PLANEACION: Record<string, EstadoPasoRutaFicha> = {
  programada: 'programada',
  en_preparacion: 'en_preparacion',
  en_proceso: 'en_proceso',
  bloqueada: 'bloqueada',
  completada: 'completada',
  cancelada: 'cancelada',
};

/**
 * Estado real de un paso a partir de la planeación y de los avances. Una orden
 * concluida no conserva pasos «En proceso» por una planeación rezagada; la
 * cancelación sí se mantiene porque es una decisión explícita del negocio.
 */
export function estadoPasoRuta(
  estadoPlaneacion: string,
  opciones: { ordenConcluida: boolean; tieneAvance: boolean },
): EstadoPasoRutaFicha {
  const estado = ESTADO_POR_PLANEACION[estadoPlaneacion] ?? 'sin_registro';
  if (opciones.ordenConcluida && estado !== 'cancelada') {
    return 'completada';
  }
  if (estado === 'programada' && opciones.tieneAvance) {
    return 'en_proceso';
  }
  return estado;
}

/**
 * Ruta por ítem (ITxx) y paso: proceso, horas estimadas y estado real, sin
 * tarifa, costo ni precio. El estado sale de `programacion_areas` y los avances;
 * si la orden ya se cerró, los pasos sin fila se muestran «Completada» en vez de
 * un «Pendiente» fijo (Obs. cliente 2026-11-14).
 */
export function proyectarRutaFicha(
  snapshot: SnapshotOrdenSii | null,
  estados?: EstadosRutaFicha,
): RutaItemFicha[] {
  if (!snapshot) return [];
  const estadoSinRegistro: EstadoPasoRutaFicha = estados?.ordenConcluida ? 'completada' : 'sin_registro';
  return snapshot.items
    .filter((item) => !item.es_descuento)
    .map((item) => {
      const codigoItem = texto(item.codigo) ?? texto(item.codigo_item) ?? '—';
      const itemId = texto(item.item_id);
      const estadosPorSecuencia = (itemId ? estados?.porItemId.get(itemId) : undefined)
        ?? estados?.porCodigoItem.get(codigoItem);
      return {
        codigoItem,
        descripcion: texto(item.descripcion),
        pasos: pasosDelItem(item, estadosPorSecuencia, estadoSinRegistro),
      };
    })
    .sort((a, b) => a.codigoItem.localeCompare(b.codigoItem, 'es', { numeric: true }));
}
