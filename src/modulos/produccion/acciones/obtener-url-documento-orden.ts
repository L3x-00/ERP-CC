'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerOrdenDocumental,
  validarRutaDocumento,
} from '@/modulos/produccion/servicios/documentos-orden-servicio';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';
import { crearUrlDescarga } from '@/nucleo/almacenamiento/descargar-archivo';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z
  .object({ ordenId: z.uuid(), ruta: z.string().min(1).max(500) })
  .strict();

/**
 * URL firmada de corta vida para abrir un documento de la orden desde el piso.
 * La ruta debe pertenecer a la carpeta de la oportunidad de esa orden; la firma
 * se emite con service_role tras validar el permiso, nunca con RLS de Pipeline.
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
    if (!validarRutaDocumento(analisis.data.ruta, orden.cotizacionId)) {
      return { exito: false, error: 'El documento no pertenece a esta orden' };
    }

    const url = await crearUrlDescarga(admin, BUCKET_ADJUNTOS, analisis.data.ruta, 300);
    return { exito: true, datos: { url } };
  } catch (error) {
    console.error('[PRODUCCION] Error al firmar documento de la orden:', error);
    return { exito: false, error: 'No se pudo generar el enlace del documento' };
  }
}
