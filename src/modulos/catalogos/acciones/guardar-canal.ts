'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { guardarCanalServicio } from '@/modulos/catalogos/servicios/indice';
import type { CanalCatalogo } from '@/modulos/catalogos/tipos/indice';
import { esquemaGuardarCanal } from '@/modulos/catalogos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { ejecutarAccionCatalogo } from './utilidades-acciones';

/** Índice parcial que garantiza un único canal "Otro" (migración DC-02). */
const INDICE_CANAL_OTRO = 'ux_catalogo_canales_otro';

const MENSAJE_CANAL_OTRO =
  'Solo un canal puede ser “Otro”: desmarca el canal que lo tiene antes de asignarlo aquí';

/**
 * El mensaje genérico de duplicado no distingue entre código repetido y la
 * regla de "Otro"; esta detección es local para no filtrar el nombre del
 * índice al usuario.
 */
function esConflictoCanalOtro(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message, details } = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  if (code !== '23505') return false;
  const texto = [message, details].filter((parte) => typeof parte === 'string').join(' ');
  return texto.includes(INDICE_CANAL_OTRO);
}

export async function guardarCanalAccion(entrada: unknown): Promise<RespuestaAccion<CanalCatalogo>> {
  const analisis = esquemaGuardarCanal.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_editar'))) {
    return { exito: false, error: 'Sin permiso para editar catálogos' };
  }

  const { id, codigo, esOtro } = analisis.data;
  let conflictoOtro = false;
  const respuesta = await ejecutarAccionCatalogo(
    usuario,
    id ? 'actualizar_canal_catalogo' : 'crear_canal_catalogo',
    id ?? codigo,
    async () => {
      try {
        return await guardarCanalServicio(crearClienteSupabaseAdmin(), analisis.data);
      } catch (error) {
        conflictoOtro = esConflictoCanalOtro(error);
        throw error;
      }
    },
    { codigo, esOtro },
  );

  if (!respuesta.exito && conflictoOtro) {
    return { exito: false, error: MENSAJE_CANAL_OTRO };
  }
  return respuesta;
}
