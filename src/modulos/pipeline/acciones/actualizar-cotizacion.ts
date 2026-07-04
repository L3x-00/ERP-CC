'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { esquemaGuardarCotizacion } from '@/modulos/pipeline/validaciones/esquemas-cotizacion';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { TablesInsert } from '@/compartido/tipos/supabase';

/**
 * Actualiza la cotización de una oportunidad con semántica de reemplazo total:
 * borra todas las líneas existentes y reinserta las recibidas con `orden`
 * secuencial. Cuerpo idéntico a `crearCotizacionAccion` (misma semántica); se
 * duplica por la frontera de `'use server'` — un archivo con esa directiva solo
 * puede exportar Server Actions, no helpers compartidos.
 */
export async function actualizarCotizacionAccion(entrada: unknown): Promise<RespuestaAccion> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaGuardarCotizacion.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { pipelineId, lineas } = analisis.data;

  const servidor = await crearClienteSupabaseServidor();

  const cargada = await obtenerOportunidadPorId(servidor, pipelineId);
  if (!cargada) {
    return { exito: false, error: 'No encontrada' };
  }

  const { error: errorBorrado } = await servidor
    .from('cotizacion_lineas')
    .delete()
    .eq('pipeline_id', pipelineId);
  if (errorBorrado) {
    return { exito: false, error: 'No se pudo guardar la cotización' };
  }

  const filas: TablesInsert<'cotizacion_lineas'>[] = lineas.map((linea, indice) => ({
    pipeline_id: pipelineId,
    descripcion: linea.descripcion,
    cantidad: linea.cantidad,
    precio_unitario: linea.precioUnitario,
    material: linea.material ?? null,
    espesor: linea.espesor ?? null,
    area: linea.area ?? null,
    procesos: linea.procesos,
    orden: indice,
  }));

  const { error: errorInsert } = await servidor.from('cotizacion_lineas').insert(filas);
  if (errorInsert) {
    return { exito: false, error: 'No se pudo guardar la cotización' };
  }

  await registrarLog(usuario, 'guardar_cotizacion', 'pipeline', pipelineId, {
    lineas: lineas.length,
  });

  return { exito: true };
}
