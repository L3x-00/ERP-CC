'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { registrarArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import { esquemaDescartarSubida } from '@/nucleo/almacenamiento/archivos/esquemas-subida';
import {
  confirmarSubidaDirecta,
  descartarSubidaDirecta,
  prepararSubidaDirecta,
  type SubidaPreparada,
} from '@/nucleo/almacenamiento/archivos/subida-directa';
import { sanearNombreArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';
import {
  esquemaConfirmarDocumentoCliente,
  esquemaPrepararDocumentoCliente,
} from '@/modulos/clientes/validaciones/cliente-schema';

const BUCKET = 'documentos-cliente';

/** Sesión y permiso de documentos de cliente, y cliente existente. */
async function autorizarDocumento(
  clienteId: string,
): Promise<{ usuario: UsuarioAutenticado } | { error: string }> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { error: 'No autorizado' };
  const [puedeVerClientes, puedeDocumentar] = await Promise.all([
    can(usuario, 'ver_clientes'),
    can(usuario, 'cliente_documentos'),
  ]);
  if (!puedeVerClientes && !puedeDocumentar) return { error: 'Sin permiso para subir documentos' };
  const { data } = await crearClienteSupabaseAdmin()
    .from('clientes')
    .select('id')
    .eq('id', clienteId)
    .maybeSingle();
  if (!data) return { error: 'El cliente no existe' };
  return { usuario };
}

/**
 * Emite la URL firmada para subir un documento del cliente (CSF, contrato,
 * etc.) directo a Storage (H-B1-29: el binario no pasa por la Server Action).
 */
export async function prepararDocumentoClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<SubidaPreparada>> {
  const analisis = esquemaPrepararDocumentoCliente.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { clienteId, nombreArchivo, tamano, mime } = analisis.data;
  const acceso = await autorizarDocumento(clienteId);
  if ('error' in acceso) return { exito: false, error: acceso.error };

  const preparada = await prepararSubidaDirecta(crearClienteSupabaseAdmin(), {
    bucket: BUCKET,
    entidad: 'cliente',
    entidadId: clienteId,
    usuarioId: acceso.usuario.id,
    solicitud: { nombre: nombreArchivo, tamano, mime },
  });
  return preparada.ok ? { exito: true, datos: preparada.datos } : { exito: false, error: preparada.error };
}

/**
 * Revalida el objeto subido y registra su metadata en el modelo único
 * `archivos` (SII-B1.9, ADR-SII-06). Reemplazar conserva el nombre ERP (clave
 * de versionado) aunque el binario tenga otro nombre (SII-B2.6).
 */
export async function confirmarDocumentoClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string }>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaConfirmarDocumentoCliente.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { clienteId, tipo, nombreArchivo, nombreErp: nombreErpForzado, ruta } = analisis.data;
  const acceso = await autorizarDocumento(clienteId);
  if ('error' in acceso) return { exito: false, error: acceso.error };
  const { usuario } = acceso;
  const admin = crearClienteSupabaseAdmin();

  const confirmada = await confirmarSubidaDirecta(
    admin,
    { bucket: BUCKET, entidad: 'cliente', entidadId: clienteId, usuarioId: usuario.id, ruta, nombre: nombreArchivo },
    (objeto) =>
      registrarArchivo(admin, {
        entidad: 'cliente',
        entidadId: clienteId,
        temaCodigo: tipo,
        clase: 'documento',
        nombreOriginal: nombreArchivo,
        nombreErp: sanearNombreArchivo(nombreErpForzado ?? nombreArchivo),
        bucket: BUCKET,
        rutaStorage: ruta,
        mime: objeto.mime,
        tamanoBytes: objeto.tamano,
        subidoPor: usuario.id,
      }),
  );
  if (!confirmada.ok) return { exito: false, error: confirmada.error };

  const { id, version } = confirmada.datos;
  await registrarLog(usuario, 'subir_documento', 'clientes', clienteId, { archivoId: id, tipo, version }, correlationId);
  return { exito: true, datos: { id } };
}

/** Descarta una subida directa inconclusa del propio usuario. */
export async function descartarDocumentoClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<null>> {
  const analisis = esquemaDescartarSubida.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Ruta inválida' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const descartada = await descartarSubidaDirecta(crearClienteSupabaseAdmin(), {
    bucket: BUCKET,
    ruta: analisis.data.ruta,
    usuarioId: usuario.id,
  });
  return descartada.ok ? { exito: true, datos: null } : { exito: false, error: descartada.error };
}
