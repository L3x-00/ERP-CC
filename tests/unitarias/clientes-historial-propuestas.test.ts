// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import {
  crearSupabaseFalsoHistorial,
  paginarFilas,
  type RespuestaTabla,
} from '../utilidades/supabase-falso-historial';

const { obtenerClienteMock } = vi.hoisted(() => ({ obtenerClienteMock: vi.fn() }));
const { obtenerNotasMock } = vi.hoisted(() => ({ obtenerNotasMock: vi.fn() }));

vi.mock('@/nucleo/supabase/cliente-navegador', () => ({
  obtenerClienteSupabaseNavegador: () => obtenerClienteMock(),
}));

vi.mock('@/modulos/clientes/acciones/obtener-notas-operativas-cliente', () => ({
  obtenerNotasOperativasClienteAccion: (...args: unknown[]) => obtenerNotasMock(...args),
}));

import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { HistorialCliente } from '@/modulos/clientes/componentes/historial-cliente';
import {
  obtenerCotizacionesCliente,
  obtenerPropuestasCliente,
} from '@/modulos/clientes/servicios/obtener-historial-cliente';

beforeEach(() => {
  vi.clearAllMocks();
  obtenerNotasMock.mockResolvedValue({ exito: true, datos: [] });
});

afterEach(() => cleanup());

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';
const VENDEDOR_ID = '22222222-2222-4222-8222-222222222222';

function filaPipeline(indice: number, extra: Record<string, unknown> = {}) {
  return {
    id: `cot-${indice}`,
    actualizado_en: '2026-09-10T10:00:00.000Z',
    cliente_id: CLIENTE_ID,
    creado_en: `2026-09-${String(10 - indice).padStart(2, '0')}T10:00:00.000Z`,
    estado_rfq: 'CONVERTED',
    folio_rfq: `RFQ-${indice}`,
    fecha_envio_cotizacion: null,
    folio_cnc: null,
    folio_op: `OP-00000${indice}`,
    iva_porcentaje: 16,
    moneda: 'MXN',
    vendedor_id: VENDEDOR_ID,
    ...extra,
  };
}

function filaLinea(id: string, pipelineId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    area: 1.5,
    cantidad: 4,
    descripcion: 'Placa cortada',
    espesor: '3/16"',
    material: 'Acero A36',
    orden: 1,
    pipeline_id: pipelineId,
    precio_unitario: 250,
    procesos: ['corte_laser'],
    es_descuento: false,
    ...extra,
  };
}

function filaPropuesta(id: string, rfqId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    rfq_id: rfqId,
    cliente_id: CLIENTE_ID,
    folio_cnc: 'CNC-1026_01',
    estado: 'SENT',
    revision_vigente_id: `${id}-revA`,
    accepted_revision_id: null,
    creado_en: '2026-10-01T10:00:00.000Z',
    actualizado_en: '2026-10-05T10:00:00.000Z',
    ...extra,
  };
}

function filaRevision(id: string, propuestaId: string, letra: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    propuesta_id: propuestaId,
    letra,
    folio_revision: `CNC-1026_01-${letra}`,
    estado: 'SENT',
    motivo_creacion: letra === 'A' ? null : 'Cambio de alcance',
    enviado_en: '2026-10-05T10:00:00.000Z',
    validada_en: '2026-10-04T10:00:00.000Z',
    creado_en: '2026-10-01T10:00:00.000Z',
    actualizado_en: '2026-10-05T10:00:00.000Z',
    moneda: 'MXN',
    iva_porcentaje: '16',
    ...extra,
  };
}

function filaItem(id: string, revisionId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    revision_id: revisionId,
    cantidad: 10,
    precio_unitario: 125.5,
    es_descuento: false,
    activo: true,
    ...extra,
  };
}

function filaEvento(id: string, revisionId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    revision_id: revisionId,
    accion: 'enviar_revision',
    estado_anterior: 'READY_TO_SEND',
    estado_nuevo: 'SENT',
    motivo: null,
    canal: 'correo',
    destino: 'compras@cliente.test',
    creado_en: '2026-10-05T10:00:00.000Z',
    ...extra,
  };
}

/** Respuestas de las tablas de Propuestas para un solo RFQ convertido. */
function respuestasPropuesta(opciones: {
  propuesta?: Record<string, unknown>;
  revisiones?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  eventos?: Record<string, unknown>[];
}) {
  const propuesta = opciones.propuesta ?? filaPropuesta('prop-1', 'cot-1');
  return {
    propuestas: (registro: Parameters<typeof paginarFilas>[1]) => paginarFilas([propuesta], registro),
    propuesta_revisiones: (registro: Parameters<typeof paginarFilas>[1]) =>
      paginarFilas(opciones.revisiones ?? [filaRevision('prop-1-revA', 'prop-1', 'A')], registro),
    propuesta_items: (registro: Parameters<typeof paginarFilas>[1]) =>
      paginarFilas(opciones.items ?? [filaItem('it-1', 'prop-1-revA')], registro),
    propuesta_revision_eventos: (registro: Parameters<typeof paginarFilas>[1]) =>
      paginarFilas(opciones.eventos ?? [], registro),
  };
}

const ERROR_LECTURA: RespuestaTabla = { data: null, error: { message: 'permiso denegado' } };

describe('importe de una cotización convertida (defecto del $0.00)', () => {
  it('toma el importe de la propuesta cuando el cotizador anterior no tiene líneas', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({}),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    // 10 piezas × 125.50 = 1,255.00; IVA 16 % = 200.80; total 1,455.80.
    expect(cotizacion?.importe).toMatchObject({
      tipo: 'propuesta',
      subtotal: 1255,
      iva: 200.8,
      total: 1455.8,
      moneda: 'MXN',
      origen: { propuestaId: 'prop-1', folioCnc: 'CNC-1026_01', folioRevision: 'CNC-1026_01-A' },
    });
    // El subtotal legado sigue reflejando solo al cotizador anterior (vacío).
    expect(cotizacion?.subtotal).toBe(0);
  });

  it('la ficha ya no muestra $0.00 y rotula el origen del importe', async () => {
    obtenerClienteMock.mockReturnValue(
      crearSupabaseFalsoHistorial({
        pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
        cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
        ...respuestasPropuesta({}),
      }).cliente,
    );

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID, puedeVerPropuestas: true }), {
      wrapper: crearWrapper(),
    });

    const importe = await screen.findByTestId('importe-cotizacion-cot-1');
    expect(importe.textContent).toContain(formatearMoneda(1255, 'MXN'));
    expect(importe.textContent).toContain('CNC-1026_01-A');
    expect(screen.queryByText(formatearMoneda(0, 'MXN'))).toBeNull();
  });
});

describe('selección de la propuesta apropiada', () => {
  it('prefiere la revisión aceptada aunque exista una revisión vigente posterior', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({
        propuesta: filaPropuesta('prop-1', 'cot-1', {
          estado: 'ACCEPTED',
          revision_vigente_id: 'prop-1-revB',
          accepted_revision_id: 'prop-1-revA',
        }),
        revisiones: [
          filaRevision('prop-1-revA', 'prop-1', 'A', { estado: 'ACCEPTED' }),
          filaRevision('prop-1-revB', 'prop-1', 'B', { estado: 'DRAFT' }),
        ],
        items: [
          filaItem('it-a', 'prop-1-revA', { cantidad: 2, precio_unitario: 100 }),
          filaItem('it-b', 'prop-1-revB', { cantidad: 2, precio_unitario: 999 }),
        ],
      }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toMatchObject({
      tipo: 'propuesta',
      subtotal: 200,
      origen: { folioRevision: 'CNC-1026_01-A', aceptada: true },
    });
  });

  it('entre varias propuestas elige la aceptada y no una rechazada más reciente', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      propuestas: (registro) =>
        paginarFilas(
          [
            filaPropuesta('prop-rechazada', 'cot-1', {
              folio_cnc: 'CNC-1026_02',
              estado: 'REJECTED',
              revision_vigente_id: 'rev-rechazada',
              actualizado_en: '2026-10-09T10:00:00.000Z',
            }),
            filaPropuesta('prop-aceptada', 'cot-1', {
              estado: 'ACCEPTED',
              revision_vigente_id: 'rev-aceptada',
              accepted_revision_id: 'rev-aceptada',
              actualizado_en: '2026-10-06T10:00:00.000Z',
            }),
          ],
          registro,
        ),
      propuesta_revisiones: (registro) =>
        paginarFilas(
          [
            filaRevision('rev-rechazada', 'prop-rechazada', 'A', {
              estado: 'REJECTED',
              folio_revision: 'CNC-1026_02-A',
            }),
            filaRevision('rev-aceptada', 'prop-aceptada', 'A', { estado: 'ACCEPTED' }),
          ],
          registro,
        ),
      propuesta_items: (registro) =>
        paginarFilas(
          [
            filaItem('it-rechazada', 'rev-rechazada', { precio_unitario: 1 }),
            filaItem('it-aceptada', 'rev-aceptada', { precio_unitario: 50, cantidad: 4 }),
          ],
          registro,
        ),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toMatchObject({
      tipo: 'propuesta',
      subtotal: 200,
      origen: { propuestaId: 'prop-aceptada', aceptada: true },
    });
  });

  it('sin revisión vigente registrada toma la letra más alta', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({
        propuesta: filaPropuesta('prop-1', 'cot-1', { revision_vigente_id: null }),
        revisiones: [
          filaRevision('prop-1-revA', 'prop-1', 'A'),
          filaRevision('prop-1-revB', 'prop-1', 'B'),
        ],
        items: [
          filaItem('it-a', 'prop-1-revA', { cantidad: 1, precio_unitario: 10 }),
          filaItem('it-b', 'prop-1-revB', { cantidad: 1, precio_unitario: 20 }),
        ],
      }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toMatchObject({ tipo: 'propuesta', subtotal: 20 });
  });

  it('si la revisión vigente no está entre las legibles no adivina otra', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({
        propuesta: filaPropuesta('prop-1', 'cot-1', { revision_vigente_id: 'revision-inexistente' }),
      }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'error' });
  });

  it('respeta las líneas del cotizador anterior cuando sí existen', async () => {
    const { cliente, consultas } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [filaLinea('lin-1', 'cot-1')], error: null, count: 1 }),
      ...respuestasPropuesta({}),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'cotizador', subtotal: 1000, moneda: 'MXN' });
    expect(consultas.length).toBeGreaterThan(0);
  });
});

describe('la revisión aceptada manda sobre las líneas antiguas del cotizador', () => {
  /** Línea antigua: 4 × $250 = $1,000.00. */
  const LINEA_ANTIGUA = () => ({ data: [filaLinea('lin-1', 'cot-1')], error: null, count: 1 });

  /** Propuesta aceptada: 2 piezas × $100 = $200.00 antes del IVA. */
  function propuestaAceptada(extra: Parameters<typeof respuestasPropuesta>[0] = {}) {
    return respuestasPropuesta({
      propuesta: filaPropuesta('prop-1', 'cot-1', {
        estado: 'ACCEPTED',
        revision_vigente_id: 'prop-1-revA',
        accepted_revision_id: 'prop-1-revA',
      }),
      revisiones: [filaRevision('prop-1-revA', 'prop-1', 'A', { estado: 'ACCEPTED' })],
      items: [filaItem('it-1', 'prop-1-revA', { cantidad: 2, precio_unitario: 100 })],
      ...extra,
    });
  }

  it('con líneas antiguas y revisión aceptada muestra el importe aceptado, no la cotización vieja', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: LINEA_ANTIGUA,
      ...propuestaAceptada(),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toMatchObject({
      tipo: 'propuesta',
      subtotal: 200,
      origen: { propuestaId: 'prop-1', folioRevision: 'CNC-1026_01-A', aceptada: true },
    });
    // Las líneas antiguas siguen disponibles como historial.
    expect(cotizacion?.lineas).toHaveLength(1);
    expect(cotizacion?.subtotal).toBe(1000);
  });

  it('la aceptada manda aunque exista una propuesta posterior sin aceptar', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: LINEA_ANTIGUA,
      propuestas: (registro) =>
        paginarFilas(
          [
            filaPropuesta('prop-nueva', 'cot-1', {
              folio_cnc: 'CNC-1026_02',
              estado: 'DRAFT',
              revision_vigente_id: 'rev-nueva',
              actualizado_en: '2026-10-09T10:00:00.000Z',
            }),
            filaPropuesta('prop-1', 'cot-1', {
              estado: 'ACCEPTED',
              revision_vigente_id: 'prop-1-revA',
              accepted_revision_id: 'prop-1-revA',
            }),
          ],
          registro,
        ),
      propuesta_revisiones: (registro) =>
        paginarFilas(
          [
            filaRevision('rev-nueva', 'prop-nueva', 'A', { estado: 'DRAFT', folio_revision: 'CNC-1026_02-A' }),
            filaRevision('prop-1-revA', 'prop-1', 'A', { estado: 'ACCEPTED' }),
          ],
          registro,
        ),
      propuesta_items: (registro) =>
        paginarFilas(
          [
            filaItem('it-nueva', 'rev-nueva', { cantidad: 1, precio_unitario: 7777 }),
            filaItem('it-1', 'prop-1-revA', { cantidad: 2, precio_unitario: 100 }),
          ],
          registro,
        ),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toMatchObject({
      tipo: 'propuesta',
      subtotal: 200,
      origen: { propuestaId: 'prop-1' },
    });
  });

  it.each([
    ['en borrador', 'DRAFT'],
    ['enviada', 'SENT'],
    ['rechazada', 'REJECTED'],
    ['cerrada', 'CLOSED'],
  ])('conserva el cotizador cuando la propuesta %s no tiene revisión aceptada', async (_nombre, estado) => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: LINEA_ANTIGUA,
      ...respuestasPropuesta({
        propuesta: filaPropuesta('prop-1', 'cot-1', { estado, accepted_revision_id: null }),
      }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'cotizador', subtotal: 1000, moneda: 'MXN' });
  });

  it('si falla la lectura de propuestas no adivina con el cotizador', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: LINEA_ANTIGUA,
      propuestas: () => ERROR_LECTURA,
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'error' });
  });

  it.each([
    ['fallan las revisiones', { propuesta_revisiones: () => ERROR_LECTURA }],
    ['fallan los ítems de la aceptada', { propuesta_items: () => ERROR_LECTURA }],
  ])('si %s no vuelve a las líneas antiguas', async (_nombre, fallo) => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: LINEA_ANTIGUA,
      ...propuestaAceptada(),
      ...fallo,
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'error' });
  });

  it('si la revisión aceptada no está entre las legibles no vuelve a las líneas antiguas', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: LINEA_ANTIGUA,
      ...propuestaAceptada({
        revisiones: [filaRevision('otra-revision', 'prop-1', 'B', { estado: 'DRAFT' })],
      }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'error' });
  });

  it('una aceptada con precios en cero es el importe registrado, no la cotización vieja', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: LINEA_ANTIGUA,
      ...propuestaAceptada({ items: [filaItem('it-1', 'prop-1-revA', { precio_unitario: 0 })] }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toMatchObject({ tipo: 'propuesta', subtotal: 0 });
  });

  it('sin permiso a Propuestas las líneas antiguas son lo único legible y se conservan', async () => {
    const { cliente, consultas } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: LINEA_ANTIGUA,
      ...propuestaAceptada(),
    });

    const [cotizacion] = (
      await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1, { incluirPropuestas: false })
    ).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'cotizador', subtotal: 1000, moneda: 'MXN' });
    expect(consultas.some((consulta) => consulta.tabla.startsWith('propuesta'))).toBe(false);
  });

  it('la ficha muestra el importe aceptado y rotula las líneas antiguas como historial', async () => {
    obtenerClienteMock.mockReturnValue(
      crearSupabaseFalsoHistorial({
        pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
        cotizacion_lineas: LINEA_ANTIGUA,
        ordenes_produccion: () => ({ data: [], error: null, count: 0 }),
        ...propuestaAceptada(),
      }).cliente,
    );

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID, puedeVerPropuestas: true }), {
      wrapper: crearWrapper(),
    });

    const importe = await screen.findByTestId('importe-cotizacion-cot-1');
    expect(importe.textContent).toContain(formatearMoneda(200, 'MXN'));
    expect(importe.textContent).toContain('CNC-1026_01-A');
    expect(importe.textContent).toContain('Aceptada');
    expect(importe.textContent).not.toContain(formatearMoneda(1000, 'MXN'));

    fireEvent.click(screen.getByRole('button', { name: 'Ver líneas de la cotización OP-000001' }));
    const nota = screen.getByTestId('nota-lineas-antiguas-cot-1');
    expect(nota.textContent).toContain('solo como historial');
    expect(nota.textContent).toContain('CNC-1026_01-A');
  });

  it('sin revisión aceptada la ficha conserva el cotizador y no agrega la nota de líneas antiguas', async () => {
    obtenerClienteMock.mockReturnValue(
      crearSupabaseFalsoHistorial({
        pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
        cotizacion_lineas: LINEA_ANTIGUA,
        ordenes_produccion: () => ({ data: [], error: null, count: 0 }),
        ...respuestasPropuesta({}),
      }).cliente,
    );

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID, puedeVerPropuestas: true }), {
      wrapper: crearWrapper(),
    });

    expect((await screen.findByTestId('importe-cotizacion-cot-1')).textContent).toContain(
      formatearMoneda(1000, 'MXN'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver líneas de la cotización OP-000001' }));
    expect(screen.queryByTestId('nota-lineas-antiguas-cot-1')).toBeNull();
  });
});

describe('distinción entre cero real, dato ausente y error', () => {
  it('conserva un cero real: propuesta enviada con precios en cero', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({ items: [filaItem('it-1', 'prop-1-revA', { precio_unitario: 0 })] }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toMatchObject({ tipo: 'propuesta', subtotal: 0, total: 0 });
  });

  it('un borrador sin precios capturados es «pendiente», no $0.00', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({
        propuesta: filaPropuesta('prop-1', 'cot-1', { estado: 'DRAFT' }),
        revisiones: [filaRevision('prop-1-revA', 'prop-1', 'A', { estado: 'DRAFT', enviado_en: null })],
        items: [filaItem('it-1', 'prop-1-revA', { precio_unitario: 0 })],
      }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toMatchObject({
      tipo: 'pendiente',
      origen: { folioRevision: 'CNC-1026_01-A', estadoRevision: 'DRAFT' },
    });
  });

  it('una revisión sin ítems activos también es «pendiente»', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({
        items: [filaItem('it-1', 'prop-1-revA', { activo: false, precio_unitario: 500 })],
      }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe.tipo).toBe('pendiente');
  });

  it('sin propuesta ni líneas informa «sin datos» y la ficha no pinta $0.00', async () => {
    obtenerClienteMock.mockReturnValue(
      crearSupabaseFalsoHistorial({
        pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
        cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
        propuestas: () => ({ data: [], error: null, count: 0 }),
      }).cliente,
    );

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID, puedeVerPropuestas: true }), {
      wrapper: crearWrapper(),
    });

    const importe = await screen.findByTestId('importe-cotizacion-cot-1');
    expect(importe.textContent).toContain('Sin importe registrado');
    expect(screen.queryByText(formatearMoneda(0, 'MXN'))).toBeNull();
  });

  it('si falla la lectura de propuestas no inventa un monto', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      propuestas: () => ERROR_LECTURA,
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'error' });
  });

  it('si fallan los ítems de la revisión elegida no muestra importe', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({}),
      propuesta_items: () => ERROR_LECTURA,
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'error' });
  });

  it('con moneda desconocida en la revisión no asume MXN', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({
        revisiones: [filaRevision('prop-1-revA', 'prop-1', 'A', { moneda: null })],
      }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'error' });
  });

  it('con IVA ilegible conserva el subtotal y omite IVA y total', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({
        revisiones: [filaRevision('prop-1-revA', 'prop-1', 'A', { iva_porcentaje: null })],
      }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toMatchObject({ tipo: 'propuesta', subtotal: 1255, iva: null, total: null });
  });

  it('si el cotizador anterior falla pero la propuesta responde, usa la propuesta', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ERROR_LECTURA,
      ...respuestasPropuesta({}),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.lineas).toBeNull();
    expect(cotizacion?.importe).toMatchObject({ tipo: 'propuesta', subtotal: 1255 });
  });

  it('si el cotizador anterior falla y no hay propuesta no afirma que no haya importe', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ERROR_LECTURA,
      propuestas: () => ({ data: [], error: null, count: 0 }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'error' });
  });

  it('suma descuentos como resta y solo cuenta ítems activos', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({
        items: [
          filaItem('it-1', 'prop-1-revA', { cantidad: 1, precio_unitario: 1000 }),
          filaItem('it-2', 'prop-1-revA', { cantidad: 1, precio_unitario: 100, es_descuento: true }),
          filaItem('it-3', 'prop-1-revA', { cantidad: 5, precio_unitario: 999, activo: false }),
        ],
      }),
    });

    const [cotizacion] = (await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).registros;

    expect(cotizacion?.importe).toMatchObject({ tipo: 'propuesta', subtotal: 900 });
  });
});

describe('permisos y mínima exposición', () => {
  it('sin permiso de propuestas no consulta sus tablas y avisa que el importe no es visible', async () => {
    const { cliente, consultas } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({}),
    });

    const [cotizacion] = (
      await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1, { incluirPropuestas: false })
    ).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'sin-permiso' });
    expect(consultas.some((consulta) => consulta.tabla.startsWith('propuesta'))).toBe(false);
  });

  it('sin permiso, las líneas legibles del cotizador anterior siguen mostrándose', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [filaLinea('lin-1', 'cot-1')], error: null, count: 1 }),
    });

    const [cotizacion] = (
      await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1, { incluirPropuestas: false })
    ).registros;

    expect(cotizacion?.importe).toEqual({ tipo: 'cotizador', subtotal: 1000, moneda: 'MXN' });
  });

  it('nunca lee costos, ruteo, márgenes ni la cabecera completa de la revisión', async () => {
    const { cliente, consultas } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({}),
    });

    await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1);
    await obtenerPropuestasCliente(cliente, CLIENTE_ID, 1);

    const tablas = new Set(consultas.map((consulta) => consulta.tabla));
    expect(tablas.has('propuesta_revision_costos')).toBe(false);
    expect(tablas.has('propuesta_item_ruteo')).toBe(false);
    expect(tablas.has('propuesta_pdfs')).toBe(false);
    for (const consulta of consultas.filter((fila) => fila.tabla.startsWith('propuesta'))) {
      expect(consulta.columnas).not.toContain('*');
      expect(consulta.columnas).not.toMatch(/costo|margen|tarifa|responsable|snapshot_cabecera,/);
    }
    // Solo moneda e IVA salen del JSONB de cabecera; no se descarga el resto.
    const revisiones = consultas.find((consulta) => consulta.tabla === 'propuesta_revisiones');
    expect(revisiones?.columnas).toContain('snapshot_cabecera->>moneda');
    expect(revisiones?.columnas).toContain('snapshot_cabecera->>iva_porcentaje');
  });

  it('acota las consultas a los RFQ de la página mediante la consulta, no la UI', async () => {
    const { cliente, consultas } = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1), filaPipeline(2)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({}),
    });

    await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1);

    const consultaPropuestas = consultas.find((consulta) => consulta.tabla === 'propuestas');
    expect(consultaPropuestas?.dentroDe).toEqual([['rfq_id', ['cot-1', 'cot-2']]]);
  });

  it('no consulta propuestas cuando la página de cotizaciones viene vacía', async () => {
    const { cliente, consultas } = crearSupabaseFalsoHistorial({
      pipeline: () => ({ data: [], error: null, count: 0 }),
    });

    await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1);

    expect(consultas.some((consulta) => consulta.tabla.startsWith('propuesta'))).toBe(false);
  });
});

describe('servicio de propuestas del cliente', () => {
  it('filtra por cliente en el servidor, ordena por fecha descendente y pagina', async () => {
    const propuestas = Array.from({ length: 7 }, (_, i) =>
      filaPropuesta(`prop-${i + 1}`, `cot-${i + 1}`, { folio_cnc: `CNC-1026_0${i + 1}` }),
    );
    const { cliente, consultas } = crearSupabaseFalsoHistorial({
      propuestas: (registro) => paginarFilas(propuestas, registro),
    });

    const pagina2 = await obtenerPropuestasCliente(cliente, CLIENTE_ID, 2);

    expect(pagina2.total).toBe(7);
    expect(pagina2.pagina).toBe(2);
    expect(pagina2.registros).toHaveLength(2);
    const consulta = consultas.find((fila) => fila.tabla === 'propuestas');
    expect(consulta?.igualdades).toEqual([['cliente_id', CLIENTE_ID]]);
    expect(consulta?.ordenes).toEqual([
      ['creado_en', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(consulta?.rango).toEqual([5, 9]);
    expect(consulta?.conteo).toBe('exact');
  });

  it('entrega revisiones con importe y los eventos históricos de cada una', async () => {
    const { cliente, consultas } = crearSupabaseFalsoHistorial({
      ...respuestasPropuesta({
        propuesta: filaPropuesta('prop-1', 'cot-1', {
          estado: 'ACCEPTED',
          revision_vigente_id: 'prop-1-revB',
          accepted_revision_id: 'prop-1-revA',
        }),
        revisiones: [
          filaRevision('prop-1-revA', 'prop-1', 'A', { estado: 'ACCEPTED' }),
          filaRevision('prop-1-revB', 'prop-1', 'B', { estado: 'DRAFT', enviado_en: null }),
        ],
        items: [
          filaItem('it-a', 'prop-1-revA', { cantidad: 2, precio_unitario: 100 }),
          filaItem('it-b', 'prop-1-revB', { cantidad: 1, precio_unitario: 0 }),
        ],
        eventos: [
          filaEvento('ev-1', 'prop-1-revA'),
          filaEvento('ev-2', 'prop-1-revA', { accion: 'aceptar_revision', estado_anterior: 'SENT', estado_nuevo: 'ACCEPTED' }),
        ],
      }),
    });

    const pagina = await obtenerPropuestasCliente(cliente, CLIENTE_ID, 1);
    const propuesta = pagina.registros[0];
    const revA = propuesta?.revisiones?.find((fila) => fila.letra === 'A');
    const revB = propuesta?.revisiones?.find((fila) => fila.letra === 'B');

    expect(propuesta?.folioCnc).toBe('CNC-1026_01');
    expect(propuesta?.revisionAceptadaId).toBe('prop-1-revA');
    expect(revA?.importe).toMatchObject({ subtotal: 200, iva: 32, total: 232, moneda: 'MXN' });
    expect(revA?.eventos?.map((evento) => evento.accion)).toEqual(['enviar_revision', 'aceptar_revision']);
    expect(revA?.eventos?.[0]).toMatchObject({ canal: 'correo', destino: 'compras@cliente.test' });
    const consultaEventos = consultas.find((fila) => fila.tabla === 'propuesta_revision_eventos');
    expect(consultaEventos?.ordenes[0]).toEqual(['creado_en', { ascending: false }]);
    expect(revB?.conPrecio).toBe(false);
    expect(revB?.eventos).toEqual([]);
  });

  it('distingue eventos no legibles (null) de una revisión sin eventos ([])', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      ...respuestasPropuesta({}),
      propuesta_revision_eventos: () => ERROR_LECTURA,
    });

    const pagina = await obtenerPropuestasCliente(cliente, CLIENTE_ID, 1);

    expect(pagina.registros[0]?.revisiones?.[0]?.eventos).toBeNull();
    expect(pagina.registros[0]?.revisiones?.[0]?.importe).not.toBeNull();
  });

  it('marca como no legibles las revisiones si falla su consulta', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({
      ...respuestasPropuesta({}),
      propuesta_revisiones: () => ERROR_LECTURA,
    });

    const pagina = await obtenerPropuestasCliente(cliente, CLIENTE_ID, 1);

    expect(pagina.registros[0]?.revisiones).toBeNull();
  });

  it('lanza un error genérico si falla la consulta de propuestas', async () => {
    const { cliente } = crearSupabaseFalsoHistorial({ propuestas: () => ERROR_LECTURA });

    await expect(obtenerPropuestasCliente(cliente, CLIENTE_ID, 1)).rejects.toThrow(
      'No se pudo cargar el historial de propuestas',
    );
  });

  it('recupera todos los ítems aunque superen el límite de una respuesta', async () => {
    const items = Array.from({ length: 450 }, (_, i) =>
      filaItem(`it-${i}`, 'prop-1-revA', { cantidad: 1, precio_unitario: 1 }),
    );
    const { cliente } = crearSupabaseFalsoHistorial({
      ...respuestasPropuesta({}),
      propuesta_items: (registro) => paginarFilas(items, registro),
    });

    const pagina = await obtenerPropuestasCliente(cliente, CLIENTE_ID, 1);

    expect(pagina.registros[0]?.revisiones?.[0]?.partidasActivas).toBe(450);
    expect(pagina.registros[0]?.revisiones?.[0]?.importe?.subtotal).toBe(450);
  });

  it('no consulta revisiones cuando el cliente no tiene propuestas', async () => {
    const { cliente, consultas } = crearSupabaseFalsoHistorial({
      propuestas: () => ({ data: [], error: null, count: 0 }),
    });

    const pagina = await obtenerPropuestasCliente(cliente, CLIENTE_ID, 1);

    expect(pagina.registros).toEqual([]);
    expect(consultas.map((consulta) => consulta.tabla)).toEqual(['propuestas']);
  });
});

function crearWrapper() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: cliente }, children);
  };
}

describe('sección «Propuestas» de la ficha del cliente', () => {
  function montarConPropuesta(extra: Parameters<typeof respuestasPropuesta>[0] = {}) {
    const falso = crearSupabaseFalsoHistorial({
      pipeline: () => ({ data: [], error: null, count: 0 }),
      ordenes_produccion: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta(extra),
    });
    obtenerClienteMock.mockReturnValue(falso.cliente);
    return falso;
  }

  it('lista las propuestas, enlaza a la original y expande revisiones con sus eventos', async () => {
    montarConPropuesta({
      propuesta: filaPropuesta('prop-1', 'cot-1', {
        estado: 'ACCEPTED',
        revision_vigente_id: 'prop-1-revA',
        accepted_revision_id: 'prop-1-revA',
      }),
      revisiones: [filaRevision('prop-1-revA', 'prop-1', 'A', { estado: 'ACCEPTED' })],
      eventos: [
        filaEvento('ev-1', 'prop-1-revA'),
        filaEvento('ev-2', 'prop-1-revA', {
          accion: 'aceptar_revision',
          estado_anterior: 'SENT',
          estado_nuevo: 'ACCEPTED',
          canal: null,
          destino: null,
          motivo: 'Aprobó compras',
        }),
      ],
    });

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID, puedeVerPropuestas: true }), {
      wrapper: crearWrapper(),
    });

    const enlace = await screen.findByTestId('enlace-propuesta-prop-1');
    expect(enlace.getAttribute('href')).toBe('/propuestas?propuesta=prop-1');
    expect(screen.queryByTestId('revision-prop-1-revA')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ver revisiones de la propuesta CNC-1026_01' }));

    const revision = screen.getByTestId('revision-prop-1-revA');
    expect(within(revision).getByText(/CNC-1026_01-A/)).toBeTruthy();
    expect(revision.textContent).toContain(formatearMoneda(1255, 'MXN'));
    expect(revision.textContent).toContain(formatearMoneda(1455.8, 'MXN'));
    expect(revision.textContent).toContain('Aceptada');
    const eventos = within(revision).getAllByRole('listitem');
    expect(eventos.map((evento) => evento.textContent).join('|')).toContain('Aprobó compras');
    // Se ven etiquetas de negocio, no los códigos técnicos de la RPC.
    expect(within(revision).getByText('Revisión enviada')).toBeTruthy();
    expect(within(revision).getByText('Revisión aceptada')).toBeTruthy();
    expect(revision.textContent).not.toMatch(/enviar_revision|aceptar_revision/);
  });

  it('muestra «Precio pendiente» y no $0.00 para una revisión sin precios', async () => {
    montarConPropuesta({
      propuesta: filaPropuesta('prop-1', 'cot-1', { estado: 'DRAFT' }),
      revisiones: [filaRevision('prop-1-revA', 'prop-1', 'A', { estado: 'DRAFT', enviado_en: null })],
      items: [filaItem('it-1', 'prop-1-revA', { precio_unitario: 0 })],
    });

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID, puedeVerPropuestas: true }), {
      wrapper: crearWrapper(),
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Ver revisiones de la propuesta CNC-1026_01' }),
    );

    const revision = screen.getByTestId('revision-prop-1-revA');
    expect(revision.textContent).toContain('Precio pendiente');
    expect(revision.textContent).not.toContain(formatearMoneda(0, 'MXN'));
  });

  it('avisa cuando los eventos de una revisión no se pudieron leer', async () => {
    obtenerClienteMock.mockReturnValue(
      crearSupabaseFalsoHistorial({
        pipeline: () => ({ data: [], error: null, count: 0 }),
        ordenes_produccion: () => ({ data: [], error: null, count: 0 }),
        ...respuestasPropuesta({}),
        propuesta_revision_eventos: () => ERROR_LECTURA,
      }).cliente,
    );

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID, puedeVerPropuestas: true }), {
      wrapper: crearWrapper(),
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Ver revisiones de la propuesta CNC-1026_01' }),
    );

    expect(screen.getByTestId('revision-prop-1-revA').textContent).toContain(
      'No se pudieron recuperar los eventos',
    );
  });

  it('distingue «sin propuestas» de un error de carga', async () => {
    obtenerClienteMock.mockReturnValue(
      crearSupabaseFalsoHistorial({
        pipeline: () => ({ data: [], error: null, count: 0 }),
        ordenes_produccion: () => ({ data: [], error: null, count: 0 }),
        propuestas: () => ({ data: [], error: null, count: 0 }),
      }).cliente,
    );

    const vista = render(
      createElement(HistorialCliente, { clienteId: CLIENTE_ID, puedeVerPropuestas: true }),
      { wrapper: crearWrapper() },
    );
    expect(await screen.findByText('Sin propuestas')).toBeTruthy();
    vista.unmount();

    obtenerClienteMock.mockReturnValue(
      crearSupabaseFalsoHistorial({
        pipeline: () => ({ data: [], error: null, count: 0 }),
        ordenes_produccion: () => ({ data: [], error: null, count: 0 }),
        propuestas: () => ERROR_LECTURA,
      }).cliente,
    );
    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID, puedeVerPropuestas: true }), {
      wrapper: crearWrapper(),
    });
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudieron cargar las propuestas del cliente.');
    expect(screen.queryByText('Sin propuestas')).toBeNull();
  });

  it('sin permiso oculta la sección, no consulta propuestas y rotula el importe', async () => {
    const falso = crearSupabaseFalsoHistorial({
      pipeline: (registro) => paginarFilas([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [], error: null, count: 0 }),
      ordenes_produccion: () => ({ data: [], error: null, count: 0 }),
      ...respuestasPropuesta({}),
    });
    obtenerClienteMock.mockReturnValue(falso.cliente);

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID }), {
      wrapper: crearWrapper(),
    });

    const importe = await screen.findByTestId('importe-cotizacion-cot-1');
    expect(importe.textContent).toContain('Importe no visible para tu rol');
    expect(screen.queryByText('Propuestas')).toBeNull();
    expect(falso.consultas.some((consulta) => consulta.tabla.startsWith('propuesta'))).toBe(false);
  });

  it('escucha cambios de propuestas y revisiones en el canal único de la ficha', async () => {
    const falso = montarConPropuesta({});

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID, puedeVerPropuestas: true }), {
      wrapper: crearWrapper(),
    });
    await screen.findByTestId('enlace-propuesta-prop-1');

    expect(falso.canalesCreados).toEqual([`historial-cliente-${CLIENTE_ID}`]);
    expect(falso.tablasEscuchadas).toEqual(
      expect.arrayContaining(['propuestas', 'propuesta_revisiones', 'pipeline', 'ordenes_produccion']),
    );
  });
});
