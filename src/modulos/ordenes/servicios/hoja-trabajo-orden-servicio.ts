import {
  nombresProcesosDelItem,
  numero,
  texto,
} from '@/modulos/ordenes/servicios/proyectar-snapshot-ficha';
import type { ArchivoFicha, HojaTrabajoOrden, ItemHojaTrabajo } from '@/modulos/ordenes/tipos/ficha-orden';
import type { SnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';

/**
 * Hoja de trabajo (R17) por LISTA BLANCA: el snapshot trae `precio_unitario`, tarifas, costos y
 * totales junto a lo operativo, así que cada campo se nombra aquí y jamás se copia el objeto. Si el
 * snapshot agrega un campo nuevo, no llega a la hoja hasta que alguien lo incluya a propósito.
 */
function proyectarItem(item: SnapshotOrdenSii['items'][number]): ItemHojaTrabajo {
  return {
    codigoItem: texto(item.codigo) ?? texto(item.codigo_item) ?? '—',
    descripcion: texto(item.descripcion),
    cantidad: numero(item.cantidad),
    material: texto(item.material),
    espesor: texto(item.espesor),
    procesos: nombresProcesosDelItem(item),
    observaciones: texto(item.notas),
  };
}

/** Sin snapshot válido (orden anterior al flujo SII) no hay hoja: el documento cae a las partidas. */
export function proyectarHojaTrabajo(entrada: {
  snapshot: SnapshotOrdenSii | null;
  folio: string;
  clienteNombre: string | null;
  observacionesOrden: string | null;
  archivos: readonly ArchivoFicha[];
}): HojaTrabajoOrden | null {
  if (!entrada.snapshot) return null;
  return {
    folio: entrada.folio,
    clienteNombre: entrada.clienteNombre,
    observacionesOrden: texto(entrada.observacionesOrden),
    items: entrada.snapshot.items
      .filter((item) => !item.es_descuento)
      .map(proyectarItem)
      .sort((a, b) => a.codigoItem.localeCompare(b.codigoItem, 'es', { numeric: true })),
    // Un archivo que ya no existe no sirve en una hoja impresa.
    archivos: entrada.archivos.filter((archivo) => archivo.disponible),
  };
}
