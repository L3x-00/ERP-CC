// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CatalogosRfq } from '@/modulos/rfq/acciones/obtener-catalogos';
import { TablaItemsRfq } from '@/modulos/rfq/componentes/tabla-items-rfq';
import type { Rfq } from '@/modulos/rfq/tipos/indice';

vi.mock('@/modulos/rfq/acciones/guardar-item-rfq', () => ({
  guardarItemRfqAccion: vi.fn(),
}));
vi.mock('@/modulos/rfq/acciones/cancelar-item-rfq', () => ({
  cancelarItemRfqAccion: vi.fn(),
}));

const MATERIAL_CON_ESPESOR = '10000000-0000-4000-8000-000000000001';
const MATERIAL_SIN_ESPESOR = '10000000-0000-4000-8000-000000000002';

const RFQ: Rfq = {
  id: '20000000-0000-4000-8000-000000000001',
  folio: 'RFQ-1026_01',
  folioOp: 'OP-000001',
  folioCnc: null,
  estadoRfq: 'INCOMPLETE',
  etapa: 'prospecto',
  clienteId: null,
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

const CATALOGOS: CatalogosRfq = {
  materiales: [
    { id: MATERIAL_CON_ESPESOR, codigo: 'ACERO', nombre: 'Acero' },
    { id: MATERIAL_SIN_ESPESOR, codigo: 'SERVICIO', nombre: 'Servicio sin espesor' },
  ],
  espesores: [
    {
      id: '40000000-0000-4000-8000-000000000001',
      materialId: MATERIAL_CON_ESPESOR,
      etiqueta: '3 mm',
      espesorMm: 3,
    },
  ],
  procesos: [],
  canales: [],
  proximasAcciones: [],
  usuarios: [],
};

afterEach(cleanup);

describe('Formulario de ítem RFQ — relación Material/Espesor (C1.3)', () => {
  it('mantiene Espesor debajo de Material y explica por qué no se puede elegir', () => {
    render(createElement(TablaItemsRfq, { rfq: RFQ, catalogos: CATALOGOS, onCambio: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar ítem' }));

    const material = screen.getByRole('combobox', { name: 'Material' });
    const espesor = screen.getByRole('combobox', { name: 'Espesor' }) as HTMLSelectElement;
    expect(espesor.disabled).toBe(true);
    expect(screen.getByText('Selecciona un material para ver sus espesores.')).toBeDefined();

    fireEvent.change(material, { target: { value: MATERIAL_SIN_ESPESOR } });
    expect((screen.getByRole('combobox', { name: 'Espesor' }) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText('Este material no tiene espesores configurados.')).toBeDefined();

    fireEvent.change(material, { target: { value: MATERIAL_CON_ESPESOR } });
    const espesorDisponible = screen.getByRole('combobox', { name: 'Espesor' }) as HTMLSelectElement;
    expect(espesorDisponible.disabled).toBe(false);
    expect(screen.getByRole('option', { name: '3 mm' })).toBeDefined();
  });
});
