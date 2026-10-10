'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import {
  generarNotaEntregaServicio,
  mensajeErrorEntrega,
  type NotaEntregaGenerada,
} from '@/modulos/produccion/servicios/indice';
import { esquemaCrearNotaEntrega } from '@/modulos/produccion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerActorProduccionParaMutacion } from '@/modulos/produccion/acciones/utilidades-acciones';

export async function generarNotaEntregaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<NotaEntregaGenerada>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaCrearNotaEntrega.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerActorProduccionParaMutacion(
    'generar_nota_entrega',
    analisis.data.ordenId,
  );
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_produccion'))) {
    return { exito: false, error: 'Sin permiso para generar notas de entrega' };
  }

  try {
    const nota = await generarNotaEntregaServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      creadoPor: usuario.id,
    });
    await registrarLog(usuario, 'generar_nota_entrega', 'produccion', nota.id, {
      ordenId: analisis.data.ordenId,
      folio: nota.folio,
      esParcial: nota.esParcial,
      cantidadPartidas: analisis.data.partidas.length,
    }, correlationId);
    return { exito: true, datos: nota };
  } catch (error) {
    console.error('[PRODUCCION] Error al generar nota de entrega:', error);
    await registrarLog(usuario, 'nota_entrega_rechazada', 'produccion', analisis.data.ordenId, {
      cantidadPartidas: analisis.data.partidas.length,
    }, correlationId);
    return { exito: false, error: mensajeErrorEntrega(error) };
  }
}
