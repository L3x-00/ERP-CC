'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { guardarProximaAccionServicio } from '@/modulos/catalogos/servicios/indice';
import type { ProximaAccionCatalogo } from '@/modulos/catalogos/tipos/indice';
import { esquemaGuardarProximaAccion } from '@/modulos/catalogos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { ejecutarAccionCatalogo } from './utilidades-acciones';

export async function guardarProximaAccionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ProximaAccionCatalogo>> {
  const analisis = esquemaGuardarProximaAccion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_editar'))) {
    return { exito: false, error: 'Sin permiso para editar catálogos' };
  }

  const { id, codigo, esOtro } = analisis.data;
  return ejecutarAccionCatalogo(
    usuario,
    id ? 'actualizar_proxima_accion_catalogo' : 'crear_proxima_accion_catalogo',
    id ?? codigo,
    () => guardarProximaAccionServicio(crearClienteSupabaseAdmin(), analisis.data),
    { codigo, esOtro },
  );
}
