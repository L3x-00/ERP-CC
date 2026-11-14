'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerCargaCapacidadDiariaServicio } from '@/modulos/planeacion/servicios/indice';
import {
  recomendarPlanMultidia,
  type DiaPlanMultidia,
} from '@/modulos/planeacion/utilidades/plan-multidia';
import { sumarDias } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import { esquemaProponerPlanMultidia } from '@/modulos/planeacion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

const DIAS_BUSQUEDA_PLAN = 21;

export interface PlanMultidiaPropuesto {
  desdeFecha: string;
  dias: DiaPlanMultidia[];
  horasTotales: number;
}

/**
 * C16: recomienda cómo repartir una operación que no cabe en un turno. Es una
 * previsualización: al guardar, la RPC vuelve a validar cada día bajo lock.
 */
export async function proponerPlanMultidiaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<PlanMultidiaPropuesto | null>> {
  const analisis = esquemaProponerPlanMultidia.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_planeacion'))) {
    return { exito: false, error: 'Sin permiso para programar recursos' };
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
      sumarDias(desdeFecha, DIAS_BUSQUEDA_PLAN - 1),
    );
    const dias = recomendarPlanMultidia(cargas, {
      recursoId,
      turno,
      horasTotales: horasEstimadas,
      desdeFecha,
      // El planeador ya eligió una fecha concreta; se respeta y se continúa al
      // día siguiente aunque sea fin de semana. La capacidad se valida igual.
      incluirFinesDeSemana: true,
    });
    return {
      exito: true,
      datos: dias
        ? { desdeFecha, dias, horasTotales: horasEstimadas }
        : null,
    };
  } catch (error) {
    console.error('[PLANEACION] Error al proponer plan de varios días:', error);
    return { exito: false, error: 'No se pudo proponer un plan de varios días' };
  }
}
