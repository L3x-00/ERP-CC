'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export interface RevisionAceptada {
  revisionId: string;
  folioRevision: string;
  folioPropuesta: string;
  folioRfq: string | null;
  clienteNombre: string;
  esInterna: boolean;
}

/**
 * Revisiones aceptadas sin orden: alimentan el alta comercial de la cola de
 * órdenes. La autorización real la revalida `crear_orden_desde_revision`.
 */
export async function obtenerRevisionesAceptadasAccion(): Promise<RespuestaAccion<RevisionAceptada[]>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'orden_liberar'))) {
    return { exito: false, error: 'Sin permiso para crear órdenes' };
  }

  try {
    const admin = crearClienteSupabaseAdmin();
    const [revisionesResp, ordenesResp] = await Promise.all([
      admin
        .from('propuesta_revisiones')
        .select('id, folio_revision, propuesta_id, estado')
        .in('estado', ['ACCEPTED', 'SALE_CONFIRMED'])
        .order('creado_en', { ascending: false })
        .limit(100),
      admin
        .from('ordenes_produccion')
        .select('propuesta_revision_id')
        .not('propuesta_revision_id', 'is', null),
    ]);
    if (revisionesResp.error) throw revisionesResp.error;
    if (ordenesResp.error) throw ordenesResp.error;

    const conOrden = new Set((ordenesResp.data ?? []).map((fila) => fila.propuesta_revision_id));
    const pendientes = (revisionesResp.data ?? []).filter((revision) => !conOrden.has(revision.id));
    if (pendientes.length === 0) return { exito: true, datos: [] };

    const propuestaIds = [...new Set(pendientes.map((revision) => revision.propuesta_id))];
    const propuestasResp = await admin
      .from('propuestas')
      .select('id, folio_cnc, rfq_id, cliente_id')
      .in('id', propuestaIds);
    if (propuestasResp.error) throw propuestasResp.error;
    const propuestas = new Map((propuestasResp.data ?? []).map((propuesta) => [propuesta.id, propuesta]));

    const clienteIds = [...new Set((propuestasResp.data ?? []).map((propuesta) => propuesta.cliente_id))];
    const rfqIds = [...new Set(
      (propuestasResp.data ?? []).map((propuesta) => propuesta.rfq_id).filter((id): id is string => id !== null),
    )];
    const [clientesResp, rfqsResp] = await Promise.all([
      clienteIds.length > 0
        ? admin.from('clientes').select('id, nombre_comercial, razon_social').in('id', clienteIds)
        : Promise.resolve({ data: [], error: null }),
      rfqIds.length > 0
        ? admin.from('pipeline').select('id, folio_rfq, es_orden_interna').in('id', rfqIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (clientesResp.error) throw clientesResp.error;
    if (rfqsResp.error) throw rfqsResp.error;

    const clientes = new Map((clientesResp.data ?? []).map((cliente) => [
      cliente.id,
      cliente.nombre_comercial || cliente.razon_social,
    ]));
    const rfqs = new Map((rfqsResp.data ?? []).map((rfq) => [rfq.id, rfq]));

    const datos: RevisionAceptada[] = pendientes.flatMap((revision) => {
      const propuesta = propuestas.get(revision.propuesta_id);
      if (!propuesta) return [];
      const rfq = propuesta.rfq_id ? rfqs.get(propuesta.rfq_id) : undefined;
      return [{
        revisionId: revision.id,
        folioRevision: revision.folio_revision,
        folioPropuesta: propuesta.folio_cnc,
        folioRfq: rfq?.folio_rfq ?? null,
        clienteNombre: clientes.get(propuesta.cliente_id) ?? 'Cliente',
        esInterna: rfq?.es_orden_interna ?? false,
      }];
    });

    return { exito: true, datos };
  } catch (error) {
    console.error('[ORDENES] Error al listar revisiones aceptadas:', error);
    return { exito: false, error: 'No se pudieron consultar las revisiones aceptadas' };
  }
}
