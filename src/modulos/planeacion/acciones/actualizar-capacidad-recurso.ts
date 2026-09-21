'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

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
      .max(24, 'La jornada máxima es 24 h')
      .nullable(),
  })
  .strict();

/**
 * D-02: actualiza equipos y override de jornada de un recurso. La capacidad
 * instalada (equipos × jornada) se calcula en PostgreSQL con estos datos; aquí
 * solo se persisten con permiso de Planeación y auditoría.
 */
export async function actualizarCapacidadRecursoAccion(
  entrada: unknown,
): Promise<RespuestaAccion> {
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
  });

  return { exito: true };
}
