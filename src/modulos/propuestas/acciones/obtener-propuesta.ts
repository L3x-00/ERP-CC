'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  calcularTotalesPropuesta,
  resumirCostosRevision,
} from '@/modulos/propuestas/servicios/calcular-totales-propuesta';
import { obtenerUtilidadObjetivoPropuesta } from '@/modulos/propuestas/servicios/utilidad-objetivo';
import {
  obtenerArchivosDePropuesta,
  obtenerCanalRfq,
  obtenerFechasRfq,
  obtenerIdsItemsRfq,
  obtenerPdfsDeRevisiones,
  obtenerPropuestaPorId,
  type ArchivoPropuesta,
} from '@/modulos/propuestas/servicios/obtener-propuesta';
import type {
  AccionRevisionPropuesta,
  CostoRevisionPropuesta,
  EventoRevisionPropuesta,
  PdfRevisionPropuesta,
  Propuesta,
  PropuestaItem,
  RevisionPropuesta,
  RuteoItemPropuesta,
  TotalesPropuesta,
} from '@/modulos/propuestas/tipos/indice';

const esquema = z.object({ propuestaId: z.uuid('Identificador inválido') }).strict();

export type RevisionConTotales = RevisionPropuesta & {
  totales: TotalesPropuesta;
  pdfs: PdfRevisionPropuesta[];
};

export type DetallePropuestaFicha = {
  propuesta: Propuesta;
  revisiones: RevisionConTotales[];
  items: PropuestaItem[];
  ruteo: RuteoItemPropuesta[];
  costos: CostoRevisionPropuesta[];
  acciones: AccionRevisionPropuesta[];
  eventos: EventoRevisionPropuesta[];
  archivosPropios: ArchivoPropuesta[];
  archivosHeredados: ArchivoPropuesta[];
  archivosPorItem: ArchivoPropuesta[];
  /** Canal del RFQ de origen: prellena el canal al validar la propuesta. */
  canalRfq: { canal: string; canalDetalle: string | null } | null;
  /** Fecha requerida y plazo comercial del RFQ: referencia al confirmar el compromiso. */
  fechasRfq: { fechaRequerida: string | null; plazoComercial: string | null } | null;
  /** Utilidad objetivo vigente (% sobre costo) de Configuración, para la ficha. */
  utilidadObjetivoPorcentaje: number;
};

/**
 * SII-B4.11: carga la ficha completa de la propuesta (cabecera, revisiones con
 * totales espejo, ítems, ruteo, costos, acciones, eventos, archivos y PDFs).
 * La visibilidad la impone la RLS (`propuesta_vista` + dueño del RFQ/equipo).
 */
export async function obtenerPropuestaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DetallePropuestaFicha>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'propuesta_vista'))) {
    return { exito: false, error: 'Sin permiso para ver propuestas' };
  }

  const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
  const servidor = await crearClienteSupabaseServidor();
  const datos = await obtenerPropuestaPorId(servidor, analisis.data.propuestaId);
  if (!datos) {
    return { exito: false, error: 'La propuesta no existe' };
  }

  const revisionIds = datos.revisiones.map((revision) => revision.id);
  const itemIds = datos.items.map((item) => item.id);
  const [utilidadObjetivoPorcentaje, rfqItemIds, canalRfq, fechasRfq, pdfs, archivos] = await Promise.all([
    obtenerUtilidadObjetivoPropuesta(),
    obtenerIdsItemsRfq(servidor, datos.propuesta.rfqId),
    obtenerCanalRfq(servidor, datos.propuesta.rfqId),
    obtenerFechasRfq(servidor, datos.propuesta.rfqId),
    obtenerPdfsDeRevisiones(servidor, revisionIds),
    obtenerArchivosDePropuesta(servidor, {
      revisionIds,
      itemIds,
      rfqId: datos.propuesta.rfqId,
      rfqItemIds: [],
    }),
  ]);

  const archivosRfqItems = await obtenerArchivosDePropuesta(servidor, {
    revisionIds: [],
    itemIds: [],
    rfqId: datos.propuesta.rfqId,
    rfqItemIds,
  });

  const revisiones: RevisionConTotales[] = datos.revisiones.map((revision) => {
    const itemsRevision = datos.items.filter((item) => item.revisionId === revision.id);
    const costos = resumirCostosRevision({
      idsItemsActivos: new Set(itemsRevision.filter((item) => item.activo).map((item) => item.id)),
      costos: datos.costos.filter((costo) => costo.revisionId === revision.id),
      ruteo: datos.ruteo,
    });
    return {
      ...revision,
      totales: calcularTotalesPropuesta({
        items: itemsRevision.map((item) => ({
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          esDescuento: item.esDescuento,
          activo: item.activo,
        })),
        ...costos,
        ivaPorcentaje: revision.snapshotCabecera.ivaPorcentaje,
        utilidadObjetivoPorcentaje,
        moneda: revision.snapshotCabecera.moneda,
      }),
      pdfs: pdfs.filter((pdf) => pdf.revisionId === revision.id),
    };
  });

  return {
    exito: true,
    datos: {
      propuesta: datos.propuesta,
      revisiones,
      items: datos.items,
      ruteo: datos.ruteo,
      costos: datos.costos,
      acciones: datos.acciones,
      eventos: datos.eventos,
      archivosPropios: archivos.filter(
        (archivo) => archivo.entidad === 'propuesta_revision',
      ),
      archivosPorItem: [
        ...archivos.filter((archivo) => archivo.entidad === 'propuesta_item'),
      ],
      archivosHeredados: [
        ...archivos.filter((archivo) => archivo.entidad === 'rfq'),
        ...archivosRfqItems.filter((archivo) => archivo.entidad === 'rfq_item'),
      ],
      canalRfq,
      fechasRfq,
      utilidadObjetivoPorcentaje,
    },
  };
}
