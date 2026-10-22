// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { obtenerRfqMock, obtenerCatalogosMock, validarMock } = vi.hoisted(() => ({
  obtenerRfqMock: vi.fn(),
  obtenerCatalogosMock: vi.fn(),
  validarMock: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) =>
    createElement('a', { href, ...resto }, children),
}));
vi.mock('@/modulos/rfq/acciones/obtener-rfq', () => ({
  obtenerRfqAccion: (...args: unknown[]) => obtenerRfqMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/obtener-catalogos', () => ({
  obtenerCatalogosRfqAccion: (...args: unknown[]) => obtenerCatalogosMock(...args),
}));
vi.mock('@/modulos/rfq/acciones/vincular-contacto-rfq', () => ({
  vincularContactoVigenteRfqAccion: vi.fn().mockResolvedValue({
    exito: true,
    datos: { vinculado: false, motivo: 'ya_tiene_contacto' },
  }),
}));
vi.mock('@/modulos/rfq/acciones/validar-rfq-listo', () => ({
  validarRfqListoAccion: (...args: unknown[]) => validarMock(...args),
}));

// Hijos pesados fuera del alcance de esta prueba: se sustituyen por marcadores.
vi.mock('@/modulos/pipeline/componentes/gestor-cliente-oportunidad', () => ({
  GestorClienteOportunidad: () => null,
}));
vi.mock('@/modulos/propuestas/componentes/lista-propuestas-rfq', () => ({
  ListaPropuestasRfq: () => null,
}));
vi.mock('@/modulos/rfq/componentes/actividad-rfq', () => ({ ActividadRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/dialogo-historial-rfq', () => ({
  DialogoHistorialRfq: () => null,
}));
vi.mock('@/modulos/rfq/componentes/formulario-general-rfq', () => ({
  FormularioGeneralRfq: () => null,
}));
vi.mock('@/modulos/rfq/componentes/panel-archivos-rfq', () => ({ PanelArchivosRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/panel-revision-rfq', () => ({ PanelRevisionRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/resumen-rfq', () => ({ ResumenRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/tabla-items-rfq', () => ({ TablaItemsRfq: () => null }));
vi.mock('@/modulos/rfq/componentes/panel-acciones-rfq', () => ({
  PanelAccionesRfq: ({ rfq }: { rfq: { estadoRfq: string } }) =>
    createElement('div', { 'data-testid': 'acciones-rfq', 'data-estado': rfq.estadoRfq }),
}));

import { FichaRfq } from '@/modulos/rfq/componentes/ficha-rfq';
import { IndicadorEstadoRfq } from '@/modulos/rfq/componentes/indicador-estado-rfq';
import type { EstadoRfq, Rfq, ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';
import {
  ACCIONES_POR_ESTADO,
  ETIQUETAS_ESTADO_RFQ,
  capturaRfqListaParaValidar,
} from '@/modulos/rfq/utilidades/estados';

const SECCIONES_VACIAS: ValidacionRfqListo['secciones'] = {
  cliente: [],
  general: [],
  items: [],
  archivos: [],
  seguimiento: [],
};

function validacion(
  secciones: Partial<ValidacionRfqListo['secciones']> = {},
): ValidacionRfqListo {
  const completas = { ...SECCIONES_VACIAS, ...secciones };
  return {
    listo: Object.values(completas).every((faltantes) => faltantes.length === 0),
    secciones: completas,
  };
}

const COMPLETA = validacion();
const CON_FALTANTES = validacion({ items: ['al menos un ítem activo'] });

function rfq(estadoRfq: EstadoRfq = 'INCOMPLETE'): Rfq {
  return {
    id: 'rfq-1',
    folio: 'RFQ-1026_01',
    folioOp: 'OP-000001',
    folioCnc: null,
    estadoRfq,
    etapa: 'contactado',
    clienteId: 'cliente-1',
    condicionesPago: null,
    clienteNombre: 'Metales del Norte SA de CV',
    empresa: 'Empresa legada SA',
    contactoId: 'contacto-1',
    contactoNombre: 'Ana Pérez',
    nombreContacto: 'Contacto legado',
    vendedorId: 'vend-1',
    responsableId: 'usuario-1',
    responsableNombre: 'Luis Operador',
    canal: 'TELEFONO',
    canalDetalle: null,
    fechaSolicitud: '2026-01-01',
    fechaRequeridaCliente: null,
    plazoComercial: null,
    descripcionGeneral: 'Corte de lámina calibre 14',
    proximaAccionCodigo: null,
    proximaAccionTexto: null,
    fechaProximaAccion: null,
    responsableProximaAccionId: null,
    responsableProximaAccionNombre: null,
    actualizadoEn: '2026-01-05T18:30:00+00:00',
    items: [],
  };
}

function renderizarFicha() {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: consultas },
      createElement(FichaRfq, { rfqId: 'rfq-1' }),
    ),
  );
}

function indicador(): HTMLElement {
  return screen.getByTestId('indicador-estado-rfq');
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerRfqMock.mockResolvedValue({ exito: true, datos: rfq() });
  obtenerCatalogosMock.mockResolvedValue({
    exito: true,
    datos: {
      materiales: [],
      espesores: [],
      procesos: [],
      canales: [],
      proximasAcciones: [],
      usuarios: [],
    },
  });
  validarMock.mockResolvedValue({ exito: true, datos: COMPLETA });
});

afterEach(cleanup);

describe('capturaRfqListaParaValidar — regla pura', () => {
  it('es verdadera solo con el RFQ Incompleto y la validación sin faltantes', () => {
    expect(capturaRfqListaParaValidar('INCOMPLETE', COMPLETA)).toBe(true);
  });

  it('con cualquier sección pendiente conserva Incompleto', () => {
    expect(capturaRfqListaParaValidar('INCOMPLETE', CON_FALTANTES)).toBe(false);
    for (const seccion of Object.keys(SECCIONES_VACIAS) as (keyof typeof SECCIONES_VACIAS)[]) {
      expect(
        capturaRfqListaParaValidar('INCOMPLETE', validacion({ [seccion]: ['pendiente'] })),
      ).toBe(false);
    }
  });

  it('no confía en `listo` si todavía hay faltantes', () => {
    const incoherente: ValidacionRfqListo = {
      listo: true,
      secciones: { ...SECCIONES_VACIAS, archivos: ['al menos un archivo'] },
    };
    expect(capturaRfqListaParaValidar('INCOMPLETE', incoherente)).toBe(false);
  });

  it('sin validación (pendiente, con error o sin consultar) no declara nada', () => {
    expect(capturaRfqListaParaValidar('INCOMPLETE', null)).toBe(false);
    expect(capturaRfqListaParaValidar('INCOMPLETE', undefined)).toBe(false);
  });

  it('solo aplica a la captura en curso: otros estados de negocio no se reinterpretan', () => {
    const otros: EstadoRfq[] = [
      'NEW',
      'WAITING_CUSTOMER',
      'WAITING_TECHNICAL',
      'READY_FOR_PROPOSAL',
      'CONVERTED',
      'CLOSED',
      'CANCELLED',
    ];
    for (const estado of otros) {
      expect(capturaRfqListaParaValidar(estado, COMPLETA)).toBe(false);
    }
  });

  it('no altera las transiciones ni las etiquetas del estado de negocio', () => {
    expect(ACCIONES_POR_ESTADO.INCOMPLETE).toEqual([
      'poner_en_espera_cliente',
      'poner_en_espera_tecnica',
      'marcar_listo',
      'cerrar',
      'cancelar',
    ]);
    expect(ETIQUETAS_ESTADO_RFQ.INCOMPLETE).toBe('Incompleto');
    expect(ETIQUETAS_ESTADO_RFQ.READY_FOR_PROPOSAL).toBe('Listo para propuesta');
  });
});

describe('IndicadorEstadoRfq', () => {
  it('captura completa: «Listo para validar» en verde, sin llamarlo «Listo para propuesta»', () => {
    render(createElement(IndicadorEstadoRfq, { estadoRfq: 'INCOMPLETE', validacion: COMPLETA }));

    const marca = indicador();
    expect(marca.dataset.captura).toBe('lista');
    expect(marca.dataset.estadoRfq).toBe('INCOMPLETE');
    expect(within(marca).getByText('Listo para validar')).toBeDefined();
    // Verde = tono de éxito del sistema de diseño.
    expect(marca.innerHTML).toContain('bg-exito-suave');
    expect(screen.queryByText('Listo para propuesta')).toBeNull();
    // El estado de negocio sigue siendo anunciado a tecnologías de apoyo.
    expect(marca.textContent).toContain('Incompleto');
  });

  it('con faltantes o sin validación muestra «Incompleto» en advertencia', () => {
    const { rerender } = render(
      createElement(IndicadorEstadoRfq, { estadoRfq: 'INCOMPLETE', validacion: CON_FALTANTES }),
    );
    expect(indicador().dataset.captura).toBe('incompleta');
    expect(within(indicador()).getByText('Incompleto')).toBeDefined();
    expect(indicador().innerHTML).toContain('bg-advertencia-suave');
    expect(screen.queryByText('Listo para validar')).toBeNull();

    rerender(createElement(IndicadorEstadoRfq, { estadoRfq: 'INCOMPLETE', validacion: null }));
    expect(within(indicador()).getByText('Incompleto')).toBeDefined();
    expect(screen.queryByText('Listo para validar')).toBeNull();
  });

  it('otros estados conservan su etiqueta de negocio', () => {
    render(
      createElement(IndicadorEstadoRfq, { estadoRfq: 'READY_FOR_PROPOSAL', validacion: COMPLETA }),
    );
    expect(within(indicador()).getByText('Listo para propuesta')).toBeDefined();
    expect(indicador().dataset.captura).toBe('no-aplica');
    expect(screen.queryByText('Listo para validar')).toBeNull();
  });
});

describe('FichaRfq — estado de captura en el encabezado', () => {
  it('captura completa: muestra «Listo para validar» y el estado de negocio no cambia', async () => {
    renderizarFicha();

    await waitFor(() => expect(indicador().dataset.captura).toBe('lista'));
    expect(within(indicador()).getByText('Listo para validar')).toBeDefined();
    expect(screen.getByTestId('acciones-rfq').dataset.estado).toBe('INCOMPLETE');
    expect(screen.queryByText('Listo para propuesta')).toBeNull();
  });

  it('captura incompleta: conserva «Incompleto» y los faltantes por paso', async () => {
    validarMock.mockResolvedValue({ exito: true, datos: CON_FALTANTES });
    renderizarFicha();

    await screen.findByText('Faltan datos');
    expect(indicador().dataset.captura).toBe('incompleta');
    expect(within(indicador()).getByText('Incompleto')).toBeDefined();
    expect(screen.queryByText('Listo para validar')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Ítems/ }).getAttribute('data-faltantes'),
    ).toBe('si');
  });

  it('con la consulta de validación pendiente no declara lista la captura', async () => {
    validarMock.mockReturnValue(new Promise(() => undefined));
    renderizarFicha();

    await screen.findByText('RFQ-1026_01');
    await waitFor(() => expect(validarMock).toHaveBeenCalledTimes(1));
    expect(indicador().dataset.captura).toBe('incompleta');
    expect(within(indicador()).getByText('Incompleto')).toBeDefined();
    expect(screen.queryByText('Listo para validar')).toBeNull();
  });

  it('si la validación falla mantiene «Incompleto» en vez de asumir completitud', async () => {
    validarMock.mockResolvedValue({ exito: false, error: 'No se pudo validar el RFQ' });
    renderizarFicha();

    await screen.findByText('RFQ-1026_01');
    await waitFor(() => expect(validarMock).toHaveBeenCalledTimes(1));
    expect(indicador().dataset.captura).toBe('incompleta');
    expect(screen.queryByText('Listo para validar')).toBeNull();
  });

  it('mientras se revalida no mantiene un «Listo para validar» sin confirmar', async () => {
    renderizarFicha();
    await waitFor(() => expect(indicador().dataset.captura).toBe('lista'));

    // Revisar dispara una nueva validación; hasta que responda no se afirma nada.
    let resolver: (valor: unknown) => void = () => undefined;
    validarMock.mockReturnValue(new Promise((resolverPromesa) => (resolver = resolverPromesa)));
    fireEvent.click(screen.getByRole('tab', { name: 'Revisar' }));
    await waitFor(() => expect(indicador().dataset.captura).toBe('incompleta'));
    expect(screen.queryByText('Listo para validar')).toBeNull();

    resolver({ exito: true, datos: CON_FALTANTES });
    await waitFor(() => expect(validarMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(indicador().dataset.captura).toBe('incompleta'));
    expect(within(indicador()).getByText('Incompleto')).toBeDefined();
  });

  it('un RFQ listo para propuesta conserva su etiqueta y no consulta la validación', async () => {
    obtenerRfqMock.mockResolvedValue({ exito: true, datos: rfq('READY_FOR_PROPOSAL') });
    renderizarFicha();

    await screen.findByText('RFQ-1026_01');
    expect(within(indicador()).getByText('Listo para propuesta')).toBeDefined();
    expect(screen.queryByText('Listo para validar')).toBeNull();
    expect(validarMock).not.toHaveBeenCalled();
  });
});
