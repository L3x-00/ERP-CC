'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  EXTENSIONES_DOCUMENTO_ORDEN,
  TAMANO_MAXIMO_DOCUMENTO_ORDEN,
  nombreDocumentoSeguro,
  obtenerOrdenDocumental,
} from '@/modulos/produccion/servicios/documentos-orden-servicio';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';
import { registrarArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import {
  campoRutaSubida,
  camposPrepararSubida,
  esquemaDescartarSubida,
} from '@/nucleo/almacenamiento/archivos/esquemas-subida';
import {
  confirmarSubidaDirecta,
  descartarSubidaDirecta,
  prepararSubidaDirecta,
  type SubidaPreparada,
} from '@/nucleo/almacenamiento/archivos/subida-directa';
import { extensionDe, sanearNombreArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const destinoDocumento = { ordenId: z.uuid(), nombre: z.string().trim().min(1).max(250) };
const esquemaPreparar = z.object({ ...destinoDocumento, ...camposPrepararSubida }).strict();
const esquemaConfirmar = z.object({ ...destinoDocumento, ...campoRutaSubida }).strict();

type ClienteAdmin = ReturnType<typeof crearClienteSupabaseAdmin>;

/** Regla de piso (ORD-09): solo planos, PDF e imágenes, de 1 byte a 20 MB. */
function reglaDocumentoPiso(nombre: string, tamano?: number): string | null {
  if (tamano !== undefined && tamano > TAMANO_MAXIMO_DOCUMENTO_ORDEN) {
    return 'El archivo debe pesar entre 1 byte y 20 MB';
  }
  if (!(EXTENSIONES_DOCUMENTO_ORDEN as readonly string[]).includes(extensionDe(nombre))) {
    return 'Tipo de archivo no permitido para piso';
  }
  return null;
}

/**
 * Sesión, permiso de Producción y carpeta de la orden: los documentos viven en
 * la carpeta de la oportunidad de origen, así que la orden debe tenerla.
 */
async function carpetaDeOrden(
  admin: ClienteAdmin,
  ordenId: string,
): Promise<{ usuario: UsuarioAutenticado; ordenIdReal: string; cotizacionId: string } | { error: string }> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_produccion'))) {
    return { error: 'Sin permiso para subir documentos de producción' };
  }
  try {
    const orden = await obtenerOrdenDocumental(admin, ordenId);
    if (!orden) return { error: 'La orden no existe' };
    if (!orden.cotizacionId) {
      return { error: 'La orden no tiene cotización de origen para guardar documentos' };
    }
    return { usuario, ordenIdReal: orden.id, cotizacionId: orden.cotizacionId };
  } catch (error) {
    console.error('[PRODUCCION] Error al cargar la orden del documento:', error);
    return { error: 'No se pudo subir el documento' };
  }
}

/**
 * Emite la URL firmada para subir un documento durante la ejecución (ORD-09)
 * directo a Storage (H-B1-29). La ruta queda bajo `rfq/<cotización>/…`, que la
 * lectura posterior (`validarRutaDocumento`) reconoce.
 */
export async function prepararDocumentoOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<SubidaPreparada>> {
  const analisis = esquemaPreparar.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos de archivo inválidos' };
  const { ordenId, nombre, tamano, mime } = analisis.data;
  const regla = reglaDocumentoPiso(nombre, tamano);
  if (regla) return { exito: false, error: regla };

  const admin = crearClienteSupabaseAdmin();
  const carpeta = await carpetaDeOrden(admin, ordenId);
  if ('error' in carpeta) return { exito: false, error: carpeta.error };

  const preparada = await prepararSubidaDirecta(admin, {
    bucket: BUCKET_ADJUNTOS,
    entidad: 'rfq',
    entidadId: carpeta.cotizacionId,
    usuarioId: carpeta.usuario.id,
    solicitud: { nombre, tamano, mime },
  });
  return preparada.ok ? { exito: true, datos: preparada.datos } : { exito: false, error: preparada.error };
}

/**
 * Revalida el documento subido y registra su metadata en el modelo único
 * (SII-B1.9): sin fila, el documento no se lista ni puede firmarse con
 * trazabilidad.
 */
export async function confirmarDocumentoOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ ruta: string; nombre: string }>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaConfirmar.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos de archivo inválidos' };
  const { ordenId, nombre, ruta } = analisis.data;
  const regla = reglaDocumentoPiso(nombre);
  if (regla) return { exito: false, error: regla };

  const admin = crearClienteSupabaseAdmin();
  const carpeta = await carpetaDeOrden(admin, ordenId);
  if ('error' in carpeta) return { exito: false, error: carpeta.error };
  const { usuario, ordenIdReal, cotizacionId } = carpeta;

  const confirmada = await confirmarSubidaDirecta(
    admin,
    { bucket: BUCKET_ADJUNTOS, entidad: 'rfq', entidadId: cotizacionId, usuarioId: usuario.id, ruta, nombre },
    (objeto) =>
      registrarArchivo(admin, {
        entidad: 'rfq',
        entidadId: cotizacionId,
        clase: 'OTROS',
        nombreOriginal: nombre,
        nombreErp: sanearNombreArchivo(nombre),
        bucket: BUCKET_ADJUNTOS,
        rutaStorage: ruta,
        mime: objeto.mime,
        tamanoBytes: objeto.tamano,
        subidoPor: usuario.id,
      }),
  );
  if (!confirmada.ok) return { exito: false, error: confirmada.error };

  await registrarLog(usuario, 'subir_documento_orden', 'produccion', ordenIdReal, { ruta }, correlationId);
  return { exito: true, datos: { ruta, nombre: nombreDocumentoSeguro(nombre) } };
}

/** Descarta una subida directa inconclusa del propio usuario. */
export async function descartarDocumentoOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<null>> {
  const analisis = esquemaDescartarSubida.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Ruta inválida' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const descartada = await descartarSubidaDirecta(crearClienteSupabaseAdmin(), {
    bucket: BUCKET_ADJUNTOS,
    ruta: analisis.data.ruta,
    usuarioId: usuario.id,
  });
  return descartada.ok ? { exito: true, datos: null } : { exito: false, error: descartada.error };
}
