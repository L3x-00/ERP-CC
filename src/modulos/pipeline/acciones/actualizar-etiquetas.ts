'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { esquemaEtiquetasOportunidad } from '@/modulos/pipeline/validaciones/esquemas-prospecto';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Reemplaza el conjunto de etiquetas de una oportunidad — RFQ-12.
 *
 * Las etiquetas son clasificación libre, independientes de la etapa: se pueden
 * editar en cualquier momento (incluida una oportunidad cerrada, para archivar
 * y filtrar históricos). El texto se recorta y se deduplica sin distinguir
 * mayúsculas, conservando la primera aparición. La escritura usa cliente admin
 * tras verificar dueño/admin/`ver_pipeline_equipo` con la carga RLS, igual que
 * el resto de mutaciones del pipeline.
 */
export async function actualizarEtiquetasAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ etiquetas: string[] }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaEtiquetasOportunidad.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { id } = analisis.data;

  // Recorta, quita vacíos y deduplica (case-insensitive) conservando el orden.
  const vistas = new Set<string>();
  const etiquetas: string[] = [];
  for (const bruta of analisis.data.etiquetas) {
    const limpia = bruta.trim();
    const clave = limpia.toLowerCase();
    if (limpia === '' || vistas.has(clave)) continue;
    vistas.add(clave);
    etiquetas.push(limpia);
  }

  const servidor = await crearClienteSupabaseServidor();
  const cargada = await obtenerOportunidadPorId(servidor, id);
  if (!cargada) {
    return { exito: false, error: 'No encontrada' };
  }

  if (
    cargada.oportunidad.vendedorId !== usuario.id &&
    usuario.rol !== 'admin' &&
    !(await can(usuario, 'ver_pipeline_equipo'))
  ) {
    return { exito: false, error: 'No encontrada' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { error } = await admin.from('pipeline').update({ etiquetas }).eq('id', id);
  if (error) {
    return { exito: false, error: 'No se pudieron actualizar las etiquetas' };
  }

  await registrarLog(usuario, 'actualizar_etiquetas', 'pipeline', id, { etiquetas });

  return { exito: true, datos: { etiquetas } };
}
