import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import {
  MARCA_DOCUMENTO_NEUTRA,
  type MarcaDocumento,
} from '@/compartido/tipos/impresion';
import { obtenerConfiguracionGeneral } from '@/modulos/configuracion/servicios/configuracion-servicio';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Identidad de la empresa para documentos impresos (logo, color y pie).
 * Si la configuración falla o está incompleta, el documento sale igual con la
 * marca neutra: imprimir nunca debe romperse por un dato de presentación.
 */
export async function obtenerMarcaDocumentoServicio(
  cliente?: SupabaseClient<Database>,
): Promise<MarcaDocumento> {
  try {
    const configuracion = await obtenerConfiguracionGeneral(cliente ?? crearClienteSupabaseAdmin());
    const plantilla = configuracion.plantillasDoc.T1;
    return {
      nombre: configuracion.empresa.nombre || MARCA_DOCUMENTO_NEUTRA.nombre,
      razonSocial: configuracion.empresa.razonSocial,
      rfc: configuracion.empresa.rfc,
      direccion: configuracion.empresa.direccion,
      telefono: configuracion.empresa.telefono,
      email: configuracion.empresa.email,
      logoUrl: configuracion.empresa.logoUrl,
      colorAcento: plantilla?.colorAcento ?? MARCA_DOCUMENTO_NEUTRA.colorAcento,
      textoPiePagina: plantilla?.textoPiePagina ?? '',
    };
  } catch (error) {
    console.error('[ORDENES] Marca documental no disponible:', error);
    return MARCA_DOCUMENTO_NEUTRA;
  }
}
