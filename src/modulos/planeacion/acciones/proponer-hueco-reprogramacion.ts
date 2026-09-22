'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerCargaCapacidadDiariaServicio,
  seleccionarPrimerHueco,
  type HuecoDisponible,
} from '@/modulos/planeacion/servicios/indice';
import { sumarDias } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import { esquemaProponerHuecoPlaneacion } from '@/modulos/planeacion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Días de búsqueda hacia adelante; sin feriados, los fines de semana se omiten. */
const DIAS_BUSQUEDA_HUECO = 21;

/**
 * OBS-19: propone el primer día hábil con capacidad comprobada para reprogramar
 * una partida cuando el turno elegido ya no tiene horas libres. Es una
 * previsualización de UI; la RPC transaccional vuelve a validar capacidad bajo
 * lock al confirmar.
 */
export async function proponerHuecoReprogramacionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<HuecoDisponible | null>> {
  const analisis = esquemaProponerHuecoPlaneacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_planeacion'))) {
    return { exito: false, error: 'Sin permiso para reprogramar recursos' };
  }

  try {
    const { recursoId, turno, horasEstimadas, desdeFecha } = analisis.data;
    const cliente = await crearClienteSupabaseServidor();
    const { data: recurso } = await cliente
      .from('recursos_planeacion')
      .select('id')
      .eq('id', recursoId)
      .eq('activo', true)
      .maybeSingle();
    if (!recurso) {
      return { exito: false, error: 'El recurso ya no está disponible' };
    }

    const cargas = await obtenerCargaCapacidadDiariaServicio(
      crearClienteSupabaseAdmin(),
      desdeFecha,
      sumarDias(desdeFecha, DIAS_BUSQUEDA_HUECO - 1),
    );
    const hueco = seleccionarPrimerHueco(cargas, {
      recursoId,
      turno,
      horasEstimadas,
      desdeFecha,
    });
    return { exito: true, datos: hueco };
  } catch (error) {
    console.error('[PLANEACION] Error al buscar hueco disponible:', error);
    return { exito: false, error: 'No se pudo buscar un hueco disponible' };
  }
}
