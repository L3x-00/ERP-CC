'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  listarDocumentosOrden,
  obtenerOrdenDocumental,
} from '@/modulos/produccion/servicios/documentos-orden-servicio';
import { firmarLecturaArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z
  .object({ ordenId: z.uuid(), archivoId: z.uuid() })
  .strict();

/**
 * URL firmada de corta vida para abrir un documento de la orden desde el piso.
 * El ID debe estar congelado en el snapshot, pertenecer al historial propio de
 * la Orden o corresponder a una carga previa recuperada por auditoría. La firma
 * se emite con service_role solo después de comprobar pertenencia y disponibilidad.
 */
export async function obtenerUrlDocumentoOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ url: string }>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_produccion'))) {
    return { exito: false, error: 'Sin permiso para abrir documentos de producción' };
  }

  try {
    const admin = crearClienteSupabaseAdmin();
    const orden = await obtenerOrdenDocumental(admin, analisis.data.ordenId);
    if (!orden) return { exito: false, error: 'La orden no existe' };
    const documentos = await listarDocumentosOrden(admin, orden);
    if (!documentos.some(
      (documento) => documento.id === analisis.data.archivoId && documento.disponible,
    )) {
      return { exito: false, error: 'El documento no pertenece a esta orden' };
    }

    const url = await firmarLecturaArchivo(admin, analisis.data.archivoId, 300);
    return { exito: true, datos: { url } };
  } catch (error) {
    console.error('[PRODUCCION] Error al firmar documento de la orden:', error);
    return { exito: false, error: 'No se pudo generar el enlace del documento' };
  }
}
