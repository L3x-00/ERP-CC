import { describe, expect, it } from 'vitest';

import { traducirErrorPropuesta } from '@/modulos/propuestas/servicios/errores-propuesta';
import {
  jsonASnapshotCabecera,
  filaAPropuesta,
  filaARevisionPropuesta,
  type FilaPropuesta,
  type FilaRevisionPropuesta,
} from '@/modulos/propuestas/tipos/indice';
import {
  CODIGO_ACCION_OTRO,
  esEstadoTerminal,
  esRevisionEditable,
  siguienteLetra,
  ETIQUETA_CATEGORIA_COSTO,
  ETIQUETA_ESTADO_PROPIESTA,
} from '@/modulos/propuestas/utilidades/indice';
import {
  esquemaAceptarRevision,
  esquemaCrearNuevaRevision,
  esquemaEditarCostosRevision,
  esquemaEditarItemPropuesta,
  esquemaEditarRuteoItem,
  esquemaEnviarRevision,
  esquemaFiltrosPropuestas,
  esquemaGenerarPdfRevision,
  esquemaRegistrarSeguimientoPropuesta,
  esquemaConfirmarArchivoPropuesta,
  esquemaPrepararArchivoPropuesta,
} from '@/modulos/propuestas/validaciones/esquemas-propuestas';

const ID = '11111111-1111-4111-8111-111111111111';
const OTRO_ID = '22222222-2222-4222-8222-222222222222';
const VERSION = '2026-10-06T10:00:00.000000+00:00';

describe('validaciones Zod de propuestas (B4)', () => {
  it('la nueva revisión exige motivo de 3 a 300 caracteres', () => {
    expect(esquemaCrearNuevaRevision.safeParse({ revisionOrigen: ID, motivo: 'xy' }).success).toBe(
      false,
    );
    expect(
      esquemaCrearNuevaRevision.safeParse({ revisionOrigen: ID, motivo: 'Cambio de material' }).success,
    ).toBe(true);
  });

  it('editar ítem exige al menos un campo y valida cantidades/precios', () => {
    expect(esquemaEditarItemPropuesta.safeParse({ itemId: ID, actualizadoEn: VERSION }).success).toBe(
      false,
    );
    expect(
      esquemaEditarItemPropuesta.safeParse({
        itemId: ID,
        actualizadoEn: VERSION,
        cantidad: 0,
      }).success,
    ).toBe(false);
    expect(
      esquemaEditarItemPropuesta.safeParse({
        itemId: ID,
        actualizadoEn: VERSION,
        cantidad: 12.5,
        precioUnitario: 100.5,
      }).success,
    ).toBe(true);
    expect(
      esquemaEditarItemPropuesta.safeParse({
        itemId: ID,
        actualizadoEn: VERSION,
        materialId: null,
        espesorId: null,
      }).success,
    ).toBe(true);
  });

  it('el ruteo acepta lista vacía (se valida antes de enviar) y horas no negativas', () => {
    expect(
      esquemaEditarRuteoItem.safeParse({ itemId: ID, actualizadoEn: VERSION, filas: [] }).success,
    ).toBe(true);
    expect(
      esquemaEditarRuteoItem.safeParse({
        itemId: ID,
        actualizadoEn: VERSION,
        filas: [{ procesoId: OTRO_ID, setupHoras: -1 }],
      }).success,
    ).toBe(false);
    expect(
      esquemaEditarRuteoItem.safeParse({
        itemId: ID,
        actualizadoEn: VERSION,
        filas: [{ procesoId: OTRO_ID, runHoras: 2.5 }],
      }).success,
    ).toBe(true);
  });

  it('los costos validan categoría, monto y no repiten categoría', () => {
    expect(
      esquemaEditarCostosRevision.safeParse({
        revisionId: ID,
        actualizadoEn: VERSION,
        costos: [{ categoria: 'material', monto: 100 }],
      }).success,
    ).toBe(true);
    expect(
      esquemaEditarCostosRevision.safeParse({
        revisionId: ID,
        actualizadoEn: VERSION,
        costos: [{ categoria: 'otra', monto: 100 }],
      }).success,
    ).toBe(false);
    expect(
      esquemaEditarCostosRevision.safeParse({
        revisionId: ID,
        actualizadoEn: VERSION,
        costos: [
          { categoria: 'material', monto: 100 },
          { categoria: 'material', monto: 50 },
        ],
      }).success,
    ).toBe(false);
  });

  it('el seguimiento exige fecha válida y código del catálogo', () => {
    expect(
      esquemaRegistrarSeguimientoPropuesta.safeParse({
        revisionId: ID,
        actualizadoEn: VERSION,
        codigo: 'FOLLOW_UP',
        fecha: '2026-10-20',
      }).success,
    ).toBe(true);
    expect(
      esquemaRegistrarSeguimientoPropuesta.safeParse({
        revisionId: ID,
        actualizadoEn: VERSION,
        codigo: 'FOLLOW_UP',
        fecha: '20/10/2026',
      }).success,
    ).toBe(false);
  });

  it('aceptar exige token y permite canal/destino opcionales', () => {
    expect(
      esquemaAceptarRevision.safeParse({ revisionId: ID, actualizadoEn: VERSION }).success,
    ).toBe(true);
    expect(
      esquemaAceptarRevision.safeParse({
        revisionId: ID,
        actualizadoEn: VERSION,
        canal: 'correo',
        destino: 'compras@cliente.mx',
      }).success,
    ).toBe(true);
    expect(esquemaAceptarRevision.safeParse({ revisionId: ID }).success).toBe(false);
  });
});

describe('utilidades de estado (B4)', () => {
  it('solo DRAFT es editable y SALE_CONFIRMED/REJECTED/CLOSED son terminales', () => {
    expect(esRevisionEditable('DRAFT')).toBe(true);
    expect(esRevisionEditable('SENT')).toBe(false);
    expect(esEstadoTerminal('SALE_CONFIRMED')).toBe(true);
    expect(esEstadoTerminal('REJECTED')).toBe(true);
    expect(esEstadoTerminal('CLOSED')).toBe(true);
    expect(esEstadoTerminal('READY_TO_SEND')).toBe(false);
  });

  it('la letra siguiente avanza A→B y topa en Z', () => {
    expect(siguienteLetra('A')).toBe('B');
    expect(siguienteLetra('Y')).toBe('Z');
    expect(siguienteLetra('Z')).toBeNull();
    expect(siguienteLetra(null)).toBeNull();
  });

  it('etiquetas completas de estados y categorías', () => {
    expect(ETIQUETA_ESTADO_PROPIESTA.DRAFT).toBe('Borrador');
    expect(ETIQUETA_ESTADO_PROPIESTA.SALE_CONFIRMED).toBe('Venta confirmada');
    expect(ETIQUETA_CATEGORIA_COSTO.mano_obra).toBe('Mano de obra');
    expect(CODIGO_ACCION_OTRO).toBe('OTHER');
  });
});

describe('traducción de errores tipados (B4)', () => {
  it('traduce los códigos principales', () => {
    expect(traducirErrorPropuesta('sin_permiso_propuesta')).toContain('Sin permiso');
    expect(traducirErrorPropuesta('revision_congelada')).toContain('nueva revisión');
    expect(traducirErrorPropuesta('limite_revisiones_alcanzado')).toContain('letra Z');
    expect(traducirErrorPropuesta('item_desactualizado')).toContain('cambió');
  });

  it('resume los faltantes del detalle de requiere_revision_pendiente', () => {
    const detalle = JSON.stringify({
      revisionId: ID,
      faltantes: ['confirmar ruteo (Requiere revisión)', 'ítem IT01: ruteo estimado'],
    });
    const mensaje = traducirErrorPropuesta('requiere_revision_pendiente', detalle);
    expect(mensaje).toContain('confirmar ruteo');
    expect(mensaje).toContain('IT01');
  });
});

describe('mapeos de propuestas (B4)', () => {
  it('mapea la cabecera de propuesta', () => {
    const fila: FilaPropuesta = {
      accepted_revision_id: OTRO_ID,
      actualizado_en: VERSION,
      cliente_id: ID,
      creado_en: VERSION,
      creado_por: ID,
      estado: 'ACCEPTED',
      folio_cnc: 'CNC-1026_03',
      id: ID,
      responsable_id: OTRO_ID,
      revision_vigente_id: OTRO_ID,
      rfq_id: ID,
    };
    const propuesta = filaAPropuesta(fila);
    expect(propuesta.folioCnc).toBe('CNC-1026_03');
    expect(propuesta.estado).toBe('ACCEPTED');
    expect(propuesta.acceptedRevisionId).toBe(OTRO_ID);
  });

  it('mapea la revisión y su snapshot con folio legacy', () => {
    const fila: FilaRevisionPropuesta = {
      actualizado_en: VERSION,
      canal_envio: 'correo',
      creado_en: VERSION,
      creado_por: ID,
      destino_envio: 'compras@cliente.mx',
      enviado_en: VERSION,
      enviado_por: ID,
      estado: 'SENT',
      folio_revision: 'CNC-1026_03-A',
      id: ID,
      letra: 'A',
      motivo_creacion: null,
      propuesta_id: OTRO_ID,
      requiere_revision_costeo: false,
      requiere_revision_ruteo: true,
      snapshot_cabecera: {
        version: 1,
        cliente_id: ID,
        cliente: { razon_social: 'ACME', nombre_comercial: 'ACME', rfc: null, correo: null, telefono: null },
        contacto_id: null,
        contacto: null,
        empresa: 'ACME',
        moneda: 'USD',
        condiciones_pago: 'credito',
        iva_porcentaje: 16,
        folio_legacy: 'CNC-1026-0007',
        folio_rfq: 'RFQ-1026_01',
      },
      validada_en: VERSION,
      validada_por: ID,
    };

    const revision = filaARevisionPropuesta(fila);
    expect(revision.letra).toBe('A');
    expect(revision.requiereRevisionRuteo).toBe(true);
    expect(revision.snapshotCabecera.moneda).toBe('USD');
    expect(revision.snapshotCabecera.folioLegacy).toBe('CNC-1026-0007');
  });

  it('el snapshot tolera JSON vacío o incompleto', () => {
    const snapshot = jsonASnapshotCabecera({});
    expect(snapshot.version).toBe(1);
    expect(snapshot.moneda).toBe('MXN');
    expect(snapshot.ivaPorcentaje).toBe(16);
    expect(snapshot.cliente).toBeNull();
    expect(snapshot.folioLegacy).toBeNull();
  });
});

describe('validaciones de la ola 2 (envío, PDF y filtros)', () => {
  it('el envío exige canal y destino', () => {
    expect(
      esquemaEnviarRevision.safeParse({ revisionId: ID, canal: '', destino: 'x@y.mx' }).success,
    ).toBe(false);
    expect(
      esquemaEnviarRevision.safeParse({ revisionId: ID, canal: 'correo', destino: '' }).success,
    ).toBe(false);
    expect(
      esquemaEnviarRevision.safeParse({ revisionId: ID, canal: 'correo', destino: 'x@y.mx' }).success,
    ).toBe(true);
  });

  it('la generación de PDF solo requiere la revisión', () => {
    expect(esquemaGenerarPdfRevision.safeParse({ revisionId: ID }).success).toBe(true);
    expect(esquemaGenerarPdfRevision.safeParse({}).success).toBe(false);
  });

  it('los filtros de la cola validan estado y rfq', () => {
    expect(esquemaFiltrosPropuestas.safeParse({ estado: 'SENT' }).success).toBe(true);
    expect(esquemaFiltrosPropuestas.safeParse({ estado: 'ENVIADA' }).success).toBe(false);
    expect(esquemaFiltrosPropuestas.safeParse({ rfqId: ID }).success).toBe(true);
    expect(esquemaFiltrosPropuestas.safeParse({ rfqId: 'no-uuid' }).success).toBe(false);
  });

  it('la subida directa valida tema, nombre y solo metadatos del binario', () => {
    const destino = { revisionId: ID, tema: 'tecnico', nombreArchivo: 'plano.dxf' };
    expect(
      esquemaPrepararArchivoPropuesta.safeParse({ ...destino, tamano: 2 * 1024 * 1024, mime: '' })
        .success,
    ).toBe(true);
    expect(
      esquemaPrepararArchivoPropuesta.safeParse({ ...destino, nombreArchivo: '', tamano: 1, mime: '' })
        .success,
    ).toBe(false);
    expect(
      esquemaPrepararArchivoPropuesta.safeParse({ ...destino, tamano: 1, mime: '', archivo: 'binario' })
        .success,
    ).toBe(false);
    expect(esquemaConfirmarArchivoPropuesta.safeParse({ ...destino, ruta: 'x/y.dxf' }).success).toBe(true);
    expect(esquemaConfirmarArchivoPropuesta.safeParse({ ...destino, ruta: '' }).success).toBe(false);
  });

  it('traduce los errores nuevos de envío y PDF', () => {
    expect(traducirErrorPropuesta('rfq_no_listo')).toContain('requisitos');
    expect(traducirErrorPropuesta('pdf_requerido')).toContain('PDF');
    expect(traducirErrorPropuesta('pdf_archivo_invalido')).toContain('PDF');
    expect(traducirErrorPropuesta('revision_no_apta_pdf')).toContain('PDF');
    expect(traducirErrorPropuesta('proxima_accion_requerida')).toContain('próxima acción');
    expect(traducirErrorPropuesta('canal_requerido')).toContain('canal');
    expect(traducirErrorPropuesta('destino_requerido')).toContain('destino');
  });
});
