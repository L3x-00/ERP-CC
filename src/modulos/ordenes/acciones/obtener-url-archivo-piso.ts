'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { archivoPerteneceAOrden } from '@/modulos/ordenes/servicios/archivos-ficha-servicio';
import { ordenEstaEnPiso } from '@/modulos/ordenes/servicios/hoja-trabajo-lectura-servicio';
import { firmarLecturaArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import { obtenerAccesoLecturaPiso } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z
  .object({ ordenId: z.uuid(), archivoId: z.uuid() })
  .strict();

// Únicamente adjuntos técnicos aportados al RFQ o a la propuesta.
// Un PDF de cotización generado (clase "pdf") no se firma para el operador.
const CLASES_ADJUNTOS_OPERATIVOS = new Set([
  'CAD', 'DIBUJO', 'IMAGEN', 'ESPECIFICACIONES', 'OTROS', 'TECNICO', 'TÉCNICO',
]);
const ENTIDADES_ADJUNTOS_OPERATIVOS = new Set([
  'rfq', 'rfq_item', 'propuesta', 'propuesta_revision', 'propuesta_item',
]);

/**
 * URL firmada de corta vida para abrir adjuntos aprobados desde el piso.
 * Verifica sesión PIN, orden asignada, pertenencia al snapshot congelado,
 * procedencia original y clase técnica antes de firmar con service_role.
 */
export async function obtenerUrlArchivoPisoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ url: string }>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const acceso = await obtenerAccesoLecturaPiso();
  if (!acceso) return { exito: false, error: 'No autorizado' };

  try {
    const admin = crearClienteSupabaseAdmin();
    const { ordenId, archivoId } = analisis.data;
    if (!(await ordenEstaEnPiso(admin, ordenId, acceso.operadorId))) {
      return { exito: false, error: 'La orden no está en tu piso' };
    }
    if ((await archivoPerteneceAOrden(admin, ordenId, archivoId)) !== true) {
      return { exito: false, error: 'El archivo no pertenece a esta orden' };
    }

    // Segunda barrera en servidor: la pertenencia al snapshot por sí sola
    // también podría aceptar documentos comerciales generados.
    const { data: archivo, error: errorArchivo } = await admin
      .from('archivos')
      .select('entidad, clase')
      .eq('id', archivoId)
      .maybeSingle();
    if (errorArchivo) throw errorArchivo;
    if (
      !archivo ||
      !ENTIDADES_ADJUNTOS_OPERATIVOS.has(archivo.entidad) ||
      !CLASES_ADJUNTOS_OPERATIVOS.has((archivo.clase ?? '').trim().toUpperCase())
    ) {
      return { exito: false, error: 'Este documento no está habilitado para el operador' };
    }

    const url = await firmarLecturaArchivo(admin, archivoId, 300);
    return { exito: true, datos: { url } };
  } catch (error) {
    console.error('[ORDENES] Error al firmar archivo desde el piso:', error);
    return { exito: false, error: 'No se pudo generar el enlace del archivo' };
  }
}
