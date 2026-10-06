'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { hoyIso } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import { esquemaFiltrosPropuestas } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';

export type FilaColaPropuesta = {
  id: string;
  folioCnc: string;
  estado: EstadoPropuesta;
  empresa: string | null;
  clienteRazonSocial: string | null;
  responsableId: string;
  ultimaRevision: {
    letra: string;
    folioRevision: string;
    estado: EstadoPropuesta;
    requiereRevisionRuteo: boolean;
    requiereRevisionCosteo: boolean;
  } | null;
  proximaAccion: { codigo: string; fecha: string | null } | null;
  /** `true` si la próxima acción más próxima está vencida (fecha < hoy). */
  vencida: boolean;
  actualizadoEn: string;
};

type FilaCruda = {
  id: string;
  folio_cnc: string;
  estado: string;
  responsable_id: string;
  actualizado_en: string;
  clientes: { razon_social: string } | null;
  propuesta_revisiones: {
    letra: string;
    folio_revision: string;
    estado: string;
    requiere_revision_ruteo: boolean;
    requiere_revision_costeo: boolean;
    propuesta_revision_acciones: { codigo: string; fecha: string | null }[];
  }[];
};

/**
 * SII-B4.11: cola de propuestas con filtros de estado/búsqueda de cliente. La
 * vista aplica en cliente los filtros de responsable y "próxima acción vencida"
 * (el filtro de vencimiento compara contra `hoyIso`).
 */
export async function obtenerPropuestasAccion(
  entrada: unknown,
): Promise<RespuestaAccion<FilaColaPropuesta[]>> {
  const analisis = esquemaFiltrosPropuestas.safeParse(entrada ?? {});
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Filtros inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'propuesta_vista'))) {
    return { exito: false, error: 'Sin permiso para ver propuestas' };
  }

  const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
  const servidor = await crearClienteSupabaseServidor();

  let consulta = servidor
    .from('propuestas')
    .select(
      'id, folio_cnc, estado, responsable_id, actualizado_en, '
      + 'clientes!propuestas_cliente_id_fkey(razon_social), '
      + 'propuesta_revisiones!propuesta_revisiones_propuesta_id_fkey('
      + 'letra, folio_revision, estado, requiere_revision_ruteo, requiere_revision_costeo, '
      + 'propuesta_revision_acciones(codigo, fecha))',
    )
    .order('actualizado_en', { ascending: false })
    .limit(200);

  const filtros = analisis.data;
  if (filtros.estado) {
    consulta = consulta.eq('estado', filtros.estado);
  }
  if (filtros.rfqId) {
    consulta = consulta.eq('rfq_id', filtros.rfqId);
  }
  if (filtros.responsableId) {
    consulta = consulta.eq('responsable_id', filtros.responsableId);
  }
  if (filtros.busqueda) {
    const termino = filtros.busqueda.replace(/[%,()"*\\]/g, ' ').trim();
    if (termino) {
      consulta = consulta.ilike('clientes.razon_social', `%${termino}%`);
    }
  }

  const { data, error } = await consulta;
  if (error) {
    console.error('[PROPUESTAS] No se pudo cargar la cola:', error.message);
    return { exito: false, error: 'No se pudieron cargar las propuestas' };
  }

  const hoy = hoyIso();
  const filas = (data as unknown as FilaCruda[] | null) ?? [];
  const registros: FilaColaPropuesta[] = filas.map((fila) => {
    const revisiones = fila.propuesta_revisiones ?? [];
    const ultima = revisiones.find((revision) => revision.estado === 'DRAFT')
      ?? revisiones[0]
      ?? null;
    const acciones = ultima?.propuesta_revision_acciones ?? [];
    const proxima = acciones
      .filter((accion) => accion.fecha !== null)
      .sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''))[0]
      ?? acciones[0]
      ?? null;

    return {
      id: fila.id,
      folioCnc: fila.folio_cnc,
      estado: fila.estado as EstadoPropuesta,
      empresa: fila.clientes?.razon_social ?? null,
      clienteRazonSocial: fila.clientes?.razon_social ?? null,
      responsableId: fila.responsable_id,
      ultimaRevision: ultima
        ? {
            letra: ultima.letra,
            folioRevision: ultima.folio_revision,
            estado: ultima.estado as EstadoPropuesta,
            requiereRevisionRuteo: ultima.requiere_revision_ruteo,
            requiereRevisionCosteo: ultima.requiere_revision_costeo,
          }
        : null,
      proximaAccion: proxima ? { codigo: proxima.codigo, fecha: proxima.fecha } : null,
      vencida: proxima?.fecha != null && proxima.fecha < hoy,
      actualizadoEn: fila.actualizado_en,
    };
  });

  return { exito: true, datos: registros };
}
