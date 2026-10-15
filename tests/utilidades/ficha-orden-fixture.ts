import type {
  FichaOrden,
  OrigenComercialFicha,
} from '@/modulos/ordenes/tipos/ficha-orden';
import type { PermisosFichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';

/** Identificadores internos: la ficha NO debe mostrarlos como texto en ninguna pestaña. */
export const ID_ORDEN = '00000000-0000-4000-8000-0000000c8201';
export const ID_RFQ = '00000000-0000-4000-8000-0000000c8202';
export const ID_PROPUESTA = '00000000-0000-4000-8000-0000000c8203';
export const ID_REVISION = '00000000-0000-4000-8000-0000000c8204';
export const ID_RECURSO_ANTERIOR = '00000000-0000-4000-8000-0000000c8205';
export const ID_RECURSO_NUEVO = '00000000-0000-4000-8000-0000000c8206';
export const ID_ARCHIVO = '00000000-0000-4000-8000-0000000c8207';
export const ID_ENTREGA = '00000000-0000-4000-8000-0000000c8208';
export const ID_PARTIDA = '00000000-0000-4000-8000-0000000c8209';
export const ID_EVENTO = '00000000-0000-4000-8000-0000000c8210';

export const PATRON_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

export const ORIGEN_COMERCIAL: OrigenComercialFicha = {
  rfqId: ID_RFQ,
  rfqFolio: 'RFQ-1026_05',
  propuestaId: ID_PROPUESTA,
  propuestaFolio: 'CNC-1026_07',
  revisionFolio: 'CNC-1026_07-B',
  revisionLetra: 'B',
};

export const PERMISOS_BASE: PermisosFichaOrden = {
  puedeLiberar: false,
  puedeCerrar: false,
  puedeCancelar: false,
  puedeVerTotales: false,
  puedeAdjuntar: false,
  puedeEliminarTodos: false,
  puedeVerRfq: false,
  puedeVerPropuesta: false,
};

/** Ficha con contenido en TODAS las pestañas y UUID en cada rincón donde podrían filtrarse. */
export function fichaCompleta(cambios: Partial<FichaOrden['orden']> = {}): FichaOrden {
  return {
    orden: {
      id: ID_ORDEN,
      folio: 'OP-008201',
      folioSii: 'O-1026_01',
      estadoSii: 'PLANIFICADA',
      estadoLegacy: 'programada',
      prioridad: 'normal',
      fechaCompromisoComercial: '2026-11-15',
      fechaOperativa: '2026-11-17T18:00:00.000Z',
      archivadaEn: null,
      esInterna: false,
      idHistorico: null,
      referenciaExterna: null,
      notas: 'Turno matutino',
      creadoEn: '2026-10-09T12:00:00.000Z',
      actualizadoEn: '2026-10-09T12:00:00.000Z',
      cerradaAdminEn: null,
      cerradaAdminPorNombre: null,
      clienteNombre: 'Cliente C8.2',
      moneda: null,
      ...cambios,
    },
    origen: ORIGEN_COMERCIAL,
    ruta: [
      {
        codigoItem: 'IT01',
        descripcion: 'Soporte lateral',
        pasos: [
          { secuencia: 1, proceso: 'Corte láser', prepHoras: 0.5, operacionHoras: 1 },
          { secuencia: 2, proceso: 'Doblez', prepHoras: null, operacionHoras: null },
        ],
      },
    ],
    partidas: [{
      id: ID_PARTIDA,
      codigoPieza: 'PZA-1',
      codigoItem: 'IT01',
      descripcion: 'Soporte lateral',
      cantidadSolicitada: 4,
      cantidadProducida: 1,
      cantidadScrap: 0,
      unidadMedida: 'pza',
      procesos: ['Corte láser', 'Doblez'],
      tiempoEstimadoMinutos: 30,
      tiempoRealMinutos: 0,
      areaTrabajoCodigo: 'LASER',
    }],
    snapshot: null,
    totales: null,
    entregas: [{
      id: ID_ENTREGA,
      folio: 'NE-004201',
      folioSii: 'NE-1026_01-01',
      esParcial: true,
      recibidoPor: 'Recepción',
      creadoEn: '2026-10-12T12:00:00.000Z',
      partidas: [{ partidaId: ID_PARTIDA, cantidadEntregada: 1 }],
    }],
    eventos: [
      {
        id: ID_EVENTO,
        tipo: 'reprogramacion_operativa',
        motivo: null,
        actorNombre: null,
        creadoEn: '2026-10-10T12:00:00.000Z',
        detalle: {
          anterior: { recurso_id: ID_RECURSO_ANTERIOR, partida_id: ID_PARTIDA, turno: 'matutino' },
          nuevo: { recurso_id: ID_RECURSO_NUEVO, partida_id: ID_PARTIDA, turno: 'vespertino' },
        },
      },
    ],
    archivos: [{
      archivoId: ID_ARCHIVO,
      nombreOriginal: null,
      nombreErp: null,
      clase: 'cad',
      mime: null,
      origen: 'item',
      itemCodigo: 'IT01',
    }],
  };
}

/** La misma ficha pero con snapshot y totales, como la recibe un rol con `orden_ver_totales`. */
export function fichaConSnapshot(cambios: Partial<FichaOrden['orden']> = {}): FichaOrden {
  const base = fichaCompleta(cambios);
  return {
    ...base,
    orden: { ...base.orden, moneda: 'MXN' },
    snapshot: {
      version: 1,
      orden_id: ID_ORDEN,
      origen: {
        rfq_id: ID_RFQ,
        rfq_folio: 'RFQ-1026_05',
        propuesta_id: ID_PROPUESTA,
        propuesta_folio: 'CNC-1026_07',
        revision_id: ID_REVISION,
        revision_folio: 'CNC-1026_07-B',
        letra: 'B',
      },
      cabecera: {},
      items: [{
        item_id: ID_PARTIDA,
        codigo: 'IT01',
        codigo_item: 'IT01',
        descripcion: 'Soporte lateral',
        cantidad: 4,
        precio_unitario: 100,
        material: 'Acero A36',
        espesor: '3 mm',
        ruteo: [{ secuencia: 1, proceso_nombre: 'Corte láser', setup_horas: 0.5, run_horas: 1 }],
        archivos: [],
      }],
      archivos: [],
    },
    totales: { subtotal: 400, descuento: 0, iva: 64, total: 464, moneda: 'MXN' },
  };
}
