import type { Oportunidad, PrioridadPipeline } from '@/modulos/pipeline/tipos/indice';

/**
 * Filtros de tablero para el pipeline (RFQ-13). Se aplican en el cliente sobre
 * las oportunidades ya cargadas, para no perder la vista Kanban por etapa ni
 * disparar refetch por cada tecla. RLS ya acotó el conjunto en el servidor.
 */
export type FiltrosTablero = {
  /** Texto libre: folio (OP/CNC), empresa o contacto. */
  texto: string;
  prioridad: PrioridadPipeline | '';
  etiqueta: string;
  /** Fecha de creación desde (YYYY-MM-DD, inclusive). */
  desde: string;
  /** Fecha de creación hasta (YYYY-MM-DD, inclusive). */
  hasta: string;
  /** Solo trabajos internos (TI). */
  soloInternas: boolean;
};

export const FILTROS_TABLERO_INICIAL: FiltrosTablero = {
  texto: '',
  prioridad: '',
  etiqueta: '',
  desde: '',
  hasta: '',
  soloInternas: false,
};

/** ¿Hay algún filtro activo (para habilitar "Limpiar")? */
export function hayFiltrosActivos(filtros: FiltrosTablero): boolean {
  return (
    filtros.texto.trim() !== '' ||
    filtros.prioridad !== '' ||
    filtros.etiqueta !== '' ||
    filtros.desde !== '' ||
    filtros.hasta !== '' ||
    filtros.soloInternas
  );
}

function coincideTexto(oportunidad: Oportunidad, termino: string): boolean {
  const t = termino.trim().toLowerCase();
  if (t === '') return true;
  return [oportunidad.folioOp, oportunidad.folioCnc, oportunidad.empresa, oportunidad.nombreContacto]
    .some((campo) => (campo ?? '').toLowerCase().includes(t));
}

/** Aplica los filtros de tablero sobre una lista de oportunidades. */
export function filtrarOportunidades(
  oportunidades: readonly Oportunidad[],
  filtros: FiltrosTablero,
): Oportunidad[] {
  return oportunidades.filter((oportunidad) => {
    if (!coincideTexto(oportunidad, filtros.texto)) return false;
    if (filtros.prioridad !== '' && oportunidad.prioridad !== filtros.prioridad) return false;
    if (filtros.etiqueta !== '' && !oportunidad.etiquetas.includes(filtros.etiqueta)) return false;
    if (filtros.soloInternas && !oportunidad.esOrdenInterna) return false;
    // Comparación lexicográfica de fechas ISO: válida para YYYY-MM-DD.
    const dia = (oportunidad.creadoEn ?? '').slice(0, 10);
    if (filtros.desde !== '' && dia < filtros.desde) return false;
    if (filtros.hasta !== '' && dia > filtros.hasta) return false;
    return true;
  });
}

/** Etiquetas distintas presentes en las oportunidades, ordenadas, para el selector. */
export function etiquetasDistintas(oportunidades: readonly Oportunidad[]): string[] {
  const conjunto = new Set<string>();
  for (const oportunidad of oportunidades) {
    for (const etiqueta of oportunidad.etiquetas) {
      const limpia = etiqueta.trim();
      if (limpia !== '') conjunto.add(limpia);
    }
  }
  return [...conjunto].sort((a, b) => a.localeCompare(b, 'es'));
}
