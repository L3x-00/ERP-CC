'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { listarArchivosFichaOrden } from '@/modulos/ordenes/servicios/archivos-ficha-servicio';
import { esSnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';
import { firmarLecturaArchivo } from '@/nucleo/almacenamiento/archivos/servicio';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z
  .object({ ordenId: z.uuid(), archivoId: z.uuid() })
  .strict();

/**
 * URL firmada de corta vida para abrir un archivo desde la ficha de la Orden (O-05). La firma usa
 * service_role (sin RLS), así que la única barrera es esta acción: exige `orden_vista` y que el
 * archivo esté en la misma lista que la ficha muestra (congelado en la orden, existente, vigente y
 * no retirado). No sirve el permiso de Producción: es otra puerta con otra audiencia.
 */
export async function obtenerUrlArchivoFichaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ url: string }>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'orden_vista'))) {
    return { exito: false, error: 'Sin permiso para abrir archivos de la orden' };
  }

  try {
    const admin = crearClienteSupabaseAdmin();
    const { data: orden, error } = await admin
      .from('ordenes_produccion')
      .select('snapshot_json, propuesta_revision_id')
      .eq('id', analisis.data.ordenId)
      .maybeSingle();
    if (error) throw error;
    if (!orden) return { exito: false, error: 'La orden no existe' };

    const archivos = await listarArchivosFichaOrden(admin, {
      snapshot: esSnapshotOrdenSii(orden.snapshot_json) ? orden.snapshot_json : null,
      propuestaRevisionId: orden.propuesta_revision_id,
    });
    if (!archivos.some((archivo) => archivo.archivoId === analisis.data.archivoId && archivo.disponible)) {
      return { exito: false, error: 'El archivo no pertenece a esta orden' };
    }

    const url = await firmarLecturaArchivo(admin, analisis.data.archivoId, 300);
    return { exito: true, datos: { url } };
  } catch (error) {
    console.error('[ORDENES] Error al firmar archivo de la ficha:', error);
    return { exito: false, error: 'No se pudo generar el enlace del archivo' };
  }
}
