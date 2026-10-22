'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  agregarDisponibilidad,
  horizonteDisponibilidad,
  idsGruposRequeridos,
} from '@/modulos/propuestas/servicios/agregar-disponibilidad';
import {
  ErrorLecturaDisponibilidad,
  leerCapacidadGrupos,
  leerRuteoRevision,
  verificarRevisionConsultable,
} from '@/modulos/propuestas/servicios/leer-disponibilidad-propuesta';
import type { ResumenDisponibilidadPropuesta } from '@/modulos/propuestas/tipos/disponibilidad';

const esquema = z
  .object({
    propuestaId: z.uuid('Identificador inválido'),
    revisionId: z.uuid('Identificador inválido'),
  })
  .strict();

const ERROR_LECTURA = 'No se pudo consultar la disponibilidad. Inténtalo de nuevo.';

/**
 * Consulta informativa de capacidad para la fecha compromiso comercial. Solo
 * lee: no crea órdenes, solicitudes, programaciones ni reservas, y no fija la
 * fecha. Las horas salen del ruteo persistido de la revisión (nunca del
 * navegador) y la capacidad de la RPC C9.3, que exige service_role; por eso el
 * cliente admin se crea solo después de autorizar y verificar la revisión con
 * el cliente RLS del usuario, y la respuesta solo lleva agregados por grupo.
 */
export async function consultarDisponibilidadPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResumenDisponibilidadPropuesta>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { propuestaId, revisionId } = analisis.data;

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'propuesta_vista')) || !(await can(usuario, 'propuesta_aceptar'))) {
    return { exito: false, error: 'Sin permiso para consultar la disponibilidad' };
  }

  try {
    const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
    const servidor = await crearClienteSupabaseServidor();

    const consultable = await verificarRevisionConsultable(servidor, propuestaId, revisionId);
    if (consultable === 'no_visible') {
      return { exito: false, error: 'La revisión no está disponible para consultar' };
    }
    if (consultable === 'no_consultable') {
      return {
        exito: false,
        error: 'Solo se consulta en una revisión enviada o en seguimiento que no esté aceptada',
      };
    }

    const horizonte = horizonteDisponibilidad(new Date());
    const datosRuteo = await leerRuteoRevision(servidor, revisionId);
    const gruposIds = idsGruposRequeridos(datosRuteo);

    let capacidad: Awaited<ReturnType<typeof leerCapacidadGrupos>> = { recursos: [], cargas: [] };
    if (gruposIds.length > 0) {
      const { crearClienteSupabaseAdmin } = await import('@/nucleo/supabase/admin');
      capacidad = await leerCapacidadGrupos(crearClienteSupabaseAdmin(), gruposIds, horizonte);
    }

    return {
      exito: true,
      datos: agregarDisponibilidad({ revisionId, horizonte, ...datosRuteo, ...capacidad }),
    };
  } catch (error) {
    console.error(
      '[PROPUESTAS] Consulta de disponibilidad fallida:',
      error instanceof ErrorLecturaDisponibilidad ? error.origen : 'inesperado',
      error instanceof Error ? error.message : error,
    );
    return { exito: false, error: ERROR_LECTURA };
  }
}
