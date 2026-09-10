'use server';

import type { Json } from '@/compartido/tipos/supabase';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { actualizarConfiguracionSeccion } from '@/modulos/configuracion/servicios/indice';
import type { ConfiguracionSistema } from '@/modulos/configuracion/tipos/indice';
import { esquemaTarifasCotizador } from '@/modulos/configuracion/validaciones/indice';
import { ejecutarAccionConfiguracion } from './utilidades-acciones';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function guardarTarifasCotizadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ConfiguracionSistema>> {
  const analisis = esquemaTarifasCotizador.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'configuracion'))) return { exito: false, error: 'Sin permiso para configurar el sistema' };

  return ejecutarAccionConfiguracion(
    usuario,
    'guardar_tarifas_cotizador',
    'main',
    () => actualizarConfiguracionSeccion(
      crearClienteSupabaseAdmin(),
      'tarifas',
      analisis.data as unknown as Json,
      usuario.id,
    ),
    { seccion: 'tarifas' },
  );
}
