'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerActorProduccion } from '@/modulos/produccion/acciones/utilidades-acciones';

function normalizar(texto: string | null | undefined): string {
  return (texto ?? '').trim().replace(/\s+/gu, ' ').toLowerCase();
}

const esquema = z.object({
  ordenId: z.uuid('ID de orden inválido'),
  partidaId: z.uuid('ID de partida inválido'),
  metaProcesoId: z.uuid('ID de operación inválido').optional(),
  programacionId: z.uuid('ID de programación inválido').optional(),
}).strict();

export interface ResultadoDisponibilidadInicio {
  disponible: boolean;
  motivo?: 'sin_equipos' | 'sin_proceso';
  grupoNombre?: string;
  areaNombre?: string;
}

/**
 * Comprobación de solo lectura antes de abrir el checklist: replica la regla
 * de `preparar_reclamo_operador` para avisar sin esperar a la mutación.
 */
export async function validarDisponibilidadInicioAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoDisponibilidadInicio>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'Sesión de operador no válida' };
  if (!(await can(actor, 'produccion_operar')) && !(await can(actor, 'gestionar_produccion'))) {
    return { exito: false, error: 'Sin permiso para consultar la disponibilidad' };
  }

  try {
    const admin = crearClienteSupabaseAdmin();
    const [partida, areas, grupos] = await Promise.all([
      admin
        .from('partidas_orden_produccion')
        .select('id, orden_id, area_trabajo_codigo, propuesta_item_id, maquina_asignada')
        .eq('id', analisis.data.partidaId)
        .eq('orden_id', analisis.data.ordenId)
        .maybeSingle(),
      admin
        .from('areas_trabajo_config')
        .select('codigo, nombre, padre_codigo, area_planeacion'),
      admin.from('grupos_equipo').select('id, codigo, nombre').eq('activo', true),
    ]);
    if (partida.error) throw partida.error;
    if (!partida.data) return { exito: false, error: 'La partida ya no pertenece a la orden' };

    const areaPorCodigo = new Map(
      (areas.data ?? []).map((area) => [area.codigo, area] as const),
    );
    let areaMacro: string | null = null;
    let areaNombre: string | undefined;
    let actual = partida.data.area_trabajo_codigo
      ? areaPorCodigo.get(partida.data.area_trabajo_codigo)
      : undefined;
    if (actual) areaNombre = actual.nombre;
    const vistos = new Set<string>();
    while (actual && !vistos.has(actual.codigo)) {
      vistos.add(actual.codigo);
      if (actual.area_planeacion) {
        areaMacro = actual.area_planeacion;
        break;
      }
      actual = actual.padre_codigo ? areaPorCodigo.get(actual.padre_codigo) : undefined;
    }
    if (!areaNombre && areaMacro) areaNombre = areaPorCodigo.get(areaMacro)?.nombre ?? undefined;

    let grupoId: string | null = null;
    if (analisis.data.metaProcesoId) {
      const meta = await admin
        .from('metas_proceso_partida')
        .select('id, nombre, secuencia')
        .eq('id', analisis.data.metaProcesoId)
        .eq('partida_id', analisis.data.partidaId)
        .maybeSingle();
      const nombreMeta = normalizar(meta.data?.nombre);
      // Misma jerarquía que `privado.grupo_equipo_requerido_operacion`: ruteo,
      // catálogo y, por último, la estación anotada en la partida.
      if (partida.data.propuesta_item_id && meta.data) {
        const ruteo = await admin
          .from('propuesta_item_ruteo')
          .select('grupo_equipo_id')
          .eq('item_id', partida.data.propuesta_item_id)
          .eq('secuencia', meta.data.secuencia)
          .maybeSingle();
        grupoId = ruteo.data?.grupo_equipo_id ?? null;
      }
      if (!grupoId && nombreMeta) {
        const catalogo = await admin
          .from('catalogo_procesos')
          .select('grupo_equipo_id, nombre, codigo, orden')
          .order('orden', { ascending: true });
        const coincidente = (catalogo.data ?? []).find((proceso) => (
          normalizar(proceso.nombre) === nombreMeta || normalizar(proceso.codigo) === nombreMeta
        ));
        grupoId = coincidente?.grupo_equipo_id ?? null;
      }
      if (!grupoId && partida.data.maquina_asignada) {
        const nombreMaquina = normalizar(partida.data.maquina_asignada);
        const recursosMaquina = await admin
          .from('recursos_planeacion')
          .select('id, codigo, grupo_equipo_id');
        const maquina = (recursosMaquina.data ?? []).find(
          (recurso) => normalizar(recurso.codigo) === nombreMaquina,
        );
        grupoId = maquina?.grupo_equipo_id ?? null;
      }
    }
    if (!grupoId && analisis.data.programacionId) {
      const programacion = await admin
        .from('programacion_areas')
        .select('id, recurso_id')
        .eq('id', analisis.data.programacionId)
        .eq('partida_id', analisis.data.partidaId)
        .maybeSingle();
      if (programacion.data?.recurso_id) {
        const recurso = await admin
          .from('recursos_planeacion')
          .select('id, grupo_equipo_id')
          .eq('id', programacion.data.recurso_id)
          .maybeSingle();
        grupoId = recurso.data?.grupo_equipo_id ?? null;
      }
    }

    // Sin grupo exigido la RPC admite cualquier equipo activo del área: no bloquear.
    let consulta = admin
      .from('recursos_planeacion')
      .select('id, nombre')
      .eq('activo', true);
    if (grupoId) consulta = consulta.eq('grupo_equipo_id', grupoId);
    if (areaMacro) consulta = consulta.eq('area', areaMacro);
    const { data: recursos, error: errorRecursos } = await consulta.limit(1);
    if (errorRecursos) throw errorRecursos;

    const grupo = (grupos.data ?? []).find((item) => item.id === grupoId);
    return {
      exito: true,
      datos: {
        disponible: (recursos ?? []).length > 0,
        motivo: (recursos ?? []).length > 0 ? undefined : 'sin_equipos',
        grupoNombre: grupo?.nombre ?? undefined,
        areaNombre,
      },
    };
  } catch (error) {
    console.error('[PRODUCCION] Error al verificar disponibilidad de inicio:', error);
    return { exito: false, error: 'No se pudo verificar la disponibilidad; vuelve a intentarlo.' };
  }
}
