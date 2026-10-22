// @vitest-environment jsdom
// «Consultar disponibilidad» junto a la fecha compromiso comercial: consulta
// bajo demanda, no prellena ni cambia la fecha, no acepta ni crea nada, no
// bloquea la aceptación y nunca muestra el resultado de otra revisión.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { consultarMock, aceptarMock } = vi.hoisted(() => ({
  consultarMock: vi.fn(),
  aceptarMock: vi.fn(),
}));

vi.mock('@/modulos/propuestas/acciones/consultar-disponibilidad-propuesta', () => ({
  consultarDisponibilidadPropuestaAccion: (...argumentos: unknown[]) => consultarMock(...argumentos),
}));
vi.mock('@/modulos/propuestas/acciones/aceptar-revision', () => ({
  aceptarRevisionAccion: (...argumentos: unknown[]) => aceptarMock(...argumentos),
}));
vi.mock('@/modulos/propuestas/acciones/cerrar-propuesta', () => ({ cerrarPropuestaAccion: vi.fn() }));
vi.mock('@/modulos/propuestas/acciones/confirmar-venta', () => ({ confirmarVentaAccion: vi.fn() }));
vi.mock('@/modulos/propuestas/acciones/enviar-revision', () => ({ enviarRevisionAccion: vi.fn() }));
vi.mock('@/modulos/propuestas/acciones/firmar-archivo-propuesta', () => ({
  firmarArchivoPropuestaAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/generar-pdf-revision', () => ({
  generarPdfRevisionAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/rechazar-propuesta', () => ({
  rechazarPropuestaAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/registrar-seguimiento-propuesta', () => ({
  registrarSeguimientoPropuestaAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/validar-revision-con-seguimiento', () => ({
  validarRevisionConSeguimientoAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/componentes/panel-orden-pendiente', () => ({
  PanelOrdenPendiente: () => null,
}));

import type {
  DetallePropuestaFicha,
  RevisionConTotales,
} from '@/modulos/propuestas/acciones/obtener-propuesta';
import { PanelAccionesPropuesta } from '@/modulos/propuestas/componentes/panel-acciones-propuesta';
import { PanelDisponibilidadPropuesta } from '@/modulos/propuestas/componentes/panel-disponibilidad-propuesta';
import type { ResumenDisponibilidadPropuesta } from '@/modulos/propuestas/tipos/disponibilidad';
import type { PermisosPropuesta } from '@/modulos/propuestas/tipos/indice';

const PERMISOS = {
  editarArticulo: true,
  editarPrecio: true,
  editarRuteo: true,
  editarCosto: true,
  validar: true,
  generarPdf: true,
  enviar: true,
  seguimiento: true,
  aceptar: true,
  crearRevision: true,
  cerrar: true,
} as PermisosPropuesta;

function revision(parcial: Partial<RevisionConTotales> = {}): RevisionConTotales {
  return {
    id: 'rev-a',
    propuestaId: 'propuesta-1',
    letra: 'A',
    folioRevision: 'CNC-0001-A',
    estado: 'SENT',
    motivoCreacion: null,
    requiereRevisionRuteo: false,
    requiereRevisionCosteo: false,
    actualizadoEn: '2026-10-21T10:00:00Z',
    snapshotCabecera: { ivaPorcentaje: 16, moneda: 'MXN' },
    totales: { subtotal: 0, iva: 0, total: 0, moneda: 'MXN' },
    pdfs: [],
    ...parcial,
  } as unknown as RevisionConTotales;
}

function detalle(acceptedRevisionId: string | null = null): DetallePropuestaFicha {
  return {
    propuesta: { id: 'propuesta-1', acceptedRevisionId },
    acciones: [],
  } as unknown as DetallePropuestaFicha;
}

function resumen(parcial: Partial<ResumenDisponibilidadPropuesta> = {}): ResumenDisponibilidadPropuesta {
  return {
    revisionId: 'rev-a',
    fechaInicio: '2026-10-21',
    fechaFin: '2026-11-03',
    dias: 14,
    zonaHoraria: 'America/Tijuana',
    grupos: [
      {
        codigo: 'ROUTER',
        nombre: 'CNC Router',
        horasRequeridas: 9,
        estado: 'con_capacidad',
        horasCapacidad: 20,
        horasCarga: 13,
        horasDisponibles: 5,
        turnosSobrecargados: 1,
        recursosSinTurno: 1,
      },
      {
        codigo: 'PINT',
        nombre: 'Pintura',
        horasRequeridas: 2,
        estado: 'sin_capacidad_configurada',
        horasCapacidad: null,
        horasCarga: null,
        horasDisponibles: null,
        turnosSobrecargados: 0,
        recursosSinTurno: 1,
      },
    ],
    procesosSinGrupo: [{ nombre: 'Soldadura', horasRequeridas: 3 }],
    itemsSinRuteo: ['P-03'],
    sinItemsActivos: false,
    ...parcial,
  };
}

function diferida<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (error: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

function montarPanel(opciones: { revision?: RevisionConTotales; detalle?: DetallePropuestaFicha; permisos?: PermisosPropuesta } = {}) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const elemento = (rev: RevisionConTotales) =>
    createElement(
      QueryClientProvider,
      { client: consultas },
      createElement(PanelAccionesPropuesta, {
        detalle: opciones.detalle ?? detalle(),
        revision: rev,
        catalogos: null,
        permisos: opciones.permisos ?? PERMISOS,
      }),
    );
  const vista = render(elemento(opciones.revision ?? revision()));
  return { ...vista, cambiarRevision: (rev: RevisionConTotales) => vista.rerender(elemento(rev)) };
}

function campoFecha(): HTMLInputElement {
  return screen.getByLabelText('Fecha compromiso comercial') as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('PanelAccionesPropuesta — dónde se ofrece la consulta', () => {
  it.each(['SENT', 'FOLLOW_UP'])('se ofrece junto a la fecha compromiso en %s', (estado) => {
    montarPanel({ revision: revision({ estado } as Partial<RevisionConTotales>) });

    expect(campoFecha()).toBeTruthy();
    const boton = screen.getByRole('button', { name: 'Consultar disponibilidad' });
    expect(campoFecha().closest('label')?.nextElementSibling?.contains(boton)).toBe(true);
    // Bajo demanda: montar la ficha no consulta.
    expect(consultarMock).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'READY_TO_SEND'])('no se ofrece en %s', (estado) => {
    montarPanel({ revision: revision({ estado } as Partial<RevisionConTotales>) });

    expect(screen.queryByRole('button', { name: 'Consultar disponibilidad' })).toBeNull();
  });

  it('no se ofrece sin permiso de aceptar ni con la propuesta ya aceptada', () => {
    montarPanel({ permisos: { ...PERMISOS, aceptar: false } });
    expect(screen.queryByRole('button', { name: 'Consultar disponibilidad' })).toBeNull();
    cleanup();

    montarPanel({ detalle: detalle('rev-b') });
    expect(screen.queryByRole('button', { name: 'Consultar disponibilidad' })).toBeNull();
  });
});

describe('PanelAccionesPropuesta — consulta informativa', () => {
  it('muestra el resumen sin cambiar la fecha escrita, sin aceptar ni crear nada', async () => {
    consultarMock.mockResolvedValue({ exito: true, datos: resumen() });
    montarPanel();
    fireEvent.change(campoFecha(), { target: { value: '2026-11-10' } });

    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));

    const region = await screen.findByRole('region', { name: 'Disponibilidad informativa' });
    await waitFor(() => expect(within(region).getByText('CNC Router')).toBeTruthy());
    expect(consultarMock).toHaveBeenCalledTimes(1);
    // Solo identificadores: grupos, horas y capacidad los calcula el servidor.
    expect(consultarMock).toHaveBeenCalledWith({ propuestaId: 'propuesta-1', revisionId: 'rev-a' });
    expect(within(region).getByText('20.00 h')).toBeTruthy();
    expect(within(region).getByText('13.00 h')).toBeTruthy();
    expect(within(region).getByText('5.00 h')).toBeTruthy();
    expect(within(region).getByText(/1 turno ya está sobrecargado/)).toBeTruthy();
    expect(within(region).getByText(/supera lo disponible/)).toBeTruthy();
    expect(within(region).getByText(/equipos activos sin turnos configurados/)).toBeTruthy();
    expect(within(region).getByText('Sin capacidad configurada')).toBeTruthy();
    expect(within(region).getByText(/«Soldadura» no tiene grupo de equipo/)).toBeTruthy();
    expect(within(region).getByText(/Sin ruteo .*P-03/)).toBeTruthy();
    expect(within(region).getByText(/no reserva capacidad ni confirma ninguna fecha/)).toBeTruthy();
    expect(within(region).getByText(/no incluye trabajo sin programar ni descuenta las horas/)).toBeTruthy();
    expect(within(region).getByText(/21 de octubre de 2026/)).toBeTruthy();
    expect(within(region).getByText(/3 de noviembre de 2026/)).toBeTruthy();
    expect(within(region).queryByText(/se puede cumplir|alcanza|suficiente/i)).toBeNull();

    expect(campoFecha().value).toBe('2026-11-10');
    expect(aceptarMock).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Aceptar revisión' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('no prellena la fecha compromiso cuando estaba vacía', async () => {
    consultarMock.mockResolvedValue({ exito: true, datos: resumen() });
    montarPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    await screen.findByText('CNC Router');

    expect(campoFecha().value).toBe('');
    expect((screen.getByRole('button', { name: 'Aceptar revisión' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('mientras consulta muestra la carga y no bloquea la aceptación', async () => {
    const pendiente = diferida<unknown>();
    consultarMock.mockReturnValue(pendiente.promesa);
    aceptarMock.mockResolvedValue({ exito: false, error: 'x' });
    montarPanel();
    fireEvent.change(campoFecha(), { target: { value: '2026-11-10' } });

    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));

    const boton = screen.getByRole('button', { name: 'Consultando…' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(screen.getByRole('region', { name: 'Disponibilidad informativa' }).getAttribute('aria-busy')).toBe('true');
    const aceptar = screen.getByRole('button', { name: 'Aceptar revisión' }) as HTMLButtonElement;
    expect(aceptar.disabled).toBe(false);

    await act(async () => {
      pendiente.resolver({ exito: true, datos: resumen() });
    });
  });

  it('un error es reintentable y no filtra detalles', async () => {
    consultarMock
      .mockResolvedValueOnce({ exito: false, error: 'No se pudo consultar la disponibilidad. Inténtalo de nuevo.' })
      .mockResolvedValueOnce({ exito: true, datos: resumen() });
    montarPanel();
    fireEvent.change(campoFecha(), { target: { value: '2026-11-10' } });

    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo consultar la disponibilidad');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('CNC Router');
    expect(consultarMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(campoFecha().value).toBe('2026-11-10');
  });

  it('un fallo de red muestra un error reintentable', async () => {
    consultarMock.mockRejectedValue(new Error('fetch failed'));
    montarPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Revisa la conexión');
    expect(alerta.textContent).not.toContain('fetch failed');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('indica vacío cuando no hay ítems activos', async () => {
    consultarMock.mockResolvedValue({
      exito: true,
      datos: resumen({ grupos: [], procesosSinGrupo: [], itemsSinRuteo: [], sinItemsActivos: true }),
    });
    montarPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));

    expect(await screen.findByText('La revisión no tiene ítems activos para consultar.')).toBeTruthy();
  });

  it('indica información incompleta cuando no hay grupos que comparar', async () => {
    consultarMock.mockResolvedValue({
      exito: true,
      datos: resumen({ grupos: [], procesosSinGrupo: [], itemsSinRuteo: ['P-01'] }),
    });
    montarPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));

    expect(await screen.findByText(/no tienen ruteo o grupo/)).toBeTruthy();
    expect(screen.getByText(/Sin ruteo .*P-01/)).toBeTruthy();
  });
});

describe('Disponibilidad — cambios de revisión y respuestas tardías', () => {
  it('al cambiar de revisión descarta la lectura anterior y la respuesta tardía', async () => {
    const tardia = diferida<unknown>();
    consultarMock.mockReturnValueOnce(tardia.promesa);
    const { cambiarRevision } = montarPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    cambiarRevision(revision({ id: 'rev-b', letra: 'B' } as Partial<RevisionConTotales>));

    await act(async () => {
      tardia.resolver({ exito: true, datos: resumen() });
    });

    expect(screen.queryByRole('region', { name: 'Disponibilidad informativa' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Consultar disponibilidad' })).toBeTruthy();
  });

  it('sin remontar, ignora la respuesta tardía tras ir y volver de revisión', async () => {
    const tardia = diferida<unknown>();
    consultarMock.mockReturnValueOnce(tardia.promesa);
    const vista = render(createElement(PanelDisponibilidadPropuesta, { propuestaId: 'propuesta-1', revisionId: 'rev-a' }));

    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    vista.rerender(createElement(PanelDisponibilidadPropuesta, { propuestaId: 'propuesta-1', revisionId: 'rev-b' }));
    vista.rerender(createElement(PanelDisponibilidadPropuesta, { propuestaId: 'propuesta-1', revisionId: 'rev-a' }));

    await act(async () => {
      tardia.resolver({ exito: true, datos: resumen() });
    });

    expect(screen.queryByText('CNC Router')).toBeNull();
    expect(screen.getByRole('button', { name: 'Consultar disponibilidad' })).toBeTruthy();
  });

  it('el reintento reemplaza el error anterior (cada clic consulta de nuevo)', async () => {
    const primera = diferida<unknown>();
    const segunda = diferida<unknown>();
    consultarMock.mockReturnValueOnce(primera.promesa).mockReturnValueOnce(segunda.promesa);
    render(createElement(PanelDisponibilidadPropuesta, { propuestaId: 'propuesta-1', revisionId: 'rev-a' }));

    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    await act(async () => {
      primera.resolver({ exito: false, error: 'Error de prueba' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await act(async () => {
      segunda.resolver({ exito: true, datos: resumen() });
    });

    expect(screen.getByText('CNC Router')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rechaza un resultado que dice ser de otra revisión', async () => {
    consultarMock.mockResolvedValue({ exito: true, datos: resumen({ revisionId: 'rev-b' }) });
    render(createElement(PanelDisponibilidadPropuesta, { propuestaId: 'propuesta-1', revisionId: 'rev-a' }));

    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('CNC Router')).toBeNull();
  });
});
