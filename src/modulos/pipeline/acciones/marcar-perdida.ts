'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { esquemaMarcarPerdida } from '@/modulos/pipeline/validaciones/esquemas-transicion-etapa';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Marca una oportunidad como perdida registrando el motivo obligatorio.
 * Solo aplica sobre oportunidades activas (no ya cerradas como ganada/perdida).
 */
export async function marcarPerdidaAccion(entrada: unknown): Promise<RespuestaAccion> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaMarcarPerdida.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { id, motivoPerdida, notasPerdida } = analisis.data;

  const servidor = await crearClienteSupabaseServidor();

  const cargada = await obtenerOportunidadPorId(servidor, id);
  if (!cargada) {
    return { exito: false, error: 'No encontrada' };
  }

  const etapa = cargada.oportunidad.etapa;
  if (etapa === 'ganada' || etapa === 'perdida') {
    return { exito: false, error: 'La oportunidad ya está cerrada' };
  }

  // Cambio de etapa (columna controlada) vía admin; acceso ya verificado con la
  // carga RLS de arriba.
  const admin = crearClienteSupabaseAdmin();
  const { error } = await admin
    .from('pipeline')
    .update({
      etapa: 'perdida',
      motivo_perdida: motivoPerdida,
      notas_perdida: notasPerdida ?? null,
    })
    .eq('id', id);
  if (error) {
    return { exito: false, error: 'No se pudo marcar como perdida' };
  }

  await registrarLog(usuario, 'marcar_perdida', 'pipeline', id, { motivo: motivoPerdida });

  return { exito: true };
}
