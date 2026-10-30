import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  normalizarTextoCatalogo,
  resolverGrupoRequeridoOperacion,
  resolverGruposRequeridos,
  type CompatibilidadRecursosPlaneacion,
  type OperacionCompatibilidadPlaneacion,
} from '@/modulos/planeacion/utilidades/compatibilidad';

/**
 * C9.2/P10: lee los grupos de equipo (catálogo de procesos, recursos y grupos)
 * con el cliente RLS del usuario y devuelve mapas serializables para el panel.
 * Alimenta el orden, el aviso y el impedimento de guardar (P-04); tolerante: si
 * la lectura falla —RLS sin `catalogo_ver` o columna aún sin migrar— registra el
 * motivo y el panel queda «sin dato» (no advierte ni bloquea).
 */

export interface PartidaCompatibilidadPlaneacion {
  partidaId: string;
  procesos: readonly string[];
  maquinaAsignada: string | null;
  /** Operaciones del ruteo con su grupo capturado en la propuesta. */
  operaciones?: readonly OperacionCompatibilidadPlaneacion[];
}

export interface EntradaCompatibilidadPlaneacion {
  partidas: readonly PartidaCompatibilidadPlaneacion[];
}

const SIN_COMPATIBILIDAD: CompatibilidadRecursosPlaneacion = {
  grupoPorRecurso: {},
  gruposRequeridosPorPartida: {},
  gruposRequeridosPorOperacion: {},
  nombrePorGrupo: {},
};

export async function obtenerCompatibilidadRecursosServicio(
  cliente: SupabaseClient<Database>,
  entrada: EntradaCompatibilidadPlaneacion,
): Promise<CompatibilidadRecursosPlaneacion> {
  try {
    const [procesos, recursos, grupos] = await Promise.all([
      cliente.from('catalogo_procesos').select('codigo, nombre, grupo_equipo_id'),
      cliente.from('recursos_planeacion').select('id, codigo, grupo_equipo_id'),
      cliente.from('grupos_equipo').select('id, nombre'),
    ]);
    const errorLectura = procesos.error ?? recursos.error ?? grupos.error;
    if (errorLectura) {
      console.error('Planeación: no se pudieron leer los grupos de equipo', errorLectura.message);
      return SIN_COMPATIBILIDAD;
    }

    const nombrePorGrupo = new Map((grupos.data ?? []).map((grupo) => [grupo.id, grupo.nombre]));
    const grupoPorProceso = new Map<string, string | null>();
    for (const proceso of procesos.data ?? []) {
      for (const clave of [proceso.codigo, proceso.nombre]) {
        if (clave) grupoPorProceso.set(normalizarTextoCatalogo(clave), proceso.grupo_equipo_id);
      }
    }

    const grupoPorCodigoRecurso = new Map<string, string | null>();
    const grupoPorRecurso: CompatibilidadRecursosPlaneacion['grupoPorRecurso'] = {};
    for (const recurso of recursos.data ?? []) {
      if (recurso.codigo) {
        grupoPorCodigoRecurso.set(normalizarTextoCatalogo(recurso.codigo), recurso.grupo_equipo_id);
      }
      grupoPorRecurso[recurso.id] = recurso.grupo_equipo_id
        ? {
            id: recurso.grupo_equipo_id,
            nombre: nombrePorGrupo.get(recurso.grupo_equipo_id) ?? 'Grupo sin nombre',
          }
        : null;
    }

    const gruposRequeridosPorPartida: CompatibilidadRecursosPlaneacion['gruposRequeridosPorPartida'] = {};
    const gruposRequeridosPorOperacion: CompatibilidadRecursosPlaneacion['gruposRequeridosPorOperacion'] = {};
    for (const partida of entrada.partidas) {
      gruposRequeridosPorPartida[partida.partidaId] = resolverGruposRequeridos({
        procesos: partida.procesos,
        maquinaAsignada: partida.maquinaAsignada,
        grupoPorProceso,
        grupoPorCodigoRecurso,
      });
      for (const operacion of partida.operaciones ?? []) {
        gruposRequeridosPorOperacion[operacion.metaProcesoId] = resolverGrupoRequeridoOperacion(
          operacion,
          grupoPorProceso,
        );
      }
    }

    return {
      grupoPorRecurso,
      gruposRequeridosPorPartida,
      gruposRequeridosPorOperacion,
      nombrePorGrupo: Object.fromEntries(nombrePorGrupo),
    };
  } catch (error) {
    console.error('Planeación: compatibilidad de recursos no disponible', error);
    return SIN_COMPATIBILIDAD;
  }
}
