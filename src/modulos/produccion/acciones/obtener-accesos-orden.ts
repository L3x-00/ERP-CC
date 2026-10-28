'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerOrdenDocumental } from '@/modulos/produccion/servicios/documentos-orden-servicio';
import { obtenerOrigenPropuestaOrdenesServicio } from '@/modulos/ordenes/servicios/origen-propuesta-ordenes-servicio';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z.object({ ordenId: z.uuid() }).strict();

/** Factura de la orden con el folio de la entrega que la originó. */
export interface FacturaAccesoOrden {
  id: string;
  folioFiscal: string | null;
  estado: string;
  total: number | null;
  entregaId: string;
  entregaFolio: string | null;
  creadoEn: string;
}

/** Enlaces comerciales de una orden concluida, ya filtrados por permiso del usuario. */
export interface AccesosOrden {
  ordenFolio: string;
  rfq: { id: string; folio: string | null } | null;
  propuesta: { id: string; folio: string } | null;
  /** Solo se consultan y devuelven con `ver_finanzas`. */
  facturas: FacturaAccesoOrden[];
  permisos: {
    rfq: boolean;
    propuesta: boolean;
    entregas: boolean;
    facturas: boolean;
    ficha: boolean;
  };
}

/**
 * Accesos rápidos de la ficha concluida: RFQ y propuesta de origen, notas de
 * entrega y facturación. La lectura comparte la autorización de la ficha
 * (Producción o Planeación); cada enlace se publica solo si el usuario puede
 * abrir su destino y las facturas ni siquiera se consultan sin `ver_finanzas`.
 */
export async function obtenerAccesosOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<AccesosOrden>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Orden inválida' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  const permitido =
    (await can(usuario, 'gestionar_produccion'))
    || (await can(usuario, 'ver_planeacion'))
    || (await can(usuario, 'gestionar_planeacion'));
  if (!permitido) return { exito: false, error: 'Sin permiso para consultar la orden' };

  try {
    const admin = crearClienteSupabaseAdmin();
    const [orden, puedeVerRfq, puedeVerPropuesta, puedeVerEntregas, puedeVerFacturas, puedeVerFicha] =
      await Promise.all([
        obtenerOrdenDocumental(admin, analisis.data.ordenId),
        can(usuario, 'rfq_vista'),
        can(usuario, 'propuesta_vista'),
        Promise.all([
          can(usuario, 'orden_vista'),
          can(usuario, 'ver_finanzas'),
          can(usuario, 'entrega_generar'),
          can(usuario, 'entrega_evidencia'),
        ]).then((permisos) => permisos.some(Boolean)),
        can(usuario, 'ver_finanzas'),
        can(usuario, 'orden_vista'),
      ]);
    if (!orden) return { exito: false, error: 'La orden no existe' };

    const [origenes, facturas] = await Promise.all([
      obtenerOrigenPropuestaOrdenesServicio(admin, [orden.id]),
      puedeVerFacturas ? listarFacturasDeOrden(admin, orden.id) : Promise.resolve([]),
    ]);
    const propuesta = origenes[orden.id] ?? null;

    return {
      exito: true,
      datos: {
        ordenFolio: orden.folio,
        rfq: orden.cotizacionId
          ? { id: orden.cotizacionId, folio: orden.cotizacionFolio }
          : null,
        propuesta: propuesta
          ? { id: propuesta.propuestaId, folio: propuesta.propuestaFolio }
          : null,
        facturas,
        permisos: {
          rfq: puedeVerRfq,
          propuesta: puedeVerPropuesta,
          entregas: puedeVerEntregas,
          facturas: puedeVerFacturas,
          ficha: puedeVerFicha,
        },
      },
    };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar los accesos de la orden:', error);
    return { exito: false, error: 'No se pudieron consultar los accesos de la orden' };
  }
}

async function listarFacturasDeOrden(
  admin: ReturnType<typeof crearClienteSupabaseAdmin>,
  ordenId: string,
): Promise<FacturaAccesoOrden[]> {
  const { data: filas, error } = await admin
    .from('facturas')
    .select('id, folio_fiscal, estado, total, entrega_id, creado_en')
    .eq('orden_id', ordenId)
    .order('creado_en', { ascending: false });
  if (error) throw new Error('No se pudieron consultar las facturas de la orden');
  if (!filas || filas.length === 0) return [];

  const entregaIds = [...new Set(filas.map((fila) => fila.entrega_id))];
  const { data: entregas, error: errorEntregas } = await admin
    .from('notas_entrega')
    .select('id, folio, folio_sii')
    .in('id', entregaIds);
  if (errorEntregas) throw new Error('No se pudieron consultar las entregas facturadas');
  const folioPorEntrega = new Map(
    (entregas ?? []).map((entrega) => [entrega.id, entrega.folio_sii ?? entrega.folio]),
  );

  return filas.map((fila) => ({
    id: fila.id,
    folioFiscal: fila.folio_fiscal,
    estado: fila.estado,
    total: fila.total === null ? null : Number(fila.total),
    entregaId: fila.entrega_id,
    entregaFolio: folioPorEntrega.get(fila.entrega_id) ?? null,
    creadoEn: fila.creado_en,
  }));
}
