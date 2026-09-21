'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerDocumentoNotaEntrega,
  type DocumentoNotaEntrega,
} from '@/modulos/produccion/servicios/nota-entrega-documento-servicio';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z.object({ notaId: z.uuid() }).strict();

/** Documento imprimible de la nota de entrega (OBS-13) con su confirmación. */
export async function obtenerDocumentoNotaEntregaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DocumentoNotaEntrega>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_produccion'))) {
    return { exito: false, error: 'Sin permiso para consultar notas de entrega' };
  }

  try {
    const documento = await obtenerDocumentoNotaEntrega(
      crearClienteSupabaseAdmin(),
      analisis.data.notaId,
    );
    if (!documento) return { exito: false, error: 'La nota no existe' };
    return { exito: true, datos: documento };
  } catch (error) {
    console.error('[PRODUCCION] Error al componer la nota de entrega:', error);
    return { exito: false, error: 'No se pudo generar el documento de la nota' };
  }
}
