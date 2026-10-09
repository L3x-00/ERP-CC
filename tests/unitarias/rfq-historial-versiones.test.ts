// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { normalizarVersionRfq } from '@/modulos/rfq/tipos/indice';
import type { VersionRfq } from '@/modulos/rfq/tipos/indice';

const { obtenerVersionesMock, obtenerCatalogosMock } = vi.hoisted(() => ({
  obtenerVersionesMock: vi.fn(),
  obtenerCatalogosMock: vi.fn(),
}));

vi.mock('@/modulos/rfq/acciones/obtener-versiones-rfq', () => ({
  obtenerVersionesRfqAccion: (...args: unknown[]) => obtenerVersionesMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({
  obtenerCatalogosRfqAccion: (...args: unknown[]) => obtenerCatalogosMock(...args),
}));

import { DialogoHistorialRfq } from '@/modulos/rfq/componentes/dialogo-historial-rfq';

const FILA_VERSION = {
  id: 'v-2',
  numero: 2,
  causa: 'ITEM',
  actor_id: 'u-1',
  creado_en: '2026-10-08T15:30:00.000Z',
  snapshot_cabecera: {
    folio_rfq: 'RFQ-1026_01',
    estado_rfq: 'INCOMPLETE',
    cliente_id: null,
    contacto_id: null,
    empresa: 'Metales del Norte SA de CV',
    nombre_contacto: 'Ana Pérez',
    canal: 'TELEFONO',
    canal_detalle: null,
    fecha_solicitud: '2026-10-01',
    fecha_requerida: null,
    descripcion_general: 'Corte de lámina',
    responsable_id: null,
    moneda: 'MXN',
    actualizado_en: '2026-10-08T15:00:00.000Z',
  },
  snapshot_items: [
    {
      id: 'i-1',
      codigo: 'IT01',
      numero: 1,
      estado: 'activo',
      descripcion: 'Placa base',
      cantidad: 4,
      material_id: 'm-1',
      espesor_id: 'e-1',
      acabado: null,
      notas: null,
      operaciones: [{ proceso_id: 'p-1', orden: 1 }],
    },
  ],
};

const VERSION_2: VersionRfq = {
  id: 'v-2',
  numero: 2,
  causa: 'ITEM',
  actorId: 'u-1',
  actorNombre: 'Ana QA',
  creadoEn: '2026-10-08T15:30:00.000Z',
  cabecera: {
    folio: 'RFQ-1026_01',
    estadoRfq: 'INCOMPLETE',
    clienteId: null,
    contactoId: null,
    empresa: 'Metales del Norte SA de CV',
    nombreContacto: 'Ana Pérez',
    canal: 'TELEFONO',
    canalDetalle: null,
    fechaSolicitud: '2026-10-01',
    fechaRequerida: null,
    descripcionGeneral: 'Corte de lámina',
    responsableId: null,
    moneda: 'MXN',
    actualizadoEn: '2026-10-08T15:00:00.000Z',
  },
  items: [
    {
      id: 'i-1',
      codigo: 'IT01',
      numero: 1,
      estado: 'activo',
      descripcion: 'Placa base',
      cantidad: 4,
      materialId: 'm-1',
      espesorId: 'e-1',
      acabado: null,
      notas: null,
      operaciones: [{ procesoId: 'p-1', orden: 1 }],
    },
  ],
};

const VERSION_1: VersionRfq = {
  ...VERSION_2,
  id: 'v-1',
  numero: 1,
  causa: 'CABECERA',
  items: [],
};

const CATALOGOS = {
  materiales: [{ id: 'm-1', codigo: 'ACERO', nombre: 'Acero' }],
  espesores: [{ id: 'e-1', materialId: 'm-1', etiqueta: '3 mm', espesorMm: 3 }],
  procesos: [{ id: 'p-1', codigo: 'CORTE', nombre: 'Corte láser', requiereArchivoTecnico: false }],
  canales: [{ codigo: 'TELEFONO', nombre: 'Teléfono', esOtro: false, activo: true }],
  proximasAcciones: [],
  usuarios: [],
};

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

function renderizarHistorial() {
  return render(
    envolver(
      createElement(DialogoHistorialRfq, {
        rfqId: 'rfq-1',
        abierto: true,
        onCambioApertura: vi.fn(),
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerVersionesMock.mockResolvedValue({ exito: true, datos: [VERSION_2, VERSION_1] });
  obtenerCatalogosMock.mockResolvedValue({ exito: true, datos: CATALOGOS });
});

afterEach(cleanup);

describe('normalizarVersionRfq — snapshot de rfq_versiones (C2.1/DC-04)', () => {
  it('mapea los jsonb snake_case al dominio con actor resuelto', () => {
    const version = normalizarVersionRfq(FILA_VERSION, 'Ana QA');

    expect(version).not.toBeNull();
    expect(version?.numero).toBe(2);
    expect(version?.causa).toBe('ITEM');
    expect(version?.actorNombre).toBe('Ana QA');
    expect(version?.cabecera.folio).toBe('RFQ-1026_01');
    expect(version?.cabecera.estadoRfq).toBe('INCOMPLETE');
    expect(version?.items).toHaveLength(1);
    expect(version?.items[0]?.operaciones).toEqual([{ procesoId: 'p-1', orden: 1 }]);
  });

  it('descarta valores sin forma de versión o con causa desconocida', () => {
    expect(normalizarVersionRfq(null)).toBeNull();
    expect(normalizarVersionRfq({ id: 'x' })).toBeNull();
    expect(normalizarVersionRfq({ ...FILA_VERSION, causa: 'OTRA' })).toBeNull();
  });
});

describe('DialogoHistorialRfq — versiones en modal (solo lectura)', () => {
  it('lista las versiones de la más reciente a la más antigua', async () => {
    renderizarHistorial();

    expect(await screen.findByText('v2')).toBeDefined();
    const lista = screen.getByTestId('historial-versiones');
    expect(lista.textContent).toContain('Cambio de ítems');
    expect(lista.textContent).toContain('Ana QA');
    expect(lista.textContent).toContain('v1');
    expect(lista.textContent).toContain('Datos generales');
  });

  it('al elegir una versión muestra sus campos y ítems en solo lectura', async () => {
    renderizarHistorial();

    fireEvent.click(await screen.findByRole('button', { name: /Ver versión 2/ }));

    const detalle = screen.getByTestId('historial-version-detalle');
    expect(detalle.textContent).toContain('RFQ-1026_01');
    expect(detalle.textContent).toContain('Metales del Norte SA de CV');
    expect(detalle.textContent).toContain('Corte de lámina');
    expect(detalle.textContent).toContain('IT01');
    expect(detalle.textContent).toContain('Acero');
    expect(detalle.textContent).toContain('3 mm');
    expect(detalle.textContent).toContain('Corte láser');
    // Solo lectura: no hay campos editables dentro del detalle.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Volver a las versiones' }));
    expect(screen.getByTestId('historial-versiones')).toBeDefined();
    expect(screen.queryByTestId('historial-version-detalle')).toBeNull();
  });

  it('sin versiones registradas lo explica sin romper el modal', async () => {
    obtenerVersionesMock.mockResolvedValue({ exito: true, datos: [] });
    renderizarHistorial();

    expect(await screen.findByText(/Sin versiones registradas/)).toBeDefined();
  });

  it('un error de carga ofrece reintentar', async () => {
    obtenerVersionesMock.mockResolvedValue({ exito: false, error: 'Sin permiso para ver RFQ' });
    renderizarHistorial();

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Sin permiso para ver RFQ',
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDefined();
  });
});
