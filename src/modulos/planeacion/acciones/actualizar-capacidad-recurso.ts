'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { HORAS_JORNADA_SEMANA } from '@/modulos/planeacion/utilidades/horario-laboral';

const esquema = z
  .object({
    recursoId: z.uuid('Recurso inválido'),
    cantidadEquipos: z
      .number()
      .int('Debe ser un número entero')
      .min(1, 'Mínimo 1 equipo')
      .max(100, 'Máximo 100 equipos'),
    jornadaOverrideHoras: z
      .number()
      .min(0.5, 'La jornada mínima es 0.5 h')
      .max(
        HORAS_JORNADA_SEMANA,
        `La jornada máxima es de ${HORAS_JORNADA_SEMANA} h (lunes a viernes)`,
      )
      .nullable(),
  })
  .strict();

/**
 * D-02: actualiza equipos y override de jornada de un recurso. La capacidad
 * instalada (equipos × jornada) se calcula en PostgreSQL con estos datos; aquí
 * solo se persisten con permiso de Planeación y auditoría.
 *
 * C24: la jornada es continua (8 h de lunes a viernes, 4 h el sábado) y el
 * turno es solo una etiqueta visual. Ya no se registran turnos base: la consulta
 * diaria calcula la capacidad con equipos × jornada e ignora el turno.
 */
export async function actualizarCapacidadRecursoAccion(
  entrada: unknown,
): Promise<RespuestaAccion> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_planeacion'))) {
    return { exito: false, error: 'Sin permiso para configurar la capacidad' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { data, error } = await admin
    .from('recursos_planeacion')
    .update({
      cantidad_equipos: analisis.data.cantidadEquipos,
      capacidad_jornada_override_horas: analisis.data.jornadaOverrideHoras,
    })
    .eq('id', analisis.data.recursoId)
    .select('id, cantidad_equipos, capacidad_jornada_override_horas')
    .maybeSingle();

  if (error) {
    console.error('[PLANEACION] Error al actualizar capacidad:', error);
    return { exito: false, error: 'No se pudo guardar la capacidad del recurso' };
  }
  if (!data) return { exito: false, error: 'El recurso no existe' };

  await registrarLog(usuario, 'actualizar_capacidad_recurso', 'planeacion', data.id, {
    cantidadEquipos: data.cantidad_equipos,
    jornadaOverrideHoras: data.capacidad_jornada_override_horas,
  }, correlationId);

  return { exito: true };
}
