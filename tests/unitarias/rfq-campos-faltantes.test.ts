// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { Rfq, RfqItem } from '@/modulos/rfq/tipos/indice';
import {
  analizarFaltantesCliente,
  analizarFaltantesGenerales,
  analizarFaltantesItem,
  analizarFaltantesSeguimiento,
  etiquetasFaltantesItem,
  faltaArchivoTecnico,
  faltaItemActivo,
} from '@/modulos/rfq/utilidades/faltantes';

const { listarArchivosMock, contactosMock } = vi.hoisted(() => ({
  listarArchivosMock: vi.fn(),
  contactosMock: vi.fn(),
}));

vi.mock('@/modulos/rfq/acciones/guardar-item-rfq', () => ({
  guardarItemRfqAccion: vi.fn(),
}));
vi.mock('@/modulos/rfq/acciones/cancelar-item-rfq', () => ({
  cancelarItemRfqAccion: vi.fn(),
}));
vi.mock('@/modulos/rfq/acciones/archivos-rfq', () => ({
  listarArchivosRfqAccion: (...args: unknown[]) => listarArchivosMock(...args),
  prepararSubidaArchivoRfqAccion: vi.fn(),
  confirmarArchivoRfqAccion: vi.fn(),
  descartarSubidaArchivoRfqAccion: vi.fn(),
  firmarArchivoRfqAccion: vi.fn(),
}));
vi.mock('@/nucleo/almacenamiento/archivos/subida-navegador', () => ({
  subirArchivoDirecto: vi.fn(),
}));
vi.mock('@/modulos/rfq/acciones/actualizar-datos-rfq', () => ({
  actualizarDatosRfqAccion: vi.fn(),
}));
vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({
  obtenerContactosClienteRfqAccion: (...args: unknown[]) => contactosMock(...args),
  obtenerCatalogosRfqAccion: vi.fn(),
}));
vi.mock('@/modulos/rfq/acciones/contactos-rfq', () => ({
  obtenerContactoPrincipalRfqAccion: vi.fn().mockResolvedValue({ exito: true, datos: null }),
  asegurarContactoRfqAccion: vi.fn(),
}));

import type { CatalogosRfq } from '@/modulos/rfq/acciones/obtener-catalogos';
import { FormularioGeneralRfq } from '@/modulos/rfq/componentes/formulario-general-rfq';
import { PanelArchivosRfq } from '@/modulos/rfq/componentes/panel-archivos-rfq';
import { ResumenRfq } from '@/modulos/rfq/componentes/resumen-rfq';
import { TablaItemsRfq } from '@/modulos/rfq/componentes/tabla-items-rfq';
import { SelectorCliente } from '@/modulos/pipeline/componentes/selector-cliente';

const RFQ_ID = '20000000-0000-4000-8000-000000000001';

const ITEM_IT01: RfqItem = {
  id: 'item-1',
  rfqId: RFQ_ID,
  numero: 1,
  codigo: 'IT01',
  descripcion: 'Placa base',
  cantidad: 2,
  materialId: null,
  espesorId: null,
  acabado: null,
  notas: null,
  estado: 'activo',
  creadoEn: '2026-10-08T00:00:00.000Z',
  actualizadoEn: '2026-10-08T00:00:00.000Z',
  operaciones: [],
};

const RFQ_BASE: Rfq = {
  id: RFQ_ID,
  folio: 'RFQ-1026_01',
  folioOp: 'OP-000001',
  folioCnc: null,
  estadoRfq: 'INCOMPLETE',
  etapa: 'contactado',
  clienteId: null,
  condicionesPago: null,
  clienteNombre: null,
  empresa: 'Cliente QA',
  contactoId: null,
  contactoNombre: null,
  nombreContacto: 'Contacto QA',
  vendedorId: '30000000-0000-4000-8000-000000000001',
  responsableId: null,
  responsableNombre: null,
  canal: null,
  canalDetalle: null,
  fechaSolicitud: null,
  fechaRequeridaCliente: null,
  descripcionGeneral: null,
  proximaAccionCodigo: null,
  proximaAccionTexto: null,
  fechaProximaAccion: null,
  responsableProximaAccionId: null,
  responsableProximaAccionNombre: null,
  actualizadoEn: '2026-10-08T00:00:00.000Z',
  items: [],
};

const RFQ_CON_ITEM: Rfq = { ...RFQ_BASE, items: [ITEM_IT01] };

const CATALOGOS: CatalogosRfq = {
  materiales: [],
  espesores: [],
  procesos: [{ id: 'p-1', codigo: 'CORTE', nombre: 'Corte láser', requiereArchivoTecnico: true }],
  canales: [{ codigo: 'TELEFONO', nombre: 'Teléfono', esOtro: false, activo: true }],
  proximasAcciones: [{ codigo: 'LLAMAR', nombre: 'Llamar', esOtro: false }],
  usuarios: [],
};

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

beforeEach(() => {
  vi.clearAllMocks();
  listarArchivosMock.mockResolvedValue({ exito: true, datos: [] });
  contactosMock.mockResolvedValue({ exito: true, datos: [] });
});

afterEach(cleanup);

describe('faltantes de validar_rfq_listo — analizadores por campo', () => {
  it('cliente: ligado/activo y contacto vigente', () => {
    expect(analizarFaltantesCliente(['cliente ligado', 'contacto vigente del cliente'])).toEqual({
      cliente: true,
      contacto: true,
    });
    expect(analizarFaltantesCliente(['cliente activo']).cliente).toBe(true);
    expect(analizarFaltantesCliente([])).toEqual({ cliente: false, contacto: false });
  });

  it('generales y seguimiento por mensaje del servidor', () => {
    expect(
      analizarFaltantesGenerales(['canal', 'descripción general', 'fecha de solicitud']),
    ).toEqual({
      descripcionGeneral: true,
      canal: true,
      fechaSolicitud: true,
      responsable: false,
    });
    expect(
      analizarFaltantesSeguimiento(['próxima acción', 'responsable de próxima acción']),
    ).toEqual({
      proximaAccion: true,
      detalleProximaAccion: false,
      fechaProximaAccion: false,
      responsableProximaAccion: true,
    });
  });

  it('ítem por código, con "espesor del material" contando como espesor', () => {
    const faltantes = [
      'ítem IT01: material',
      'ítem IT01: espesor del material',
      'ítem IT02: al menos una operación solicitada',
    ];
    expect(analizarFaltantesItem(faltantes, 'IT01')).toEqual({
      material: true,
      espesor: true,
      operaciones: false,
    });
    expect(analizarFaltantesItem(faltantes, 'IT02')).toEqual({
      material: false,
      espesor: false,
      operaciones: true,
    });
    expect(
      etiquetasFaltantesItem(analizarFaltantesItem(faltantes, 'IT02')),
    ).toEqual(['una operación']);
  });

  it('sección de ítems y archivo técnico', () => {
    expect(faltaItemActivo(['al menos un ítem activo'])).toBe(true);
    expect(faltaItemActivo(['ítem IT01: material'])).toBe(false);
    expect(faltaArchivoTecnico(['archivo técnico (CAD/DIBUJO/ESPECIFICACIONES)'])).toBe(true);
    expect(faltaArchivoTecnico(['al menos un ítem activo'])).toBe(false);
  });
});

describe('ResumenRfq — campos faltantes y obligatorios', () => {
  it('marca con borde rojo solo los campos faltantes y con asterisco los obligatorios', () => {
    render(
      createElement(ResumenRfq, {
        rfq: RFQ_BASE,
        catalogos: CATALOGOS,
        onEditar: vi.fn(),
        faltantes: {
          cliente: ['cliente ligado'],
          general: ['canal', 'descripción general'],
          seguimiento: ['próxima acción'],
        },
      }),
    );

    const canalSpan = screen.getByText('Canal');
    const canal = canalSpan.closest('[data-faltante]');
    expect(canal?.getAttribute('data-faltante')).toBe('si');
    expect(canalSpan.className).toContain("after:content-['*']");

    const fechaSolicitudSpan = screen.getByText('Fecha de solicitud');
    const fechaSolicitud = fechaSolicitudSpan.closest('[data-faltante]');
    expect(fechaSolicitud?.getAttribute('data-faltante')).toBe('no');
    expect(fechaSolicitudSpan.className).toContain("after:content-['*']");

    const accion = screen.getByText('Acción').closest('[data-faltante]');
    expect(accion?.getAttribute('data-faltante')).toBe('si');

    const descripcion = document.querySelector('[data-testid="rfq-descripcion"]');
    expect(descripcion?.querySelector('[data-faltante="si"]')).not.toBeNull();
  });
});

describe('TablaItemsRfq — campos faltantes del ítem', () => {
  it('muestra la pista por fila y marca los campos al editar', () => {
    render(
      createElement(TablaItemsRfq, {
        rfq: RFQ_CON_ITEM,
        catalogos: CATALOGOS,
        onCambio: vi.fn(),
        faltantes: ['ítem IT01: material', 'ítem IT01: al menos una operación solicitada'],
      }),
    );

    expect(screen.getByTestId('item-faltantes-IT01').textContent).toContain(
      'Falta: material, una operación',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    const material = screen.getByRole('combobox', { name: 'Material' });
    expect(material.getAttribute('aria-invalid')).toBe('true');
    expect(material.getAttribute('aria-required')).toBe('true');
    expect(material.className).toContain('border-peligro/50');
    expect(material.closest('label')?.className).toContain("after:content-['*']");

    const operaciones = screen.getByRole('group', { name: 'Operaciones solicitadas' });
    expect(operaciones.getAttribute('data-faltante')).toBe('si');
    expect(screen.getByText('Falta al menos una operación solicitada.')).toBeDefined();
  });
});

describe('PanelArchivosRfq — archivo técnico faltante', () => {
  it('marca el campo Archivo cuando falta el técnico exigido', async () => {
    render(
      envolver(
        createElement(PanelArchivosRfq, {
          rfq: RFQ_BASE,
          faltantes: ['archivo técnico (CAD/DIBUJO/ESPECIFICACIONES)'],
        }),
      ),
    );

    expect(await screen.findByText('Sin archivos cargados.')).toBeDefined();
    const entrada = screen.getByLabelText('Archivo');
    expect(entrada.getAttribute('aria-invalid')).toBe('true');
    expect(entrada.className).toContain('border-peligro/50');
    expect(entrada.closest('label')?.className).toContain("after:content-['*']");
  });
});

describe('FormularioGeneralRfq — campos faltantes del resumen', () => {
  it('marca los campos que reporta la validación del servidor', async () => {
    render(
      envolver(
        createElement(FormularioGeneralRfq, {
          rfq: RFQ_BASE,
          catalogos: CATALOGOS,
          onGuardado: vi.fn(),
          faltantes: {
            cliente: ['contacto vigente del cliente'],
            general: ['canal', 'descripción general'],
            seguimiento: ['próxima acción', 'fecha de próxima acción'],
          },
        }),
      ),
    );

    expect(screen.getByLabelText('Canal').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Descripción general').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Contacto del cliente').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Acción').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Fecha').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Fecha de solicitud').getAttribute('aria-invalid')).toBe('false');
    expect(screen.getByLabelText('Responsable').getAttribute('aria-invalid')).toBe('false');

    const fieldset = screen.getByLabelText('Canal').closest('form')?.querySelector('fieldset');
    expect(fieldset?.getAttribute('data-faltante')).toBe('si');
  });
});

describe('SelectorCliente — estado inválido', () => {
  it('pinta el buscador con borde rojo y aria-invalid cuando falta el cliente', () => {
    render(
      createElement(SelectorCliente, {
        seleccionado: null,
        onSeleccionar: vi.fn(),
        invalido: true,
      }),
    );

    const buscador = screen.getByLabelText('Cliente (opcional)');
    expect(buscador.getAttribute('aria-invalid')).toBe('true');
    expect(buscador.className).toContain('border-peligro/50');
  });
});
