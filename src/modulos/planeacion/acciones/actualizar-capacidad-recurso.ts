'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { JORNADA_ESTANDAR_HORAS } from '@/modulos/planeacion/utilidades/capacidad';

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
 *
 * Cliente 2026-11-10: la consulta diaria enumera los turnos registrados, así que
 * un recurso sin turnos guardaba equipos/jornada pero el calendario seguía sin
 * horas. Al guardar su capacidad se registra el turno base (matutino, jornada
 * estándar de 8 h) cuando el recurso no tiene ninguno.
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

  const turnoBase = await asegurarTurnoBase(admin, data.id);
  if (!turnoBase.exito) return { exito: false, error: turnoBase.error };

  await registrarLog(usuario, 'actualizar_capacidad_recurso', 'planeacion', data.id, {
    cantidadEquipos: data.cantidad_equipos,
    jornadaOverrideHoras: data.capacidad_jornada_override_horas,
    turnoBaseCreado: turnoBase.creado,
  }, correlationId);

  return { exito: true };
}

type ClienteAdmin = ReturnType<typeof crearClienteSupabaseAdmin>;

/**
 * Registra el turno base `matutino` (8 h estándar) solo cuando el recurso no
 * tiene ningún turno. `ignoreDuplicates` evita pisar una configuración creada
 * en paralelo y mantiene intactos los recursos que ya tienen turnos.
 */
async function asegurarTurnoBase(
  admin: ClienteAdmin,
  recursoId: string,
): Promise<{ exito: true; creado: boolean } | { exito: false; error: string }> {
  const { data: turnos, error: errorTurnos } = await admin
    .from('capacidades_recurso_turno')
    .select('turno')
    .eq('recurso_id', recursoId)
    .limit(1);

  if (errorTurnos) {
    console.error('[PLANEACION] Error al leer turnos del recurso:', errorTurnos);
    return { exito: false, error: 'No se pudo revisar la capacidad por turno del recurso' };
  }
  if ((turnos ?? []).length > 0) return { exito: true, creado: false };

  const { error: errorTurno } = await admin
    .from('capacidades_recurso_turno')
    .upsert(
      {
        recurso_id: recursoId,
        turno: 'matutino',
        horas_capacidad: JORNADA_ESTANDAR_HORAS,
      },
      { onConflict: 'recurso_id,turno', ignoreDuplicates: true },
    );

  if (errorTurno) {
    console.error('[PLANEACION] Error al registrar el turno base:', errorTurno);
    return { exito: false, error: 'Se guardaron equipos y jornada, pero falta registrar el turno base del equipo' };
  }

  return { exito: true, creado: true };
}
