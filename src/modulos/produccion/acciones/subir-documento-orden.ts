'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  EXTENSIONES_DOCUMENTO_ORDEN,
  TAMANO_MAXIMO_DOCUMENTO_ORDEN,
  nombreDocumentoSeguro,
  obtenerOrdenDocumental,
} from '@/modulos/produccion/servicios/documentos-orden-servicio';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';
import { subirArchivo } from '@/nucleo/almacenamiento/subir-archivo';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Sube un documento durante la ejecución (ORD-09): recibe `FormData` para
 * transportar el archivo binario y lo guarda en la carpeta de la oportunidad de
 * la orden, validando permiso, tamaño y extensión. La ruta se prefija con la
 * cotización, así que la lectura posterior (`validarRutaDocumento`) la reconoce.
 */
export async function subirDocumentoOrdenAccion(
  formData: FormData,
): Promise<RespuestaAccion<{ ruta: string; nombre: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_produccion'))) {
    return { exito: false, error: 'Sin permiso para subir documentos de producción' };
  }

  const idAnalisis = z.uuid().safeParse(formData.get('ordenId'));
  if (!idAnalisis.success) return { exito: false, error: 'Orden inválida' };

  const archivo = formData.get('archivo');
  if (!(archivo instanceof File)) return { exito: false, error: 'Archivo requerido' };
  if (archivo.size === 0 || archivo.size > TAMANO_MAXIMO_DOCUMENTO_ORDEN) {
    return { exito: false, error: 'El archivo debe pesar entre 1 byte y 20 MB' };
  }

  const extension = archivo.name.split('.').pop()?.toLowerCase() ?? '';
  if (!(EXTENSIONES_DOCUMENTO_ORDEN as readonly string[]).includes(extension)) {
    return { exito: false, error: 'Tipo de archivo no permitido para piso' };
  }

  try {
    const admin = crearClienteSupabaseAdmin();
    const orden = await obtenerOrdenDocumental(admin, idAnalisis.data);
    if (!orden) return { exito: false, error: 'La orden no existe' };
    if (!orden.cotizacionId) {
      return { exito: false, error: 'La orden no tiene cotización de origen para guardar documentos' };
    }

    const nombre = nombreDocumentoSeguro(archivo.name);
    const ruta = `${orden.cotizacionId}/${Date.now()}-${nombre}`;
    await subirArchivo(admin, BUCKET_ADJUNTOS, ruta, await archivo.arrayBuffer(), archivo.type);
    await registrarLog(usuario, 'subir_documento_orden', 'produccion', orden.id, { ruta });

    return { exito: true, datos: { ruta, nombre } };
  } catch (error) {
    console.error('[PRODUCCION] Error al subir documento de la orden:', error);
    return { exito: false, error: 'No se pudo subir el documento' };
  }
}
