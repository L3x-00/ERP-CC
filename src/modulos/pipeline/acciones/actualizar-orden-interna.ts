'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { esquemaOrdenInterna } from '@/modulos/pipeline/validaciones/esquemas-prospecto';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Marca o desmarca una oportunidad como trabajo interno (TI) — RFQ-09.
 *
 * Solo tiene efecto mientras la oportunidad está abierta: una vez ganada la
 * orden ya heredó la condición (y no debe cambiarse desde aquí), y una perdida
 * no llega a producir orden. La escritura usa cliente admin tras verificar
 * dueño/admin/`ver_pipeline_equipo` con la carga RLS, igual que el resto de
 * transiciones de pipeline.
 */
export async function actualizarOrdenInternaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ esOrdenInterna: boolean }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaOrdenInterna.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { id, esOrdenInterna } = analisis.data;

  const servidor = await crearClienteSupabaseServidor();
  const cargada = await obtenerOportunidadPorId(servidor, id);
  if (!cargada) {
    return { exito: false, error: 'No encontrada' };
  }

  if (
    cargada.oportunidad.vendedorId !== usuario.id &&
    usuario.rol !== 'admin' &&
    !(await can(usuario, 'ver_pipeline_equipo'))
  ) {
    return { exito: false, error: 'No encontrada' };
  }

  if (cargada.oportunidad.etapa === 'ganada' || cargada.oportunidad.etapa === 'perdida') {
    return { exito: false, error: 'La condición interna solo se cambia con la oportunidad abierta' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { error } = await admin
    .from('pipeline')
    .update({ es_orden_interna: esOrdenInterna })
    .eq('id', id);
  if (error) {
    return { exito: false, error: 'No se pudo actualizar la condición interna' };
  }

  await registrarLog(usuario, 'actualizar_orden_interna', 'pipeline', id, { esOrdenInterna });

  return { exito: true, datos: { esOrdenInterna } };
}
