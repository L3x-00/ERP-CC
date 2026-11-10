// @vitest-environment jsdom
// UI-01: verifica la arquitectura de seis secciones, la visibilidad por rol y
// las correspondencias de enlaces sin montar los formularios reales.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';

const { obtenerConfiguracionMock, obtenerPermisosMock } = vi.hoisted(() => ({
  obtenerConfiguracionMock: vi.fn(),
  obtenerPermisosMock: vi.fn(),
}));

vi.mock('@/modulos/configuracion/acciones/indice', () => ({
  obtenerConfiguracionAccion: (...args: unknown[]) => obtenerConfiguracionMock(...args),
}));

vi.mock('@/modulos/catalogos/acciones/obtener-permisos-catalogos', () => ({
  obtenerPermisosCatalogosAccion: () => obtenerPermisosMock(),
}));

vi.mock('@/modulos/configuracion/componentes/sincronizador-configuracion-realtime', () => ({
  SincronizadorConfiguracionRealtime: () => null,
}));

vi.mock('@/modulos/configuracion/componentes/pestana-folios', () => ({
  PestanaFolios: () => createElement('div', { 'data-testid': 'mock-folios' }, 'folios'),
}));
vi.mock('@/modulos/configuracion/componentes/pestana-tarifas', () => ({
  PestanaTarifas: () => createElement('div', { 'data-testid': 'mock-tarifas' }, 'tarifas'),
}));
vi.mock('@/modulos/configuracion/componentes/pestana-catalogos', () => ({
  PestanaCatalogos: () => createElement('div', { 'data-testid': 'mock-catalogos' }, 'catalogos'),
}));
vi.mock('@/modulos/configuracion/componentes/pestana-catalogos-base', () => ({
  PestanaCatalogosBase: () =>
    createElement('div', { 'data-testid': 'mock-catalogos-base' }, 'catalogos-base'),
}));
vi.mock('@/modulos/configuracion/componentes/pestana-areas-trabajo', () => ({
  PestanaAreasTrabajo: () => createElement('div', { 'data-testid': 'mock-areas' }, 'areas'),
}));
vi.mock('@/modulos/configuracion/componentes/dialogo-datos-empresa', () => ({
  DialogoDatosEmpresa: () =>
    createElement('div', { 'data-testid': 'mock-empresa-dialog' }, 'empresa'),
}));
vi.mock('@/modulos/configuracion/componentes/pestana-plantillas-doc', () => ({
  PestanaPlantillasDoc: () =>
    createElement('div', { 'data-testid': 'mock-documentos' }, 'documentos'),
}));
vi.mock('@/modulos/configuracion/componentes/pestana-operadores', () => ({
  PestanaOperadores: () => createElement('div', { 'data-testid': 'mock-operadores' }, 'operadores'),
}));
vi.mock('@/modulos/permisos/componentes/pestana-usuarios', () => ({
  PestanaUsuarios: () => createElement('div', { 'data-testid': 'mock-usuarios' }, 'usuarios'),
}));
vi.mock('@/modulos/permisos/componentes/pestana-permisos', () => ({
  PestanaPermisos: () => createElement('div', { 'data-testid': 'mock-permisos' }, 'permisos'),
}));

import { OperacionConfiguracion } from '@/modulos/configuracion/componentes/operacion-configuracion';
import type { DatosConfiguracion } from '@/modulos/configuracion/acciones/indice';
import type { VistaConfiguracion } from '@/modulos/configuracion/componentes/pestanas-configuracion';

function datos(esAdmin: boolean): DatosConfiguracion {
  const tier = { umbralMxn: 0, descuentoPorcentaje: 0 };
  return {
    configuracion: {
      id: 'main',
      empresa: {
        nombre: 'CC Manufacturing Group',
        razonSocial: 'CC Manufacturing Group, S. de R.L. de C.V.',
        rfc: 'XAXX010101000',
        direccion: 'Tijuana',
        telefono: '',
        email: '',
        logoUrl: null,
      },
      tarifas: {
        costoHoraDefault: 650,
        segundosPorPierce: 8,
        factorEficienciaLaser: 0.85,
        factorMermaMaterial: 0.08,
        margenUtilidadDefault: 30,
        utilidadObjetivoPropuestaPorcentaje: 30,
        estaciones: {} as DatosConfiguracion['configuracion']['tarifas']['estaciones'],
      },
      plantillasDoc: {
        T1: { colorAcento: '#1D4ED8', terminosCondiciones: '', textoPiePagina: '', textoEncabezado: '' },
      },
      tiers: {
        diasManual: 30,
        tiers: { bronce: tier, plata: tier, oro: tier, platino: tier },
      },
      categoriasGasto: [],
      tipoCambioUsd: 20,
      tipoCambioActualizadoEn: null,
      tipoCambioActualizadoPor: null,
      ivaPorcentajeDefault: 16,
      actualizadoPor: null,
      actualizadoEn: new Date(0).toISOString(),
    },
    cuentasBancarias: [],
    areasTrabajo: [],
    operadoresAreas: [],
    operadoresGestion: [],
    esAdmin,
  };
}

function renderizar(
  vistaInicial: VistaConfiguracion,
  opciones: { esAdmin?: boolean; puedeVerOperativos?: boolean } = {},
) {
  const { esAdmin = true, puedeVerOperativos = true } = opciones;
  obtenerConfiguracionMock.mockResolvedValue({ exito: true, datos: datos(esAdmin) });
  obtenerPermisosMock.mockResolvedValue({ exito: true, datos: { puedeVer: puedeVerOperativos, puedeEditar: true } });
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    createElement(
      QueryClientProvider,
      { client: consultas },
      createElement(OperacionConfiguracion, { datosIniciales: datos(esAdmin), vistaInicial }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('OperacionConfiguracion — UI-01', () => {
  it('muestra las seis secciones principales', async () => {
    renderizar({ seccion: 'folios' });

    const pestanas = await screen.findAllByRole('tab');
    expect(pestanas.map((pestana) => pestana.textContent)).toEqual([
      'Folios',
      'Tarifas y costos',
      'Catálogos',
      'Áreas de trabajo',
      'Personas y accesos',
      'Documentos',
    ]);
    expect(screen.getByTestId('mock-folios')).toBeTruthy();
  });

  it('abre el modal heredado de Empresa sin perder la navegación', async () => {
    renderizar({ seccion: 'empresa' });
    expect(await screen.findByTestId('mock-empresa-dialog')).toBeTruthy();
    expect(screen.getByTestId('mock-folios')).toBeTruthy();
  });

  it('respeta los enlaces históricos de Tarifas y Catálogos operativos', async () => {
    renderizar({ seccion: 'catalogos', subseccion: 'operativos' });
    expect(await screen.findByTestId('mock-catalogos-base')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Operativos' }).getAttribute('aria-selected')).toBe('true');

    cleanup();
    renderizar({ seccion: 'tarifas' });
    expect(await screen.findByTestId('mock-tarifas')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Tarifas y costos' }).getAttribute('aria-selected')).toBe('true');
  });

  it('oculta Personas y accesos a quien no es administrador', async () => {
    renderizar({ seccion: 'folios' }, { esAdmin: false });
    await screen.findByTestId('mock-folios');
    expect(screen.queryByRole('tab', { name: 'Personas y accesos' })).toBeNull();
  });

  it('explica el bloqueo en vez de redirigir en silencio', async () => {
    renderizar({ seccion: 'personas', subseccion: 'usuarios' }, { esAdmin: false });
    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toContain('solo para administradores activos');
  });

  it('muestra Catálogos comerciales con aviso si falta permiso operativo', async () => {
    renderizar(
      { seccion: 'catalogos', subseccion: 'operativos' },
      { puedeVerOperativos: false },
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByTestId('mock-catalogos')).toBeTruthy();
    expect(screen.queryByTestId('mock-catalogos-base')).toBeNull();
  });
});
