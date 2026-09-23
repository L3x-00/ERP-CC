'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { actualizarAreasOperadorServicio } from '@/modulos/configuracion/servicios/indice';
import { esquemaAreasOperador } from '@/modulos/configuracion/validaciones/indice';
import { ejecutarAccionConfiguracion } from './utilidades-acciones';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * OBS-09/PRD-11: reemplaza las áreas habilitadas de un operador. El reemplazo
 * es atómico (A05): si la RPC rechaza la entrada, la asignación anterior queda
 * intacta y el operador NO se queda sin restricciones. Sin áreas asignadas el
 * operador no queda restringido (transición); el rechazo real de trabajo vive
 * en `asignar_operador_a_partida_op` e `iniciar_sesion_trabajo_operador`.
 */
export async function actualizarAreasOperadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<null>> {
  const analisis = esquemaAreasOperador.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'configuracion'))) {
    return { exito: false, error: 'Sin permiso para configurar el sistema' };
  }

  return ejecutarAccionConfiguracion(
    usuario,
    'actualizar_areas_operador',
    analisis.data.operadorId,
    async () => {
      await actualizarAreasOperadorServicio(
        crearClienteSupabaseAdmin(),
        analisis.data,
        usuario.id,
      );
      return null;
    },
    { areas: analisis.data.areas.length },
  );
}
