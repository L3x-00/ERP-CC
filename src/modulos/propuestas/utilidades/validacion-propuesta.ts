import type {
  PropuestaItem,
  RevisionPropuesta,
  RuteoItemPropuesta,
} from '@/modulos/propuestas/tipos/indice';

type ArchivoParaConteo = { entidad: string; entidadId: string; vigente: boolean };

export type EntradaFaltantesValidacion = {
  revision: Pick<RevisionPropuesta, 'id' | 'letra' | 'requiereRevisionRuteo' | 'requiereRevisionCosteo'>;
  revisiones: readonly Pick<RevisionPropuesta, 'id' | 'letra'>[];
  /** Ítems de TODAS las revisiones de la propuesta (el linaje se resuelve por código). */
  items: readonly Pick<PropuestaItem, 'id' | 'revisionId' | 'codigo' | 'activo'>[];
  ruteo: readonly {
    itemId: string;
    costeadoEn: string | null;
    /** T1 2026-11-06: origen congelado; RESPALDO exige advertencia visible. */
    tarifaFuente?: RuteoItemPropuesta['tarifaFuente'];
    /** T2 2026-11-06: origen legible para identificar el grupo sin tarifa. */
    tarifaOrigen?: string | null;
  }[];
  /** Propios, heredados del RFQ y por ítem, ya sin los retirados. */
  archivos: readonly ArchivoParaConteo[];
};

export type FaltantesValidacionPropuesta = {
  sinItemsActivos: boolean;
  /** Códigos ITxx activos sin ninguna fila de ruteo. */
  itemsSinRuteo: string[];
  /** Códigos ITxx activos con ruteo que aún no se costea (tarifa congelada). */
  itemsSinCostear: string[];
  /** Códigos ITxx con alguna operación costeada con tarifa de respaldo. */
  operacionesConTarifaRespaldo: string[];
  sinArchivos: boolean;
  /** Confirmaciones pendientes («Requiere revisión» de ruteo / costeo). */
  confirmaciones: string[];
  /** Mensajes legibles de contenido (ítems, ruteo, costeo, archivos). */
  contenido: string[];
  /** Avisos que no bloquean la validación pero deben verse antes de enviar. */
  advertencias: string[];
  /** Todo lo que falta, contenido primero y confirmaciones después. */
  mensajes: string[];
};

/**
 * Cuenta los archivos vigentes que la ficha muestra para una revisión: los de
 * esa revisión y los de las anteriores, los de sus ítems por código estable y
 * los heredados del RFQ. Mismo criterio que la pestaña Archivos.
 */
export function contarArchivosRevision(entrada: EntradaFaltantesValidacion): number {
  const idsRevisiones = new Set(
    entrada.revisiones
      .filter((fila) => fila.letra <= entrada.revision.letra)
      .map((fila) => fila.id),
  );
  const codigosRevision = new Set(
    entrada.items.filter((item) => item.revisionId === entrada.revision.id).map((item) => item.codigo),
  );
  const idsItemsLinaje = new Set(
    entrada.items
      .filter((item) => idsRevisiones.has(item.revisionId) && codigosRevision.has(item.codigo))
      .map((item) => item.id),
  );

  return entrada.archivos.filter((archivo) => {
    if (!archivo.vigente) return false;
    switch (archivo.entidad) {
      case 'propuesta_revision':
        return idsRevisiones.has(archivo.entidadId);
      case 'propuesta_item':
        return idsItemsLinaje.has(archivo.entidadId);
      case 'rfq':
      case 'rfq_item':
        return true;
      default:
        return false;
    }
  }).length;
}

/**
 * Lo que impide validar una revisión (obs. cliente 2026-10-13): al menos un
 * ítem activo, ruteo y costeo por proceso de cada ítem y al menos un archivo.
 * La usan la ficha (borde rojo y botón bloqueado) y las Server Actions de
 * validar, para que servidor y pantalla no puedan discrepar.
 */
export function calcularFaltantesValidacion(
  entrada: EntradaFaltantesValidacion,
): FaltantesValidacionPropuesta {
  const itemsActivos = entrada.items
    .filter((item) => item.revisionId === entrada.revision.id && item.activo)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const itemsSinRuteo: string[] = [];
  const itemsSinCostear: string[] = [];
  const operacionesConTarifaRespaldo: string[] = [];
  const detalleRespaldo: string[] = [];
  for (const item of itemsActivos) {
    const filas = entrada.ruteo.filter((fila) => fila.itemId === item.id);
    if (filas.length === 0) itemsSinRuteo.push(item.codigo);
    else if (filas.some((fila) => fila.costeadoEn === null)) itemsSinCostear.push(item.codigo);
    const respaldo = filas.find(
      (fila) => fila.costeadoEn !== null && fila.tarifaFuente === 'RESPALDO',
    );
    if (respaldo) {
      operacionesConTarifaRespaldo.push(item.codigo);
      detalleRespaldo.push(respaldo.tarifaOrigen ?? '');
    }
  }

  const sinItemsActivos = itemsActivos.length === 0;
  const sinArchivos = contarArchivosRevision(entrada) === 0;

  const contenido: string[] = [];
  if (sinItemsActivos) contenido.push('al menos un ítem activo');
  for (const codigo of itemsSinRuteo) contenido.push(`ítem ${codigo}: ruteo por proceso`);
  for (const codigo of itemsSinCostear) contenido.push(`ítem ${codigo}: costear el ruteo`);
  if (sinArchivos) contenido.push('al menos un archivo');

  const confirmaciones: string[] = [];
  if (entrada.revision.requiereRevisionRuteo) confirmaciones.push('guardar el ruteo para confirmarlo');
  if (entrada.revision.requiereRevisionCosteo) confirmaciones.push('guardar los costos para confirmarlos');

  const advertencias: string[] = operacionesConTarifaRespaldo.map(
    (codigo, indice) =>
      `ítem ${codigo}: operación costeada con tarifa de respaldo${
        detalleRespaldo[indice] ? ` (${detalleRespaldo[indice]})` : ''
      }; configura la tarifa de su grupo en Tarifas / TC`,
  );

  return {
    sinItemsActivos,
    itemsSinRuteo,
    itemsSinCostear,
    operacionesConTarifaRespaldo,
    sinArchivos,
    confirmaciones,
    contenido,
    advertencias,
    mensajes: [...contenido, ...confirmaciones],
  };
}
