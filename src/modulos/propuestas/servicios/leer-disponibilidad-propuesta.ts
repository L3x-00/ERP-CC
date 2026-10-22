import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { dividirEnLotes } from '@/modulos/ordenes/utilidades/lotes';
import { filaACargaCapacidadDiaria, type CargaCapacidadDiaria } from '@/modulos/planeacion/tipos/indice';
import type {
  GrupoCatalogoDisponibilidad,
  HorizonteDisponibilidad,
  ItemDisponibilidad,
  ProcesoCatalogoDisponibilidad,
  RecursoCapacidadDisponibilidad,
  RenglonRuteoDisponibilidad,
} from '@/modulos/propuestas/servicios/agregar-disponibilidad';

type Cliente = SupabaseClient<Database>;

/** Error de lectura: la consulta falla cerrada; el detalle queda en el log interno. */
export class ErrorLecturaDisponibilidad extends Error {
  constructor(public readonly origen: string, mensaje: string | undefined) {
    super(mensaje ?? 'sin_detalle');
    this.name = 'ErrorLecturaDisponibilidad';
  }
}

function comprobar(origen: string, error: { message: string } | null): void {
  if (error) throw new ErrorLecturaDisponibilidad(origen, error.message);
}

const TAMANO_PAGINA = 500;
const MAX_FILAS_POR_LECTURA = 50_000;

/** PostgREST puede truncar silenciosamente: leer todas las páginas o fallar cerrado. */
async function leerPaginas<T>(
  origen: string,
  consultar: (inicio: number, fin: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count: number | null;
  }>,
): Promise<T[]> {
  const filas: T[] = [];
  let total: number | null = null;
  for (;;) {
    const pagina = await consultar(filas.length, filas.length + TAMANO_PAGINA - 1);
    comprobar(origen, pagina.error);
    if (pagina.count === null || pagina.data === null || pagina.count > MAX_FILAS_POR_LECTURA) {
      throw new ErrorLecturaDisponibilidad(origen, 'lectura_incompleta');
    }
    if (total !== null && pagina.count !== total) {
      throw new ErrorLecturaDisponibilidad(origen, 'lectura_cambio_durante_consulta');
    }
    total = pagina.count;
    filas.push(...pagina.data);
    if (filas.length === total) return filas;
    if (pagina.data.length === 0 || filas.length > total) {
      throw new ErrorLecturaDisponibilidad(origen, 'lectura_incompleta');
    }
  }
}

export type ResultadoRevisionConsultable = 'consultable' | 'no_visible' | 'no_consultable';

const ESTADOS_CONSULTABLES = new Set(['SENT', 'FOLLOW_UP']);

/**
 * Comprueba con el cliente RLS del usuario que la propuesta y la revisión son
 * visibles, se pertenecen, la revisión está SENT/FOLLOW_UP y la propuesta no
 * está aceptada. «no_visible» no distingue inexistente de ajena.
 */
export async function verificarRevisionConsultable(
  cliente: Cliente,
  propuestaId: string,
  revisionId: string,
): Promise<ResultadoRevisionConsultable> {
  const propuesta = await cliente
    .from('propuestas')
    .select('id, accepted_revision_id')
    .eq('id', propuestaId)
    .maybeSingle();
  comprobar('propuestas', propuesta.error);
  if (!propuesta.data) return 'no_visible';

  const revision = await cliente
    .from('propuesta_revisiones')
    .select('id, propuesta_id, estado')
    .eq('id', revisionId)
    .eq('propuesta_id', propuestaId)
    .maybeSingle();
  comprobar('propuesta_revisiones', revision.error);
  if (!revision.data || revision.data.propuesta_id !== propuestaId) return 'no_visible';

  if (propuesta.data.accepted_revision_id !== null) return 'no_consultable';
  if (!ESTADOS_CONSULTABLES.has(revision.data.estado)) return 'no_consultable';
  return 'consultable';
}

export type RuteoRevisionDisponibilidad = {
  items: ItemDisponibilidad[];
  ruteo: RenglonRuteoDisponibilidad[];
  procesos: ProcesoCatalogoDisponibilidad[];
  grupos: GrupoCatalogoDisponibilidad[];
};

/** Ítems activos no descuento de la revisión exacta y sus renglones de ruteo (RLS). */
export async function leerRuteoRevision(
  cliente: Cliente,
  revisionId: string,
): Promise<RuteoRevisionDisponibilidad> {
  const filasItems = await leerPaginas('propuesta_items', (inicio, fin) => cliente
    .from('propuesta_items')
    .select('id, codigo, activo, es_descuento, revision_id', { count: 'exact' })
    .eq('revision_id', revisionId)
    .eq('activo', true)
    .eq('es_descuento', false)
    .order('id').range(inicio, fin));
  const items: ItemDisponibilidad[] = filasItems
    .filter((fila) => fila.revision_id === revisionId)
    .map((fila) => ({
      id: fila.id,
      codigo: fila.codigo,
      activo: fila.activo,
      esDescuento: fila.es_descuento,
    }));
  if (items.length === 0) return { items, ruteo: [], procesos: [], grupos: [] };

  const ruteo: RenglonRuteoDisponibilidad[] = [];
  for (const lote of dividirEnLotes([...new Set(items.map((item) => item.id))])) {
    const filas = await leerPaginas('propuesta_item_ruteo', (inicio, fin) => cliente
      .from('propuesta_item_ruteo')
      .select('id, item_id, proceso_id, grupo_equipo_id, setup_horas, run_horas, total_horas', { count: 'exact' })
      .in('item_id', lote)
      .order('id').range(inicio, fin));
    for (const fila of filas) {
      ruteo.push({
        id: fila.id,
        itemId: fila.item_id,
        procesoId: fila.proceso_id,
        grupoEquipoId: fila.grupo_equipo_id,
        setupHoras: Number(fila.setup_horas),
        runHoras: Number(fila.run_horas),
        totalHoras: fila.total_horas === null ? null : Number(fila.total_horas),
      });
    }
  }
  if (ruteo.length === 0) return { items, ruteo, procesos: [], grupos: [] };

  const procesos: ProcesoCatalogoDisponibilidad[] = [];
  for (const lote of dividirEnLotes([...new Set(ruteo.map((renglon) => renglon.procesoId))])) {
    const filas = await leerPaginas('catalogo_procesos', (inicio, fin) => cliente
      .from('catalogo_procesos')
      .select('id, codigo, nombre, grupo_equipo_id', { count: 'exact' })
      .in('id', lote)
      .order('id').range(inicio, fin));
    for (const fila of filas) {
      procesos.push({
        id: fila.id,
        codigo: fila.codigo,
        nombre: fila.nombre,
        grupoEquipoId: fila.grupo_equipo_id,
      });
    }
  }

  const filasGrupos = await leerPaginas('grupos_equipo', (inicio, fin) => cliente
    .from('grupos_equipo').select('id, codigo, nombre, activo', { count: 'exact' })
    .order('id').range(inicio, fin));
  const grupos = filasGrupos.map((fila) => ({
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    activo: fila.activo,
  }));

  return { items, ruteo, procesos, grupos };
}

/**
 * Capacidad C9.3 y recursos activos mínimos de los grupos requeridos. Usa
 * service_role: solo debe llamarse después de autorizar al usuario y verificar
 * la revisión con su cliente RLS.
 */
export async function leerCapacidadGrupos(
  admin: Cliente,
  gruposIds: readonly string[],
  horizonte: HorizonteDisponibilidad,
): Promise<{ recursos: RecursoCapacidadDisponibilidad[]; cargas: CargaCapacidadDiaria[] }> {
  if (gruposIds.length === 0) return { recursos: [], cargas: [] };

  const recursos: RecursoCapacidadDisponibilidad[] = [];
  for (const lote of dividirEnLotes([...new Set(gruposIds)])) {
    const filas = await leerPaginas('recursos_planeacion', (inicio, fin) => admin
      .from('recursos_planeacion')
      .select('id, grupo_equipo_id', { count: 'exact' })
      .eq('activo', true)
      .in('grupo_equipo_id', lote)
      .order('id').range(inicio, fin));
    recursos.push(...filas.map((fila) => ({ id: fila.id, grupoEquipoId: fila.grupo_equipo_id })));
  }
  if (recursos.length === 0) return { recursos, cargas: [] };

  try {
    const cargas: CargaCapacidadDiaria[] = [];
    for (const lote of dividirEnLotes(recursos.map((recurso) => recurso.id))) {
      const filas = await leerPaginas('obtener_carga_capacidad_diaria', (inicio, fin) => admin
        .rpc('obtener_carga_capacidad_diaria', {
          p_fecha_inicio: horizonte.fechaInicio,
          p_fecha_fin: horizonte.fechaFin,
        }, { count: 'exact' })
        .in('recurso_id', lote)
        .order('fecha_programada').order('recurso_id').order('turno')
        .range(inicio, fin));
      cargas.push(...filas.map(filaACargaCapacidadDiaria));
    }
    return { recursos, cargas };
  } catch (error) {
    throw new ErrorLecturaDisponibilidad(
      'obtener_carga_capacidad_diaria',
      error instanceof Error ? error.message : undefined,
    );
  }
}
