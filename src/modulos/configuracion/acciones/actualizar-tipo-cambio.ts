'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { actualizarConfiguracionSeccion } from '@/modulos/configuracion/servicios/indice';
import type { ConfiguracionSistema } from '@/modulos/configuracion/tipos/indice';
import { esquemaTipoCambio } from '@/modulos/configuracion/validaciones/indice';
import { ejecutarAccionConfiguracion } from './utilidades-acciones';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function actualizarTipoCambioAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ConfiguracionSistema>> {
  const analisis = esquemaTipoCambio.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'configuracion'))) return { exito: false, error: 'Sin permiso para configurar el sistema' };

  return ejecutarAccionConfiguracion(
    usuario,
    'actualizar_tipo_cambio',
    'main',
    () => actualizarConfiguracionSeccion(
      crearClienteSupabaseAdmin(),
      'tipo_cambio',
      analisis.data.tipoCambioUsd,
      usuario.id,
    ),
    { seccion: 'tipo_cambio', actualizado: true },
  );
}
