'use server';

import { createHash } from 'node:crypto';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import {
  construirRutaArchivo,
  descartarSubidaArchivo,
  registrarArchivo,
} from '@/nucleo/almacenamiento/archivos/servicio';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { hoyIso } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import { traducirErrorPropuesta } from '@/modulos/propuestas/servicios/errores-propuesta';
import { construirDocumentoPropuesta } from '@/modulos/propuestas/servicios/pdf/documento-propuesta';
import { generarPdfBorrador } from '@/modulos/propuestas/servicios/pdf/escritor-pdf';
import { jsonASnapshotCabecera } from '@/modulos/propuestas/tipos/indice';
import { esquemaGenerarPdfRevision } from '@/modulos/propuestas/validaciones/esquemas-propuestas';

const BUCKET = 'propuestas-pdf';

export type ResultadoGenerarPdf = {
  pdfId: string;
  archivoId: string;
  version: number;
  yaExistia: boolean;
};

/**
 * SII-B4.7: genera el PDF privado de una revisión READY_TO_SEND.
 *
 * - Contenido público (sin costo/margen/horas/ruteo/notas internas).
 * - Idempotente: mismo contenido (hash SHA-256) ⇒ devuelve el PDF existente.
 * - Si el registro falla después de subir, se limpia el binario y el metadato.
 */
export async function generarPdfRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoGenerarPdf>> {
  const analisis = esquemaGenerarPdfRevision.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'propuesta_generar_pdf'))) {
    return { exito: false, error: 'Sin permiso para generar el PDF de la propuesta' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { data: revision, error: errorRevision } = await admin
    .from('propuesta_revisiones')
    .select('*')
    .eq('id', analisis.data.revisionId)
    .maybeSingle();
  if (errorRevision || !revision) {
    return { exito: false, error: 'La revisión no existe' };
  }
  if (revision.estado !== 'READY_TO_SEND') {
    return { exito: false, error: 'Genera el PDF cuando la revisión esté lista para enviar' };
  }

  const { data: items } = await admin
    .from('propuesta_items')
    .select('*')
    .eq('revision_id', revision.id)
    .order('codigo', { ascending: true });

  const snapshot = jsonASnapshotCabecera(revision.snapshot_cabecera);
  const documento = construirDocumentoPropuesta({
    folioRevision: revision.folio_revision,
    fecha: hoyIso(new Date(revision.validada_en ?? revision.actualizado_en)),
    moneda: snapshot.moneda,
    cliente: snapshot.cliente ?? {
      razonSocial: null,
      nombreComercial: null,
      rfc: null,
      correo: null,
    },
    contacto: snapshot.contacto,
    condicionesPago: snapshot.condicionesPago,
    ivaPorcentaje: snapshot.ivaPorcentaje,
    items: (items ?? []).map((item) => ({
      codigo: item.codigo,
      descripcion: item.descripcion,
      cantidad: Number(item.cantidad),
      precioUnitario: Number(item.precio_unitario),
      esDescuento: item.es_descuento,
      activo: item.activo,
    })),
  });

  const bytes = generarPdfBorrador(documento);
  const hash = createHash('sha256').update(bytes).digest('hex');

  // Idempotencia por contenido: si ya existe el mismo PDF, no se regenera.
  const { data: existente } = await admin
    .from('propuesta_pdfs')
    .select('id, archivo_id, version')
    .eq('revision_id', revision.id)
    .eq('contenido_hash', hash)
    .maybeSingle();
  if (existente) {
    return {
      exito: true,
      datos: {
        pdfId: existente.id,
        archivoId: existente.archivo_id,
        version: existente.version,
        yaExistia: true,
      },
    };
  }

  const nombreArchivo = `Propuesta ${revision.folio_revision}.pdf`;
  const ruta = construirRutaArchivo('propuesta_revision', revision.id, nombreArchivo);
  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(ruta, bytes, { contentType: 'application/pdf', upsert: false });
  if (errorSubida) {
    console.error('[PROPUESTAS] No se pudo subir el PDF:', errorSubida.message);
    return { exito: false, error: 'No se pudo subir el PDF de la propuesta' };
  }

  let archivoId: string | null = null;
  try {
    const registrado = await registrarArchivo(admin, {
      entidad: 'propuesta_revision',
      entidadId: revision.id,
      temaCodigo: 'pdf',
      clase: 'pdf',
      nombreOriginal: nombreArchivo,
      nombreErp: `${revision.folio_revision}.pdf`,
      bucket: BUCKET,
      rutaStorage: ruta,
      mime: 'application/pdf',
      tamanoBytes: bytes.length,
      subidoPor: usuario.id,
    });
    archivoId = registrado.id;

    const correlationId = nuevoCorrelationId();
    const { data, error } = await admin.rpc('registrar_pdf_revision', {
      p_revision_id: revision.id,
      p_archivo_id: registrado.id,
      p_contenido_hash: hash,
      p_actor: usuario.id,
      p_correlation_id: correlationId,
    });
    if (error || data === null || typeof data !== 'object' || Array.isArray(data)) {
      console.error('[PROPUESTAS] Registro de PDF rechazado:', error?.message);
      await registrarLog(
        usuario,
        'registrar_pdf_revision_rechazado',
        'propuestas',
        revision.id,
        { codigo: (error?.message ?? 'sin_respuesta').slice(0, 120) },
        correlationId,
      );
      return {
        exito: false,
        error: traducirErrorPropuesta(error?.message ?? '', error?.details ?? undefined),
      };
    }

    const bruto = data as Record<string, unknown>;
    const pdfId = typeof bruto.pdfId === 'string' ? bruto.pdfId : null;
    const version = typeof bruto.version === 'number' ? bruto.version : 1;
    if (!pdfId) {
      return { exito: false, error: 'Respuesta inválida del servidor' };
    }

    await registrarLog(
      usuario,
      'generar_pdf_revision',
      'propuestas',
      revision.id,
      { pdfId, version: version, hash },
      correlationId,
    );

    return { exito: true, datos: { pdfId, archivoId: registrado.id, version, yaExistia: false } };
  } catch (error) {
    console.error('[PROPUESTAS] Fallo al registrar el PDF:', error);
    // Compensación: el binario y el metadato no quedan huérfanos.
    if (archivoId) await admin.from('archivos').delete().eq('id', archivoId);
    await descartarSubidaArchivo(admin, BUCKET, ruta);
    return { exito: false, error: 'No se pudo registrar el PDF de la propuesta' };
  }
}
