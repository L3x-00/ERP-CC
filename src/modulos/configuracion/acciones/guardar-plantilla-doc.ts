'use server';

import type { Json } from '@/compartido/tipos/supabase';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { actualizarConfiguracionSeccion } from '@/modulos/configuracion/servicios/indice';
import type { ConfiguracionSistema } from '@/modulos/configuracion/tipos/indice';
import { esquemaPlantillaDocumento } from '@/modulos/configuracion/validaciones/indice';
import { ejecutarAccionConfiguracion } from './utilidades-acciones';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function guardarPlantillaDocAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ConfiguracionSistema>> {
  const analisis = esquemaPlantillaDocumento.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'configuracion'))) return { exito: false, error: 'Sin permiso para configurar el sistema' };

  const { clave, ...plantilla } = analisis.data;
  const datos = { [clave]: plantilla } as unknown as Json;
  return ejecutarAccionConfiguracion(
    usuario,
    'guardar_plantilla_documento',
    clave,
    () => actualizarConfiguracionSeccion(crearClienteSupabaseAdmin(), 'plantillas', datos, usuario.id),
    { seccion: 'plantillas', clave },
  );
}
