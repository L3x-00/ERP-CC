'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { guardarEspesorServicio } from '@/modulos/catalogos/servicios/indice';
import type { EspesorCatalogo } from '@/modulos/catalogos/tipos/indice';
import { esquemaGuardarEspesor } from '@/modulos/catalogos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { ejecutarAccionCatalogo } from './utilidades-acciones';

export async function guardarEspesorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<EspesorCatalogo>> {
  const analisis = esquemaGuardarEspesor.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_editar'))) {
    return { exito: false, error: 'Sin permiso para editar catálogos' };
  }

  const { id, etiqueta, materialId } = analisis.data;
  return ejecutarAccionCatalogo(
    usuario,
    id ? 'actualizar_espesor_catalogo' : 'crear_espesor_catalogo',
    id ?? etiqueta,
    () => guardarEspesorServicio(crearClienteSupabaseAdmin(), analisis.data),
    { etiqueta, materialId },
  );
}
