'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import {
  construirRutaArchivo,
  descartarSubidaArchivo,
  registrarArchivo,
} from '@/nucleo/almacenamiento/archivos/servicio';
import { sanearNombreArchivo, validarSubidaArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';
import { esquemaSubirDocumento } from '@/modulos/clientes/validaciones/cliente-schema';

const BUCKET = 'documentos-cliente';

/**
 * Sube un documento del cliente (CSF, contrato, etc.) al bucket privado y
 * registra su metadata en el modelo único `archivos` (SII-B1.9, ADR-SII-06).
 *
 * Recibe `FormData` (el binario no serializa como JSON). Valida metadatos con
 * Zod y el archivo con el perfil de la entidad `cliente`. La ruta
 * `<entidad>/<clienteId>/<uuid>-<nombre>` evita colisiones y mantiene la RLS
 * por carpeta. Si el metadato falla tras subir, se limpia el binario.
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

  const [puedeVerClientes, puedeDocumentar] = await Promise.all([
    can(usuario, 'ver_clientes'),
    can(usuario, 'cliente_documentos'),
  ]);
  if (!puedeVerClientes && !puedeDocumentar) {
    return { exito: false, error: 'Sin permiso para subir documentos' };
  }

  const archivo = formData.get('archivo');
  if (!(archivo instanceof File)) {
    return { exito: false, error: 'Archivo requerido' };
  }

  const validacion = validarSubidaArchivo('cliente', {
    nombre: archivo.name,
    tamano: archivo.size,
  });
  if (!validacion.ok) {
    return { exito: false, error: validacion.error };
  }

  const { clienteId, tipo, nombreArchivo } = analisis.data;
  const nombreErp = sanearNombreArchivo(nombreArchivo);
  const ruta = construirRutaArchivo('cliente', clienteId, nombreArchivo);
  const mime = archivo.type || 'application/octet-stream';
  const admin = crearClienteSupabaseAdmin();

  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: mime, upsert: false });
  if (errorSubida) {
    return { exito: false, error: 'No se pudo subir el archivo' };
  }

  try {
    const registrado = await registrarArchivo(admin, {
      entidad: 'cliente',
      entidadId: clienteId,
      temaCodigo: tipo,
      clase: 'documento',
      nombreOriginal: nombreArchivo,
      nombreErp,
      bucket: BUCKET,
      rutaStorage: ruta,
      mime,
      tamanoBytes: archivo.size,
      subidoPor: usuario.id,
    });

    await registrarLog(usuario, 'subir_documento', 'clientes', clienteId, {
      archivoId: registrado.id,
      tipo,
      version: registrado.version,
    });

    return { exito: true, datos: { id: registrado.id } };
  } catch {
    // El binario quedaría huérfano si no se pudo registrar el metadato.
    await descartarSubidaArchivo(admin, BUCKET, ruta);
    return { exito: false, error: 'No se pudo registrar el documento' };
  }
}
