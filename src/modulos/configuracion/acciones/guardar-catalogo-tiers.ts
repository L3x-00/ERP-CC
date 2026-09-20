'use server';

import type { Json } from '@/compartido/tipos/supabase';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { actualizarConfiguracionSeccion } from '@/modulos/configuracion/servicios/indice';
import type { ConfiguracionSistema } from '@/modulos/configuracion/tipos/indice';
import { esquemaCatalogoTiers } from '@/modulos/configuracion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { ejecutarAccionConfiguracion } from './utilidades-acciones';

export async function guardarCatalogoTiersAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ConfiguracionSistema>> {
  const analisis = esquemaCatalogoTiers.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'configuracion'))) return { exito: false, error: 'Sin permiso para configurar el sistema' };

  return ejecutarAccionConfiguracion(
    usuario,
    'guardar_catalogo_tiers',
    'main',
    () => actualizarConfiguracionSeccion(
      crearClienteSupabaseAdmin(),
      'tiers',
      analisis.data as unknown as Json,
      usuario.id,
    ),
    { seccion: 'tiers' },
  );
}
