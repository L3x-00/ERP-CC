import type {
  EtapaPipeline,
  Oportunidad,
  PrioridadPipeline,
} from '@/modulos/pipeline/tipos/indice';

/**
 * Filtros de tablero para el pipeline (RFQ-13). Se aplican en el cliente sobre
 * las oportunidades ya cargadas, para no perder la vista Kanban por etapa ni
 * disparar refetch por cada tecla. RLS ya acotó el conjunto en el servidor.
 */
export type FiltrosTablero = {
  /** Texto libre: folio (OP/CNC), empresa, contacto o cliente ligado. */
  texto: string;
  etapa: EtapaPipeline | '';
  prioridad: PrioridadPipeline | '';
  etiqueta: string;
  /** RFQ-05/13: área/departamento presente en alguna línea de la cotización. */
  area: string;
  /** RFQ-02/13: cliente del catálogo ligado a la oportunidad (`cliente_id`). */
  clienteId: string;
  /** Fecha de creación desde (YYYY-MM-DD, inclusive). */
  desde: string;
  /** Fecha de creación hasta (YYYY-MM-DD, inclusive). */
  hasta: string;
  /** Solo trabajos internos (TI). */
  soloInternas: boolean;
};

export const FILTROS_TABLERO_INICIAL: FiltrosTablero = {
  texto: '',
  etapa: '',
  prioridad: '',
  etiqueta: '',
  area: '',
  clienteId: '',
  desde: '',
  hasta: '',
  soloInternas: false,
};

/** ¿Hay algún filtro activo (para habilitar "Limpiar")? */
export function hayFiltrosActivos(filtros: FiltrosTablero): boolean {
  return (
    filtros.texto.trim() !== '' ||
    filtros.etapa !== '' ||
    filtros.prioridad !== '' ||
    filtros.etiqueta !== '' ||
    filtros.area !== '' ||
    filtros.clienteId !== '' ||
    filtros.desde !== '' ||
    filtros.hasta !== '' ||
    filtros.soloInternas
  );
}

function coincideTexto(oportunidad: Oportunidad, termino: string): boolean {
  const t = termino.trim().toLowerCase();
  if (t === '') return true;
  return [
    oportunidad.folioOp,
    oportunidad.folioCnc,
    oportunidad.empresa,
    oportunidad.nombreContacto,
    oportunidad.clienteNombre,
  ].some((campo) => (campo ?? '').toLowerCase().includes(t));
}

/** Aplica los filtros de tablero sobre una lista de oportunidades. */
export function filtrarOportunidades(
  oportunidades: readonly Oportunidad[],
  filtros: FiltrosTablero,
): Oportunidad[] {
  return oportunidades.filter((oportunidad) => {
    if (!coincideTexto(oportunidad, filtros.texto)) return false;
    if (filtros.etapa !== '' && oportunidad.etapa !== filtros.etapa) return false;
    if (filtros.prioridad !== '' && oportunidad.prioridad !== filtros.prioridad) return false;
    if (filtros.etiqueta !== '' && !oportunidad.etiquetas.includes(filtros.etiqueta)) return false;
    if (filtros.soloInternas && !oportunidad.esOrdenInterna) return false;
    // RFQ-05/13: entra si CUALQUIERA de sus líneas pertenece al área filtrada.
    if (filtros.area !== '' && !(oportunidad.areasTrabajo ?? []).includes(filtros.area)) {
      return false;
    }
    // RFQ-02/13: cliente del catálogo ligado (las oportunidades sin cliente no
    // coinciden con un filtro de cliente concreto).
    if (filtros.clienteId !== '' && oportunidad.clienteId !== filtros.clienteId) return false;
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

/** Áreas/departamento distintas (RFQ-05/13), ordenadas, para el selector. */
export function areasDistintas(oportunidades: readonly Oportunidad[]): string[] {
  const conjunto = new Set<string>();
  for (const oportunidad of oportunidades) {
    for (const area of oportunidad.areasTrabajo ?? []) {
      const limpia = area.trim();
      if (limpia !== '') conjunto.add(limpia);
    }
  }
  return [...conjunto].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Clientes del catálogo presentes en las oportunidades (RFQ-02/13), ordenados. */
export function clientesDistintos(
  oportunidades: readonly Oportunidad[],
): { id: string; nombre: string }[] {
  const porId = new Map<string, string>();
  for (const oportunidad of oportunidades) {
    if (oportunidad.clienteId === null) continue;
    if (!porId.has(oportunidad.clienteId)) {
      porId.set(
        oportunidad.clienteId,
        oportunidad.clienteNombre?.trim() || 'Cliente sin nombre',
      );
    }
  }
  return [...porId.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
