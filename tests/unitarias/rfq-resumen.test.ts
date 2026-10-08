// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`
// (mismo patrón que `rfq-cola-lista.test.ts`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { CatalogosRfq } from '@/modulos/rfq/acciones/obtener-catalogos';
import type { Rfq } from '@/modulos/rfq/tipos/indice';

const { obtenerRfqAccionMock, obtenerCatalogosRfqAccionMock, validarRfqListoAccionMock } = vi.hoisted(() => ({
  obtenerRfqAccionMock: vi.fn(),
  obtenerCatalogosRfqAccionMock: vi.fn(),
  validarRfqListoAccionMock: vi.fn(),
}));

vi.mock('@/modulos/rfq/acciones/obtener-rfq', () => ({
  obtenerRfqAccion: (...args: unknown[]) => obtenerRfqAccionMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({
  obtenerCatalogosRfqAccion: (...args: unknown[]) => obtenerCatalogosRfqAccionMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/validar-rfq-listo', () => ({
  validarRfqListoAccion: (...args: unknown[]) => validarRfqListoAccionMock(...args),
}));
vi.mock('@/modulos/rfq/componentes/panel-acciones-rfq', () => ({
  PanelAccionesRfq: () => createElement('div', { 'data-testid': 'stub-acciones-rfq' }),
}));
vi.mock('@/modulos/rfq/componentes/panel-archivos-rfq', () => ({
  PanelArchivosRfq: () => createElement('div', { 'data-testid': 'stub-archivos-rfq' }),
}));
vi.mock('@/modulos/rfq/componentes/tabla-items-rfq', () => ({
  TablaItemsRfq: () => createElement('div', { 'data-testid': 'stub-items-rfq' }),
}));
vi.mock('@/modulos/rfq/componentes/actividad-rfq', () => ({
  ActividadRfq: () => createElement('div', { 'data-testid': 'stub-actividad-rfq' }),
}));
vi.mock('@/modulos/propuestas/componentes/lista-propuestas-rfq', () => ({
  ListaPropuestasRfq: () => createElement('div', { 'data-testid': 'stub-propuestas-rfq' }),
}));
vi.mock('@/modulos/rfq/componentes/formulario-general-rfq', () => ({
  FormularioGeneralRfq: ({ rfq, onGuardado }: { rfq: Rfq; onGuardado: () => void }) =>
    createElement(
      'div',
      { 'data-testid': 'stub-formulario-general-rfq' },
      createElement('span', null, rfq.id),
      createElement('button', { type: 'button', onClick: onGuardado }, 'Guardar (mock)'),
    ),
}));

import { ResumenRfq } from '@/modulos/rfq/componentes/resumen-rfq';
import { FichaRfq } from '@/modulos/rfq/componentes/ficha-rfq';

const RFQ_BASE: Rfq = {
  id: 'rfq-1',
  folio: 'RFQ-1026_01',
  folioOp: 'OP-000001',
  folioCnc: null,
  estadoRfq: 'INCOMPLETE',
  etapa: 'contactado',
  clienteId: 'cliente-1',
  condicionesPago: 'contado',
  clienteNombre: 'Metales del Norte SA de CV',
  empresa: 'Empresa legada SA',
  contactoId: 'contacto-1',
  contactoNombre: 'Ana Pérez',
  nombreContacto: 'Contacto legado',
  vendedorId: 'vend-1',
  responsableId: 'usuario-1',
  responsableNombre: 'Luis Operador (inactivo)',
  canal: 'TELEFONO',
  canalDetalle: null,
  fechaSolicitud: '2026-01-01',
  fechaRequeridaCliente: '2026-02-15T00:00:00+00:00',
  descripcionGeneral: 'Corte de lámina calibre 14',
  proximaAccionCodigo: 'OTRO',
  proximaAccionTexto: 'Visita a planta',
  fechaProximaAccion: '2026-01-10',
  responsableProximaAccionId: 'usuario-2',
  responsableProximaAccionNombre: 'Marta Vendedora',
  actualizadoEn: '2026-01-05T18:30:00+00:00',
  items: [],
};

const CATALOGOS: CatalogosRfq = {
  materiales: [],
  espesores: [],
  procesos: [],
  canales: [
    { codigo: 'TELEFONO', nombre: 'Teléfono', esOtro: false, activo: true },
    { codigo: 'OTRO', nombre: 'Otro', esOtro: true, activo: true },
  ],
  proximasAcciones: [
    { codigo: 'LLAMAR', nombre: 'Llamar al cliente', esOtro: false },
    { codigo: 'OTRO', nombre: 'Otro', esOtro: true },
  ],
  usuarios: [{ id: 'usuario-2', nombre: 'Marta Vendedora', rol: 'vendedor' }],
};

function renderizarResumen(rfq: Rfq, catalogos: CatalogosRfq | null = CATALOGOS, onEditar = vi.fn()) {
  return { onEditar, ...render(createElement(ResumenRfq, { rfq, catalogos, onEditar })) };
}

afterEach(() => {
  cleanup();
});

describe('ResumenRfq — tarjetas de solo lectura (C1.1b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra contenido completo con nombres resueltos (cliente/contacto/responsables)', () => {
    renderizarResumen(RFQ_BASE);

    expect(screen.getByTestId('resumen-rfq')).toBeDefined();
    expect(screen.getByTestId('rfq-datos-generales')).toBeDefined();
    expect(screen.getByTestId('rfq-proxima-accion')).toBeDefined();
    expect(screen.getByTestId('rfq-descripcion')).toBeDefined();

    expect(screen.getByText('RFQ-1026_01')).toBeDefined();
    expect(screen.getByText('Metales del Norte SA de CV')).toBeDefined();
    expect(screen.getByText('Ana Pérez')).toBeDefined();
    expect(screen.getByText('Teléfono')).toBeDefined();
    expect(screen.getByText('Luis Operador (inactivo)')).toBeDefined();
    expect(screen.getByText('Marta Vendedora')).toBeDefined();
    expect(screen.getByText('Corte de lámina calibre 14')).toBeDefined();
    // Acción "Otro": nombre del catálogo + detalle capturado.
    expect(screen.getByText('Otro: Visita a planta')).toBeDefined();
  });

  it('usa el fallback legado empresa/nombre_contacto cuando no hay nombre resuelto', () => {
    renderizarResumen({
      ...RFQ_BASE,
      clienteNombre: null,
      contactoNombre: null,
    });

    expect(screen.getByText('Empresa legada SA')).toBeDefined();
    expect(screen.getByText('Contacto legado')).toBeDefined();
  });

  it('resuelve el nombre del canal y muestra el detalle de Otro', () => {
    renderizarResumen({ ...RFQ_BASE, canal: 'OTRO', canalDetalle: 'Feria industrial' });

    expect(screen.getByText('Otro: Feria industrial')).toBeDefined();
  });

  it('usa el fallback legado si el nombre resuelto llega vacío', () => {
    renderizarResumen({
      ...RFQ_BASE,
      clienteNombre: '   ',
      contactoNombre: '',
    });

    expect(screen.getByText('Empresa legada SA')).toBeDefined();
    expect(screen.getByText('Contacto legado')).toBeDefined();
  });

  it('muestra "—" en todos los campos ausentes, sin inventar datos', () => {
    renderizarResumen({
      ...RFQ_BASE,
      clienteId: null,
      clienteNombre: null,
      empresa: '',
      contactoId: null,
      contactoNombre: null,
      nombreContacto: '',
      canal: null,
      fechaSolicitud: null,
      fechaRequeridaCliente: null,
      responsableId: null,
      responsableNombre: null,
      proximaAccionCodigo: null,
      proximaAccionTexto: null,
      fechaProximaAccion: null,
      responsableProximaAccionId: null,
      responsableProximaAccionNombre: null,
      descripcionGeneral: null,
    });

    const guiones = screen.getAllByText('—');
    // Cliente, contacto, canal, fecha solicitud, fecha requerida, responsable,
    // acción, fecha próxima acción, responsable próxima acción, descripción.
    expect(guiones.length).toBeGreaterThanOrEqual(10);
  });

  it('la fecha calendario no se desplaza un día sin importar la zona horaria del proceso', () => {
    const zonaOriginal = process.env.TZ;
    process.env.TZ = 'Pacific/Honolulu'; // UTC-10: caso clásico donde `new Date('YYYY-MM-DD')` local se corre un día.
    try {
      renderizarResumen({ ...RFQ_BASE, fechaSolicitud: '2026-01-01' });
      expect(screen.getByText('1 de enero de 2026')).toBeDefined();
      expect(screen.queryByText('31 de diciembre de 2025')).toBeNull();
    } finally {
      process.env.TZ = zonaOriginal;
    }
  });

  it('la fecha requerida por cliente (legado timestamptz) tampoco se desplaza', () => {
    const zonaOriginal = process.env.TZ;
    process.env.TZ = 'Pacific/Honolulu';
    try {
      renderizarResumen({ ...RFQ_BASE, fechaRequeridaCliente: '2026-02-15T00:00:00+00:00' });
      expect(screen.getByText('15 de febrero de 2026')).toBeDefined();
    } finally {
      process.env.TZ = zonaOriginal;
    }
  });

  it('no normaliza silenciosamente una fecha calendario imposible', () => {
    renderizarResumen({ ...RFQ_BASE, fechaSolicitud: '2026-02-31' });

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('3 de marzo de 2026')).toBeNull();
  });

  it('muestra fecha y hora legibles en última modificación', () => {
    renderizarResumen({ ...RFQ_BASE, actualizadoEn: '2026-01-05T18:30:00+00:00' });

    // No afirmamos un formato exacto dependiente de TZ local; solo que no
    // quedó el ISO crudo y que incluye el año.
    const etiqueta = screen.getByText('Última modificación');
    const valor = etiqueta.nextElementSibling;
    expect(valor?.textContent).not.toBe('2026-01-05T18:30:00+00:00');
    expect(valor?.textContent ?? '').toContain('2026');
  });

  it('el botón "Editar resumen" aparece en estados editables y dispara onEditar', () => {
    const { onEditar } = renderizarResumen({ ...RFQ_BASE, estadoRfq: 'INCOMPLETE' });

    const boton = screen.getByRole('button', { name: 'Editar resumen' });
    fireEvent.click(boton);
    expect(onEditar).toHaveBeenCalledTimes(1);
  });

  it('oculta "Editar resumen" en READY_FOR_PROPOSAL y en estados terminales', () => {
    for (const estado of ['READY_FOR_PROPOSAL', 'CONVERTED', 'CLOSED', 'CANCELLED'] as const) {
      cleanup();
      renderizarResumen({ ...RFQ_BASE, estadoRfq: estado });
      expect(screen.queryByRole('button', { name: 'Editar resumen' })).toBeNull();
    }
  });

  it('funciona sin catálogos cargados (fallback al texto/código crudo de la acción)', () => {
    renderizarResumen(RFQ_BASE, null);

    expect(screen.getByText('Visita a planta')).toBeDefined();
  });
});

describe('FichaRfq — edición explícita del Resumen (C1.1b)', () => {
  async function renderizarFicha(continuar = false) {
    const cliente = new QueryClient();
    return render(
      createElement(
        QueryClientProvider,
        { client: cliente },
        createElement(FichaRfq, { rfqId: 'rfq-1', continuar }),
      ),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    obtenerRfqAccionMock.mockResolvedValue({ exito: true, datos: RFQ_BASE });
    obtenerCatalogosRfqAccionMock.mockResolvedValue({ exito: true, datos: CATALOGOS });
    validarRfqListoAccionMock.mockResolvedValue({
      exito: true,
      datos: {
        listo: false,
        secciones: {
          cliente: [],
          general: [],
          items: ['al menos un ítem activo'],
          archivos: [],
          seguimiento: [],
        },
      },
    });
  });

  it('Continuar captura reanuda el mismo RFQ en el primer paso pendiente', async () => {
    await renderizarFicha(true);

    await waitFor(() => expect(screen.getByTestId('stub-items-rfq')).toBeDefined());
    expect(validarRfqListoAccionMock).toHaveBeenCalledWith({ rfqId: 'rfq-1' });
    expect(screen.getByRole('tab', { name: 'Ítems' }).getAttribute('aria-selected')).toBe('true');
  });

  it('Continuar captura no sobrescribe la navegación que el usuario ya hizo', async () => {
    let resolverValidacion: (valor: unknown) => void = () => undefined;
    validarRfqListoAccionMock.mockReturnValue(
      new Promise((resolver) => {
        resolverValidacion = resolver;
      }),
    );
    await renderizarFicha(true);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Archivos' })).toBeDefined());

    // El usuario navega antes de que llegue la validación.
    fireEvent.click(screen.getByRole('tab', { name: 'Archivos' }));
    expect(screen.getByTestId('stub-archivos-rfq')).toBeDefined();

    resolverValidacion({
      exito: true,
      datos: {
        listo: false,
        secciones: { cliente: [], general: [], items: ['al menos un ítem activo'], archivos: [], seguimiento: [] },
      },
    });
    await waitFor(() => expect(validarRfqListoAccionMock).toHaveBeenCalled());
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(screen.getByRole('tab', { name: 'Archivos' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('stub-archivos-rfq')).toBeDefined();
  });

  it('abre FormularioGeneralRfq con "Editar resumen" y lo cierra con "Cancelar edición" sin refetch', async () => {
    await renderizarFicha();

    await waitFor(() => expect(screen.getByTestId('resumen-rfq')).toBeDefined());
    expect(screen.queryByTestId('stub-formulario-general-rfq')).toBeNull();
    expect(obtenerRfqAccionMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Editar resumen' }));

    expect(screen.getByTestId('stub-formulario-general-rfq')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancelar edición' })).toBeDefined();
    expect(screen.queryByTestId('rfq-datos-generales')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }));

    expect(screen.getByTestId('resumen-rfq')).toBeDefined();
    expect(screen.queryByTestId('stub-formulario-general-rfq')).toBeNull();
    // Cancelar no guarda: no se pidió refetch del RFQ.
    expect(obtenerRfqAccionMock).toHaveBeenCalledTimes(1);
  });

  it('un guardado correcto cierra edición y vuelve a las tarjetas (refetch)', async () => {
    await renderizarFicha();

    await waitFor(() => expect(screen.getByTestId('resumen-rfq')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Editar resumen' }));
    expect(screen.getByTestId('stub-formulario-general-rfq')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar (mock)' }));

    await waitFor(() => expect(screen.getByTestId('resumen-rfq')).toBeDefined());
    expect(screen.getByRole('status').textContent).toBe('Datos guardados.');
    expect(screen.queryByTestId('stub-formulario-general-rfq')).toBeNull();
    await waitFor(() => expect(obtenerRfqAccionMock).toHaveBeenCalledTimes(2));
  });

  it('en READY_FOR_PROPOSAL se mantiene solo lectura: no hay botón "Editar resumen"', async () => {
    obtenerRfqAccionMock.mockResolvedValue({
      exito: true,
      datos: { ...RFQ_BASE, estadoRfq: 'READY_FOR_PROPOSAL' },
    });

    await renderizarFicha();

    await waitFor(() => expect(screen.getByTestId('resumen-rfq')).toBeDefined());
    expect(screen.queryByRole('button', { name: 'Editar resumen' })).toBeNull();
  });
});
