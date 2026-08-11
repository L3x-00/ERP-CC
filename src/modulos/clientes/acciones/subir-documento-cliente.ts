'use server';

import { randomUUID } from 'node:crypto';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { esquemaSubirDocumento } from '@/modulos/clientes/validaciones/cliente-schema';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

const BUCKET = 'documentos-cliente';
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB
const TIPOS_MIME_PERMITIDOS = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

/** Sanea un nombre de archivo: quita rutas y caracteres peligrosos, conserva extensión. */
function sanearNombreArchivo(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? 'documento';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'documento';
}

/**
 * Sube un documento del cliente (CSF, contrato, etc.) a Storage y registra su
 * metadato.
 *
 * Recibe `FormData` (el binario no serializa como JSON). Valida metadatos con
 * Zod y el archivo (tamaño y MIME). Ruta '<clienteId>/<uuid>-<archivo>' para
 * que la RLS por carpeta funcione y no colisione. Si el metadato falla tras
 * subir, se limpia el binario. Auditoría al final.
 */
export async function subirDocumentoClienteAccion(
  formData: FormData,
): Promise<RespuestaAccion<{ id: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaSubirDocumento.safeParse({
    clienteId: formData.get('clienteId'),
    tipo: formData.get('tipo'),
    nombreArchivo: formData.get('nombreArchivo'),
  });
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  if (!(await can(usuario, 'ver_clientes'))) {
    return { exito: false, error: 'Sin permiso para subir documentos' };
  }

  const archivo = formData.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { exito: false, error: 'Archivo requerido' };
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return { exito: false, error: 'El archivo excede el tamaño máximo (10 MB)' };
  }
  if (!TIPOS_MIME_PERMITIDOS.has(archivo.type)) {
    return { exito: false, error: 'Tipo de archivo no permitido (PDF, JPG o PNG)' };
  }

  const { clienteId, tipo, nombreArchivo } = analisis.data;
  const nombreSeguro = sanearNombreArchivo(nombreArchivo);
  const ruta = `${clienteId}/${randomUUID()}-${nombreSeguro}`;

  const admin = crearClienteSupabaseAdmin();

  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (errorSubida) {
    return { exito: false, error: 'No se pudo subir el archivo' };
  }

  const { data: fila, error: errorMeta } = await admin
    .from('documentos_cliente')
    .insert({
      cliente_id: clienteId,
      tipo,
      nombre_archivo: nombreSeguro,
      ruta_storage: ruta,
      subido_por: usuario.id,
    })
    .select('id')
    .single();

  if (errorMeta || !fila) {
    // El binario quedó huérfano si no se pudo registrar el metadato: se limpia.
    await admin.storage.from(BUCKET).remove([ruta]);
    return { exito: false, error: 'No se pudo registrar el documento' };
  }

  await registrarLog(usuario, 'subir_documento', 'clientes', clienteId, {
    documentoId: fila.id,
    tipo,
  });

  return { exito: true, datos: { id: fila.id } };
}
