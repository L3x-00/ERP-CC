import type { PasoRutaFicha, RutaItemFicha } from '@/modulos/ordenes/tipos/ficha-orden';
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

function pasosDelItem(item: SnapshotOrdenSii['items'][number]): PasoRutaFicha[] {
  const ruteo = Array.isArray(item.ruteo) ? item.ruteo : [];
  const pasos: PasoRutaFicha[] = [];
  ruteo.forEach((paso, indice) => {
    if (!esObjeto(paso)) return;
    pasos.push({
      secuencia: numero(paso.secuencia) ?? indice + 1,
      proceso: texto(paso.proceso_nombre) ?? 'Proceso',
      prepHoras: numero(paso.setup_horas),
      operacionHoras: numero(paso.run_horas),
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
      });
    });
  }
  return pasos.sort((a, b) => a.secuencia - b.secuencia);
}

/** Nombres de los procesos de un ítem en el orden de su ruta, sin horas ni tarifas. */
export function nombresProcesosDelItem(item: SnapshotOrdenSii['items'][number]): string[] {
  return pasosDelItem(item).map((paso) => paso.proceso);
}

/** Ruta por ítem (ITxx) y paso: proceso y horas estimadas, sin tarifa, costo ni precio. */
export function proyectarRutaFicha(snapshot: SnapshotOrdenSii | null): RutaItemFicha[] {
  if (!snapshot) return [];
  return snapshot.items
    .filter((item) => !item.es_descuento)
    .map((item) => ({
      codigoItem: texto(item.codigo) ?? texto(item.codigo_item) ?? '—',
      descripcion: texto(item.descripcion),
      pasos: pasosDelItem(item),
    }))
    .sort((a, b) => a.codigoItem.localeCompare(b.codigoItem, 'es', { numeric: true }));
}
