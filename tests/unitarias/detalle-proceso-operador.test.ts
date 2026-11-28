// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { obtenerMaterialClienteOrdenAccion } from '@/modulos/produccion/acciones/material-cliente';
import { act, createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  fechaLocalNegocio,
  sumarDiasFecha,
} from '@/compartido/utilidades/fecha-negocio';
import { ahoraHoraInputNegocio } from '@/modulos/produccion/utilidades/horas-extra';
import type { SugerenciaCorrida } from '@/modulos/produccion/utilidades/agrupacion-corridas';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/modulos/produccion/acciones/material-cliente', () => ({
  obtenerMaterialClienteOrdenAccion: vi.fn().mockResolvedValue({ exito: true, datos: [] }),
  registrarConsumoMaterialClienteAccion: vi.fn().mockResolvedValue({ exito: true, datos: {} }),
}));

vi.mock('@/modulos/produccion/acciones/corrida-integrada', () => ({
  obtenerItemsCorridaAccion: vi.fn().mockResolvedValue({
    exito: true,
    datos: [
      {
        partidaId: 'partida-1',
        codigoPieza: 'IT01',
        metaProcesoId: null,
        cantidadSolicitada: 10,
        cantidadProducida: 0,
        disponible: null,
      },
      {
        partidaId: 'partida-2',
        codigoPieza: 'IT02',
        metaProcesoId: null,
        cantidadSolicitada: 10,
        cantidadProducida: 0,
        disponible: null,
      },
    ],
  }),
  obtenerTiemposIntegradosAccion: vi.fn(),
}));

// Stub del diálogo del sistema: Radix necesita un DOM real con portales, así
// que la prueba sustituye la capa visual. El stub conserva las props que la
// prueba necesita (testid, rol, etiqueta) para no ocultar regresiones.
vi.mock('@/compartido/componentes/ui/dialog', () => {
  type PropsStub = React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode };
  const sinEstilo = ({ className: _className, ...resto }: PropsStub) => {
    void _className;
    return resto;
  };
  return {
    Dialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) => (
      open === false ? null : createElement('div', {}, children)
    ),
    DialogContent: ({ children, ...props }: PropsStub) => (
      createElement('div', sinEstilo(props), children)
    ),
    DialogHeader: ({ children, ...props }: PropsStub) => (
      createElement('div', sinEstilo(props), children)
    ),
    DialogFooter: ({ children, ...props }: PropsStub) => (
      createElement('div', sinEstilo(props), children)
    ),
    DialogTitle: ({ children, ...props }: PropsStub) => (
      createElement('h2', sinEstilo(props), children)
    ),
    DialogDescription: ({ children, ...props }: PropsStub) => (
      createElement('p', sinEstilo(props), children)
    ),
  };
});

vi.mock('@/modulos/ordenes/acciones/obtener-url-archivo-piso', () => ({
  obtenerUrlArchivoPisoAccion: vi.fn(),
}));

vi.mock('@/modulos/produccion/acciones/solicitar-horas-extra', () => ({
  solicitarHorasExtraAccion: vi.fn().mockResolvedValue({
    exito: true,
    datos: { id: 'solicitud-1', horasAutorizadas: 5.14, estado: 'SOLICITADA' },
  }),
}));

vi.mock('@/modulos/produccion/acciones/justificar-horas-extra', () => ({
  justificarHorasExtraAccion: vi.fn().mockResolvedValue({
    exito: true,
    datos: { id: 'justificacion-1', horasAutorizadas: 5.14, estado: 'JUSTIFICADA' },
  }),
}));

vi.mock('@/modulos/produccion/acciones/pausar-sesion-jornada', () => ({
  pausarSesionJornadaAccion: vi.fn().mockResolvedValue({
    exito: true,
    datos: { sesionesPausadas: 0 },
  }),
}));

vi.mock('@/modulos/produccion/acciones/registrar-consumo-piezas', () => ({
  registrarConsumoPiezasAccion: vi.fn().mockResolvedValue({
    exito: true,
    datos: { id: 'consumo-piezas-1', cantidadConsumida: 40, cantidadScrap: 0 },
  }),
}));

import {
  DetalleProcesoOperador,
  type ResultadoOperacion,
} from '@/modulos/produccion/componentes/detalle-proceso-operador';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';
import { solicitarHorasExtraAccion } from '@/modulos/produccion/acciones/solicitar-horas-extra';
import { justificarHorasExtraAccion } from '@/modulos/produccion/acciones/justificar-horas-extra';
import { registrarConsumoPiezasAccion } from '@/modulos/produccion/acciones/registrar-consumo-piezas';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const proceso = {
  id: 'proceso-1',
  ordenId: 'orden-1',
  folioOrden: 'OP-001',
  folioSii: null,
  estadoOrden: 'en_proceso',
  estadoSii: 'EN_PRODUCCION',
  prioridad: 'normal',
  clienteNombre: 'Cliente de prueba',
  fechaCompromiso: '2026-10-30',
  fechaOperativa: '2026-10-28',
  notas: null,
  partidaId: 'partida-1',
  codigoPieza: 'PZA-01',
  descripcion: 'Pieza de prueba',
  cantidadSolicitada: 10,
  cantidadProducida: 0,
  unidadMedida: 'piezas',
  esExterno: false,
  proveedorExterno: null,
  material: { id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' },
  areaCodigo: 'CORTE',
  areaNombre: 'Corte',
  areaMacro: 'CORTE',
  areaColor: null,
  metaProcesoId: 'meta-1',
  procesoNombre: 'Láser',
  secuencia: 1,
  metaPiezas: 10,
  hechoPiezas: 0,
  pendientePiezas: 10,
  porcentaje: 0,
  esFinal: true,
  horasEstimadas: 2,
  programacion: {
    id: 'programacion-1',
    fecha: '2026-10-28',
    turno: 'matutino',
    estadoPlaneacion: 'en_proceso',
    horasEstimadas: 2,
    recursoId: 'recurso-1',
    recursoCodigo: 'LASER-01',
    recursoNombre: 'Láser 1',
    actualizadoEn: '2026-10-28T10:00:00.000Z',
  },
  reclamo: null,
  reclamadoPorMi: true,
  nombreReclamante: null,
  sesionActiva: {
    id: 'sesion-1',
    corridaId: 'corrida-1',
    operadorId: 'operador-1',
    operadorNombre: 'Operador de prueba',
    estadoSesion: 'activa',
    // C31/A12: fecha reciente para que el tiempo transcurrido no dispare el
    // motivo de demora en las pruebas que no lo están probando.
    fechaInicio: new Date(Date.now() - 30 * 60_000).toISOString(),
    fechaFin: null,
    piezasProducidas: 0,
    horasNetas: 0,
    motivoPausa: null,
    motivoPausaNota: null,
    notas: null,
    verificacionCompleta: true,
  },
  ultimaSesion: null,
  sesiones: [],
  procesosRuteo: [],
  archivos: [],
  comentariosOrden: [],
  columna: 'en_proceso',
  urgencia: 'normal',
  etiquetas: [],
  puedeIniciar: false,
  puedeReanudar: false,
  motivoNoInicia: 'Ya hay una sesión activa en este proceso',
} as unknown as ProcesoEspacioOperador;

describe('DetalleProcesoOperador', () => {
  it('envía el consumo al cierre y muestra el resumen confirmado de la sesión', async () => {
    let resolverCierre: (resultado: ResultadoOperacion) => void = () => undefined;
    const cerrar = vi.fn(() => new Promise<ResultadoOperacion>((resolver) => {
      resolverCierre = resolver;
    }));

    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [{
        id: 'consumo-1',
        partidaId: 'partida-1',
        materialId: 'material-1',
        cantidadUsada: 1,
        cantidadScrap: 0.25,
        creadoEn: '2026-10-28T10:30:00.000Z',
      }],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.click(screen.getByText('Consumo acumulado de materiales (1)'));
    expect(screen.getByText(/Usado: 1.000 kg/)).toBeTruthy();
    expect(screen.getByText(/Merma: 0.250 kg/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Piezas cortadas'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'material-1' } });
    fireEvent.change(screen.getByLabelText('Usado'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Merma'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByTestId('motivo-consumo'), {
      target: { value: 'Consumo de producción' },
    });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce());
    expect(cerrar).toHaveBeenCalledWith(proceso, expect.objectContaining({
      piezasProducidas: 3,
      estadoDestino: 'finalizada',
      consumo: {
        materialId: 'material-1',
        cantidadUsada: 2,
        cantidadScrap: 0.5,
        motivo: 'Consumo de producción',
      },
    }));

    await act(async () => {
      resolverCierre({
        exito: true,
        datos: {
          id: 'sesion-1',
          estadoSesion: 'finalizada',
          horasBrutas: 1.25,
          horasNetas: 1,
          piezasProducidas: 3,
          cantidadProducidaPartida: 3,
          estadoOrden: 'en_proceso',
          estadoPlaneacion: 'programada',
          actualizadoEn: '2026-10-28T11:15:00.000Z',
        },
      });
      await cerrar.mock.results[0]?.value;
    });

    expect((await screen.findByTestId('resumen-cierre-registrado')).textContent).toContain(
      'Sesión finalizada: 3 piezas, 1 h netas y material registrado.',
    );
    // Punto 11: al registrar el cierre el formulario se repliega solo.
    await waitFor(() => {
      expect(document.getElementById('cierre-sesion-campos')?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('ofrece liberar la primera pieza desde el cierre cuando el proceso la exige', async () => {
    const cerrar = vi.fn().mockResolvedValue({
      exito: false,
      error: 'Falta liberar la primera pieza antes de declarar producción',
      codigo: 'primera_pieza_pendiente',
    } satisfies ResultadoOperacion);

    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.change(screen.getByLabelText('Piezas cortadas'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'material-1' } });
    fireEvent.change(screen.getByLabelText('Usado'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Merma'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('motivo-consumo'), {
      target: { value: 'Consumo de producción' },
    });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText('Falta liberar la primera pieza')).toBeTruthy());
    fireEvent.click(screen.getByTestId('modal-liberar-primera-pieza'));
    expect(screen.getByText('Resultado de la inspección')).toBeTruthy();
    expect(screen.getByTestId('resultado-primera-pieza')).toBeTruthy();
  });

  it('permite declarar retrabajo al cerrar sin alterar el avance', async () => {
    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.click(screen.getByTestId('registrar-retrabajo'));
    expect(screen.getByTestId('retrabajo-minutos')).toBeTruthy();
    expect(screen.getByTestId('retrabajo-motivo')).toBeTruthy();
    expect(screen.getByTestId('retrabajo-causa')).toBeTruthy();
  });

  it('permite declarar una corrida integrada con piezas y minutos por ítem', async () => {
    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    const casilla = await screen.findByTestId('corrida-integrada');
    fireEvent.click(casilla);
    expect(screen.getByTestId('integrada-piezas-IT01')).toBeTruthy();
    expect(screen.getByTestId('integrada-minutos-IT02')).toBeTruthy();
  });

  it('no permite declarar más piezas de las que establece la orden y usa captura entera sin flechas', async () => {
    const cerrar = vi.fn();
    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    const campo = screen.getByTestId('piezas-cierre') as HTMLInputElement;
    expect(campo.getAttribute('type')).toBe('text');
    expect(campo.getAttribute('inputmode')).toBe('numeric');
    expect(screen.getByText('Máximo 10 piezas para esta operación.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Piezas cortadas'), { target: { value: '11' } });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No puedes declarar 11 piezas cortadas: el máximo permitido es 10.',
    );
    expect(cerrar).not.toHaveBeenCalled();
  });

  it('en un proceso posterior lista las piezas del corte y registra su consumo (C17)', async () => {
    vi.mocked(registrarConsumoPiezasAccion).mockClear();
    const procesoPosterior = {
      ...proceso,
      cantidadSolicitada: 100,
      cantidadProducida: 0,
      metaPiezas: 100,
      hechoPiezas: 0,
      pendientePiezas: 100,
      piezasDisponibles: 60,
      procesoPrevioNombre: 'Corte láser',
    } as unknown as ProcesoEspacioOperador;
    const cerrar = vi.fn().mockResolvedValue({
      exito: true,
      datos: {
        id: 'sesion-1',
        estadoSesion: 'finalizada',
        horasBrutas: 2,
        horasNetas: 2,
        piezasProducidas: 40,
        cantidadProducidaPartida: 40,
        estadoOrden: 'en_proceso',
        estadoPlaneacion: 'programada',
        actualizadoEn: '2026-10-28T12:00:00.000Z',
      },
    } satisfies ResultadoOperacion);

    render(createElement(DetalleProcesoOperador, {
      proceso: procesoPosterior,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    const selector = screen.getByTestId('material-cierre') as HTMLSelectElement;
    expect(selector.disabled).toBe(true);
    expect(selector.textContent).toContain('Corte láser');
    expect(selector.textContent).toContain('60 disponibles');
    expect(selector.textContent).not.toContain('AC-01');

    fireEvent.change(screen.getByLabelText('Piezas cortadas'), { target: { value: '40' } });
    fireEvent.change(screen.getByTestId('usado-cierre'), { target: { value: '40' } });
    fireEvent.change(screen.getByTestId('motivo-consumo'), {
      target: { value: 'Consumo de piezas cortadas' },
    });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce());
    expect(cerrar.mock.calls[0]?.[1]).not.toHaveProperty('consumo');
    await waitFor(() => expect(registrarConsumoPiezasAccion).toHaveBeenCalledWith({
      sesionId: 'sesion-1',
      cantidadUsada: 40,
      cantidadMerma: 0,
      motivo: 'Consumo de piezas cortadas',
    }));
  });

  it('ante horas extra ofrece justificar o pedir aprobación, sin crear la solicitud a ciegas', async () => {
    vi.mocked(solicitarHorasExtraAccion).mockClear();
    vi.mocked(justificarHorasExtraAccion).mockClear();
    const cerrar = vi.fn()
      .mockResolvedValueOnce({
        exito: false,
        error: 'El tiempo neto de la sesión supera la jornada del turno.',
        codigo: 'horas_extra_sin_autorizacion',
      } satisfies ResultadoOperacion)
      .mockResolvedValueOnce({
        exito: true,
        datos: {
          id: 'sesion-1',
          estadoSesion: 'finalizada',
          horasBrutas: 9,
          horasNetas: 8.5,
          piezasProducidas: 2,
          cantidadProducidaPartida: 2,
          estadoOrden: 'en_proceso',
          estadoPlaneacion: 'programada',
          actualizadoEn: '2026-10-28T18:30:00.000Z',
        },
      } satisfies ResultadoOperacion);

    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.change(screen.getByLabelText('Piezas cortadas'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    const panel = await screen.findByTestId('horas-extra-cierre');
    expect(panel.textContent).toContain('El día ya acumuló más de la jornada');
    expect(screen.getByTestId('corregir-hora-fin')).toBeTruthy();
    expect(screen.getByTestId('justificar-horas-extra')).toBeTruthy();
    expect(screen.getByTestId('solicitar-horas-extra')).toBeTruthy();
    expect(solicitarHorasExtraAccion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('justificar-horas-extra'));
    fireEvent.change(screen.getByTestId('motivo-justificacion-horas-extra'), {
      target: { value: 'Olvidé finalizar la sesión al terminar el turno' },
    });
    fireEvent.click(screen.getByTestId('confirmar-justificacion-horas-extra'));

    await waitFor(() => expect(justificarHorasExtraAccion).toHaveBeenCalledOnce());
    expect(justificarHorasExtraAccion).toHaveBeenCalledWith({
      sesionId: 'sesion-1',
      motivo: 'Olvidé finalizar la sesión al terminar el turno',
    });
    await waitFor(() => expect(cerrar).toHaveBeenCalledTimes(2));
  });

  it('A14: pausa manual con avance declarado ofrece continuar, no actualizar avance', () => {
    const sesionPausada = {
      ...proceso.sesionActiva,
      id: 'sesion-pausada-declarada',
      estadoSesion: 'pausada' as const,
      fechaInicio: '2026-11-20T20:15:48.000Z',
      fechaFin: '2026-11-20T20:48:44.000Z',
      horasNetas: 0,
      piezasProducidas: 50,
      motivoPausa: 'COMIDA',
      motivoPausaCodigo: 'COMIDA',
      pendienteActualizacionAvance: false,
    };
    const manual = {
      ...proceso,
      columna: 'pausada',
      sesionActiva: null,
      ultimaSesion: sesionPausada,
      sesiones: [sesionPausada],
      programacion: { ...proceso.programacion, estadoPlaneacion: 'bloqueada' },
      pendienteActualizacionAvance: false,
      puedeReanudar: true,
      puedeIniciar: false,
      procesoCompleto: false,
    } as unknown as ProcesoEspacioOperador;

    render(createElement(DetalleProcesoOperador, {
      proceso: manual,
      hoy: '2026-11-20',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(), mover: vi.fn(), liberar: vi.fn(), iniciar: vi.fn(),
        reanudar: vi.fn(), cerrarPausa: vi.fn(), actualizarAvance: vi.fn(), cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.queryByTestId('formulario-actualizar-avance')).toBeNull();
    expect(screen.getByTestId('reanudar-detalle').textContent).toContain('Continuar');
    expect(screen.getByTestId('aviso-pausa-declarada').textContent)
      .toContain('ya está declarado');
  });

  it('A15: muestra el tiempo acumulado junto al bloque actual al reanudar', () => {
    const reanudado = {
      ...proceso,
      horasAcumuladas: 0.91,
      columna: 'en_proceso',
      sesionActiva: { ...proceso.sesionActiva, id: 'sesion-nueva', piezasProducidas: 0 },
    } as unknown as ProcesoEspacioOperador;

    render(createElement(DetalleProcesoOperador, {
      proceso: reanudado,
      hoy: '2026-11-20',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(), mover: vi.fn(), liberar: vi.fn(), iniciar: vi.fn(),
        reanudar: vi.fn(), cerrarPausa: vi.fn(), actualizarAvance: vi.fn(), cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.getByTestId('tiempo-acumulado-detalle').textContent).toContain('55 min');
    expect(screen.getByTestId('sesion-en-curso-detalle').textContent).toContain('Bloque actual');
  });

  it('muestra la pausa vigente y permite cerrarla sin producir sin tocar otras sesiones', async () => {
    const cerrarPausa = vi.fn().mockResolvedValue({ exito: true } satisfies ResultadoOperacion);
    const sesionPausada = {
      id: 'sesion-pausada',
      corridaId: null,
      operadorId: 'operador-1',
      operadorNombre: 'Operador de prueba',
      estadoSesion: 'pausada' as const,
      fechaInicio: '2026-10-27T17:52:00.000Z',
      fechaFin: '2026-10-28T01:52:00.000Z',
      piezasProducidas: 0,
      horasNetas: 8,
      motivoPausa: 'FIN_JORNADA',
      motivoPausaNota: 'Pausa automática al cumplir la jornada del turno.',
      notas: null,
      verificacionCompleta: true,
    };
    const pausado = {
      ...proceso,
      columna: 'pausada',
      sesionActiva: null,
      ultimaSesion: sesionPausada,
      sesiones: [sesionPausada],
      puedeReanudar: true,
      puedeIniciar: false,
    } as unknown as ProcesoEspacioOperador;

    render(createElement(DetalleProcesoOperador, {
      proceso: pausado,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa,
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.getByTestId('pausa-sesion-detalle').textContent).toContain('Fin de jornada');
    expect(screen.getByTestId('pausa-sesion-detalle').textContent).toContain('8 h');
    fireEvent.click(screen.getByTestId('cerrar-pausa-detalle'));
    await waitFor(() => expect(cerrarPausa).toHaveBeenCalledWith(pausado));
  });

  it('no ofrece continuar una operación completa: solo registrar el consumo y cerrar', () => {
    const sesionPausada = {
      id: 'sesion-pausada',
      corridaId: null,
      operadorId: 'operador-1',
      operadorNombre: 'Operador de prueba',
      estadoSesion: 'pausada' as const,
      fechaInicio: '2026-10-27T17:52:00.000Z',
      fechaFin: '2026-10-28T01:52:00.000Z',
      piezasProducidas: 10,
      horasNetas: 8,
      motivoPausa: 'FIN_JORNADA',
      motivoPausaNota: null,
      notas: null,
      verificacionCompleta: true,
    };
    const completo = {
      ...proceso,
      columna: 'lista',
      sesionActiva: null,
      ultimaSesion: sesionPausada,
      sesiones: [sesionPausada],
      hechoPiezas: 10,
      pendientePiezas: 0,
      porcentaje: 100,
      procesoCompleto: true,
      puedeReanudar: false,
      puedeIniciar: false,
      motivoNoInicia: 'Operación completa: registra el consumo pendiente para cerrarla',
    } as unknown as ProcesoEspacioOperador;
    const materialPendiente = [
      { id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' },
    ];

    render(createElement(DetalleProcesoOperador, {
      proceso: completo,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: materialPendiente,
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.getByTestId('aviso-operacion-completa').textContent).toContain(
      'La operación ya está completa',
    );
    expect(screen.queryByTestId('reanudar-detalle')).toBeNull();
    expect(screen.queryByTestId('cerrar-pausa-detalle')).toBeNull();
    expect(screen.getByTestId('formulario-actualizar-avance')).toBeTruthy();
  });

  it('no ofrece reanudar una pausa sin piezas nuevas, pero deja cerrarla', () => {
    const sesionPausada = {
      id: 'sesion-pausada',
      corridaId: null,
      operadorId: 'operador-1',
      operadorNombre: 'Operador de prueba',
      estadoSesion: 'pausada' as const,
      fechaInicio: '2026-11-19T08:00:00.000Z',
      fechaFin: '2026-11-19T10:00:00.000Z',
      piezasProducidas: 100,
      horasNetas: 2,
      motivoPausa: 'MATERIAL',
      motivoPausaNota: null,
      notas: null,
      verificacionCompleta: true,
    };
    const sinPiezas = {
      ...proceso,
      columna: 'pausada',
      sesionActiva: null,
      ultimaSesion: sesionPausada,
      sesiones: [sesionPausada],
      hechoPiezas: 100,
      metaPiezas: 250,
      pendientePiezas: 150,
      procesoCompleto: false,
      piezasDisponibles: 0,
      procesoPrevioNombre: 'Corte laser',
      puedeReanudar: false,
      puedeIniciar: false,
      motivoNoInicia: 'Sin piezas de Corte laser: espera a que libere más piezas para reanudar',
    } as unknown as ProcesoEspacioOperador;

    render(createElement(DetalleProcesoOperador, {
      proceso: sinPiezas,
      hoy: '2026-11-19',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.getByTestId('aviso-sin-piezas-reanudar').textContent).toContain(
      'Todavía no hay piezas de Corte laser',
    );
    expect(screen.queryByTestId('reanudar-detalle')).toBeNull();
    expect(screen.getByTestId('cerrar-pausa-detalle')).toBeTruthy();
  });

  it('aclara que cerrar la sesión en marcha no modifica las pausadas', async () => {
    const sesionPausada = {
      id: 'sesion-pausada',
      corridaId: null,
      operadorId: 'operador-1',
      operadorNombre: 'Operador de prueba',
      estadoSesion: 'pausada' as const,
      fechaInicio: '2026-10-27T17:52:00.000Z',
      fechaFin: '2026-10-28T01:52:00.000Z',
      piezasProducidas: 0,
      horasNetas: 8,
      motivoPausa: 'FIN_JORNADA',
      motivoPausaNota: null,
      notas: null,
      verificacionCompleta: true,
    };
    const conHistorial = {
      ...proceso,
      sesiones: [proceso.sesionActiva, sesionPausada].filter(Boolean),
    } as unknown as ProcesoEspacioOperador;

    render(createElement(DetalleProcesoOperador, {
      proceso: conHistorial,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.click(screen.getByTestId('alternar-cierre-sesion'));
    const nota = await screen.findByTestId('nota-pausas-independientes');
    expect(nota.textContent).toContain('solo afecta la sesión en marcha');
    expect(nota.textContent).toContain('historial independiente');
  });

  it('actualiza la pausa anterior y no la sesión activa al reanudar', async () => {
    const sesionPausada = {
      id: 'sesion-pausada',
      corridaId: null,
      operadorId: 'operador-1',
      operadorNombre: 'Operador de prueba',
      estadoSesion: 'pausada' as const,
      fechaInicio: '2026-10-28T08:00:00.000Z',
      fechaFin: '2026-10-28T09:00:00.000Z',
      piezasProducidas: 4,
      horasNetas: 1,
      motivoPausa: 'MATERIAL',
      motivoPausaNota: null,
      notas: null,
      verificacionCompleta: true,
      recursoLiberado: false,
      sesionInvalida: false,
    };
    const reanudado = {
      ...proceso,
      sesiones: [proceso.sesionActiva, sesionPausada].filter(Boolean),
      ultimaSesion: proceso.sesionActiva,
      pendienteActualizacionAvance: false,
    } as unknown as ProcesoEspacioOperador;
    const actualizarAvance = vi.fn().mockResolvedValue({ exito: true, estadoSesion: 'pausada' });

    render(createElement(DetalleProcesoOperador, {
      proceso: reanudado,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance,
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.click(screen.getByTestId('corregir-avance-pausa'));
    expect((screen.getByTestId('avance-sesion') as HTMLSelectElement).value).toBe('sesion-pausada');
    fireEvent.submit(screen.getByTestId('formulario-actualizar-avance'));

    await waitFor(() => expect(actualizarAvance).toHaveBeenCalledWith(
      reanudado,
      expect.objectContaining({ sesionId: 'sesion-pausada', piezasProducidas: 4, horasReales: 1 }),
    ));
  });

  it('A20: bloquea el cierre cuando la hora editada está adelantada', async () => {
    const manana = sumarDiasFecha(fechaLocalNegocio(), 1);
    const cerrar = vi.fn().mockResolvedValue({ exito: true } satisfies ResultadoOperacion);
    const conSesionHoy = {
      ...proceso,
      fechaOperativa: manana,
      sesionActiva: { ...proceso.sesionActiva, fechaInicio: `${manana}T12:00:00` },
    } as unknown as ProcesoEspacioOperador;

    render(createElement(DetalleProcesoOperador, {
      proceso: conSesionHoy,
      hoy: manana,
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(), mover: vi.fn(), liberar: vi.fn(), iniciar: vi.fn(),
        reanudar: vi.fn(), cerrarPausa: vi.fn(), actualizarAvance: vi.fn(), cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.click(screen.getByTestId('alternar-cierre-sesion'));
    const campo = screen.getByTestId('hora-fin-cierre') as HTMLInputElement;
    expect(campo.value).toMatch(/^\d{2}:\d{2}$/u);
    fireEvent.change(screen.getByTestId('piezas-cierre'), { target: { value: '1' } });
    fireEvent.change(campo, { target: { value: '15:00' } });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    expect(cerrar).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-cierre-mensaje').textContent).toContain('adelantada');
    fireEvent.click(screen.getByTestId('error-cierre-accion'));
    await waitFor(() => expect(document.activeElement?.getAttribute('data-testid'))
      .toBe('hora-fin-cierre'));
  });

  it('A20: una pausa declarada en una operación completa no abre el avance salvo que se pida', () => {
    const sesionPausada = {
      ...proceso.sesionActiva,
      id: 'pausa-declarada',
      estadoSesion: 'pausada' as const,
      fechaInicio: '2026-11-20T20:15:48.000Z',
      fechaFin: '2026-11-20T20:15:48.000Z',
      piezasProducidas: 50,
      horasNetas: 0,
      pendienteActualizacionAvance: false,
    };
    const completa = {
      ...proceso,
      columna: 'lista',
      sesionActiva: null,
      ultimaSesion: sesionPausada,
      sesiones: [sesionPausada],
      metaPiezas: 50,
      hechoPiezas: 50,
      procesoCompleto: true,
      piezasDisponibles: null,
      puedeReanudar: false,
      puedeIniciar: false,
    } as unknown as ProcesoEspacioOperador;

    render(createElement(DetalleProcesoOperador, {
      proceso: completa,
      hoy: '2026-11-20',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(), mover: vi.fn(), liberar: vi.fn(), iniciar: vi.fn(),
        reanudar: vi.fn(), cerrarPausa: vi.fn(), actualizarAvance: vi.fn(), cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.queryByTestId('formulario-actualizar-avance')).toBeNull();
    fireEvent.click(screen.getByTestId('corregir-avance-pausa'));
    expect(screen.getByTestId('formulario-actualizar-avance')).toBeTruthy();
    expect((screen.getByTestId('avance-sesion') as HTMLSelectElement).value).toBe('pausa-declarada');
  });

  it('oculta la reserva y el motivo redundante de la sesión en marcha', () => {
    const conReserva = {
      ...proceso,
      reclamo: {
        fecha: '2026-10-28',
        turno: 'matutino',
        horasEstimadas: 2,
        operadorId: 'operador-1',
      },
      motivoNoInicia: 'Ya hay una sesión activa en este proceso',
    } as unknown as ProcesoEspacioOperador;

    render(createElement(DetalleProcesoOperador, {
      proceso: conReserva,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.queryByText(/Reserva:/)).toBeNull();
    expect(screen.queryByText('Ya hay una sesión activa en este proceso')).toBeNull();
  });

  it('en un proceso posterior asume consumo 1:1 cuando «Usado» queda en 0', async () => {
    const cerrar = vi.fn().mockResolvedValue({ exito: true } satisfies ResultadoOperacion);
    const doblado = {
      ...proceso,
      id: 'proceso-doblado',
      metaProcesoId: 'meta-2',
      procesoNombre: 'Doblado CNC',
      areaCodigo: 'DOBLADO',
      areaNombre: 'Doblado',
      areaMacro: 'DOBLADO',
      secuencia: 2,
      cantidadSolicitada: 250,
      pendientePiezas: 250,
      piezasDisponibles: 250,
      procesoPrevioNombre: 'Corte laser',
      material: null,
    } as unknown as ProcesoEspacioOperador;

    render(createElement(DetalleProcesoOperador, {
      proceso: doblado,
      hoy: '2026-11-15',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.click(screen.getByTestId('alternar-cierre-sesion'));
    fireEvent.change(screen.getByLabelText('Piezas dobladas'), { target: { value: '250' } });
    expect(screen.getByTestId('aviso-consumo-automatico').textContent).toContain(
      'Se consumirán 250 piezas de Corte laser',
    );
    fireEvent.change(screen.getByTestId('motivo-consumo'), {
      target: { value: 'Consumo de piezas cortadas' },
    });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    await waitFor(() => expect(cerrar).toHaveBeenCalledWith(doblado, expect.objectContaining({
      piezasProducidas: 250,
      estadoDestino: 'finalizada',
    })));
    await waitFor(() => expect(registrarConsumoPiezasAccion).toHaveBeenCalledWith({
      sesionId: 'sesion-1',
      cantidadUsada: 250,
      cantidadMerma: 0,
      motivo: 'Consumo de piezas cortadas',
    }));
    expect(screen.queryByTestId('error-cierre-dialogo')).toBeNull();
  });

  it('muestra el error del cierre en un diálogo específico y lo cierra', async () => {
    const doblado = {
      ...proceso,
      id: 'proceso-doblado',
      metaProcesoId: 'meta-2',
      procesoNombre: 'Doblado CNC',
      areaMacro: 'DOBLADO',
      secuencia: 2,
      cantidadSolicitada: 250,
      pendientePiezas: 250,
      piezasDisponibles: 250,
      procesoPrevioNombre: 'Corte laser',
      material: null,
    } as unknown as ProcesoEspacioOperador;
    const cerrar = vi.fn();

    render(createElement(DetalleProcesoOperador, {
      proceso: doblado,
      hoy: '2026-11-15',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.click(screen.getByTestId('alternar-cierre-sesion'));
    fireEvent.change(screen.getByLabelText('Piezas dobladas'), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Usado'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('motivo-consumo'), {
      target: { value: 'Consumo de piezas cortadas' },
    });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    const dialogo = await screen.findByTestId('error-cierre-dialogo');
    expect(dialogo.getAttribute('role')).toBe('alertdialog');
    const mensaje = screen.getByTestId('error-cierre-mensaje');
    expect(dialogo.textContent).toContain('Revisa el consumo de piezas');
    expect(mensaje.textContent).toContain('Declaraste 250 piezas terminadas en Doblado CNC');
    expect(mensaje.textContent).toContain('el campo Usado de Corte laser tiene 5');
    expect(mensaje.textContent).toContain('el sistema tomará las 250 piezas');
    expect(mensaje.textContent).not.toContain('1:1');
    expect(screen.getByTestId('error-cierre-accion').textContent)
      .toBe('Usar 250 piezas de Corte laser');
    expect(screen.getByTestId('error-cierre-entendido').textContent).toBe('Volver a revisar');
    expect(cerrar).not.toHaveBeenCalled();

    // «Entendido» solo cierra el aviso; el formulario sigue abierto y sin enviar.
    fireEvent.click(screen.getByTestId('error-cierre-entendido'));
    await waitFor(() => expect(screen.queryByTestId('error-cierre-dialogo')).toBeNull());
    expect(cerrar).not.toHaveBeenCalled();
    expect(screen.getByTestId('cerrar-sesion-detalle')).toBeTruthy();

    // La acción sugerida rellena «Usado» con lo producido y cierra el aviso.
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));
    await screen.findByTestId('error-cierre-dialogo');
    fireEvent.click(screen.getByTestId('error-cierre-accion'));
    await waitFor(() => expect(screen.queryByTestId('error-cierre-dialogo')).toBeNull());
    expect((screen.getByLabelText('Usado') as HTMLInputElement).value).toBe('250');
    expect(cerrar).not.toHaveBeenCalled();
  });

  it('no registra consumo de piezas cuando se cierra sin producir', async () => {
    vi.mocked(registrarConsumoPiezasAccion).mockClear();
    const cerrar = vi.fn().mockResolvedValue({ exito: true } satisfies ResultadoOperacion);
    const doblado = {
      ...proceso,
      id: 'proceso-doblado',
      metaProcesoId: 'meta-2',
      procesoNombre: 'Doblado CNC',
      areaMacro: 'DOBLADO',
      secuencia: 2,
      cantidadSolicitada: 250,
      pendientePiezas: 250,
      piezasDisponibles: 250,
      procesoPrevioNombre: 'Corte laser',
      material: null,
    } as unknown as ProcesoEspacioOperador;

    render(createElement(DetalleProcesoOperador, {
      proceso: doblado,
      hoy: '2026-11-15',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.click(screen.getByTestId('alternar-cierre-sesion'));
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce());
    expect(registrarConsumoPiezasAccion).not.toHaveBeenCalled();
    expect(screen.queryByTestId('error-cierre-dialogo')).toBeNull();
  });

  it('ante un material sin costo confirmado avisa antes de cerrar y ofrece pausar la sesión como salida', async () => {
    const cerrar = vi.fn().mockResolvedValue({
      exito: false,
      error: 'El material no tiene costo confirmado',
      codigo: 'costo_material_no_configurado',
    } satisfies ResultadoOperacion);

    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-11-17',
      soloLectura: false,
      procesando: false,
      motivosPausa: [
        { codigo: 'MATERIAL', nombre: 'Falta de material', requiereNota: false, liberaMaquina: true },
      ],
      materiales: [
        {
          id: 'material-1',
          codigo: 'MDF-12',
          nombre: 'MDF 12 mm',
          unidadBase: 'm2',
          costoVigente: null,
        },
      ],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    // El aviso aparece antes de que el operador capture y envíe el cierre.
    expect(screen.getByTestId('aviso-material-sin-costo').textContent).toContain('MDF 12 mm');

    fireEvent.click(screen.getByTestId('alternar-cierre-sesion'));
    fireEvent.change(screen.getByLabelText('Piezas cortadas'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('usado-cierre'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('motivo-consumo'), { target: { value: 'Consumo MDF' } });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    const modal = await screen.findByTestId('error-cierre-dialogo');
    expect(modal.textContent).toContain('MDF 12 mm');
    const salida = screen.getByTestId('error-cierre-accion');
    expect(salida.textContent).toContain('Pausar sesión');
    fireEvent.click(salida);

    expect((screen.getByTestId('resultado-cierre') as HTMLSelectElement).value).toBe('pausada');
    expect((screen.getByTestId('notas-cierre') as HTMLTextAreaElement).value).toContain('MDF 12 mm');
    // No se reintenta el cierre con un material distinto ni se relaja la validación.
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('no avisa falta de costo cuando el material sí tiene costo confirmado', () => {
    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-11-17',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [
        {
          id: 'material-1',
          codigo: 'CRS-14',
          nombre: 'Acero al carbón calibre 14',
          unidadBase: 'm2',
          costoVigente: 615,
        },
      ],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.queryByTestId('aviso-material-sin-costo')).toBeNull();
  });

  it('muestra el cronómetro y exige la hora real de conclusión prellenada', () => {
    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.getByTestId('contador-sesion-detalle')).toBeTruthy();

    fireEvent.click(screen.getByTestId('alternar-cierre-sesion'));
    const campo = screen.getByTestId('hora-fin-cierre') as HTMLInputElement;
    expect(campo.value).toMatch(/^\d{2}:\d{2}$/u);
    expect(campo.type).toBe('time');
    expect(campo.required).toBe(true);
    expect(screen.queryByTestId('minutos-setup')).toBeNull();
  });

  it('envía la hora real de conclusión corregida por el operador', async () => {
    const cerrar = vi.fn().mockResolvedValue({ exito: true } satisfies ResultadoOperacion);
    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    // Hora en el pasado (zona del taller): un valor fijo como 11:00 cae en el
    // futuro según la hora a la que corra la suite y el cierre se rechaza.
    const horaFin = ahoraHoraInputNegocio(new Date(Date.now() - 5 * 60_000));
    fireEvent.click(screen.getByTestId('alternar-cierre-sesion'));
    fireEvent.change(screen.getByTestId('piezas-cierre'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('hora-fin-cierre'), {
      target: { value: horaFin },
    });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce());
    expect(cerrar).toHaveBeenCalledWith(
      proceso,
      expect.objectContaining({ horaFin: expect.stringMatching(new RegExp(`T${horaFin}$`)) }),
    );
  });

});

  it('CRIT-1: precarga la hora de Tijuana aunque el campo nazca dentro de un Portal', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T18:38:00.000Z'));

    render(createElement(DetalleProcesoOperador, {
      proceso,
      hoy: '2026-11-21',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(), mover: vi.fn(), liberar: vi.fn(), iniciar: vi.fn(),
        reanudar: vi.fn(), cerrarPausa: vi.fn(), actualizarAvance: vi.fn(), cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'dialogo',
    }));

    // Sin abrir el accordion: el valor debe estar precargado desde el primer render.
    expect((screen.getByTestId('hora-fin-cierre') as HTMLInputElement).value).toBe('10:38');
    vi.useRealTimers();
  });

  it('CRIT-1: la opción por defecto de demora usa hora de Tijuana y no se marca adelantada', async () => {
    const cerrar = vi.fn().mockResolvedValue({ exito: true, datos: { id: 'sesion-1', actualizadoEn: new Date().toISOString() } });
    const conDemora = {
      ...proceso,
      horasEstimadas: 0.25,
      sesionActiva: {
        ...proceso.sesionActiva,
        fechaInicio: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      },
    } as typeof proceso;

    render(createElement(DetalleProcesoOperador, {
      proceso: conDemora,
      hoy: '2026-11-21',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(), mover: vi.fn(), liberar: vi.fn(), iniciar: vi.fn(),
        reanudar: vi.fn(), cerrarPausa: vi.fn(), actualizarAvance: vi.fn(), cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.change(screen.getByLabelText('Piezas cortadas'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'material-1' } });
    fireEvent.change(screen.getByLabelText('Usado'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('motivo-consumo'), { target: { value: 'Consumo de producción' } });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    expect(screen.getByTestId('dialogo-motivo-demora')).toBeTruthy();
    fireEvent.click(screen.getByTestId('confirmar-demora'));

    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce());
    expect(screen.queryByText(/adelantada/u)).toBeNull();
  });

  it('pide el motivo cuando la sesión supera el estimado y cierra con la opción elegida', async () => {
    const cerrar = vi.fn().mockResolvedValue({ exito: true, datos: { id: 'sesion-1', actualizadoEn: '2026-10-28T12:00:00.000Z' } });
    const conDemora = {
      ...proceso,
      horasEstimadas: 1.5,
      sesionActiva: {
        ...proceso.sesionActiva,
        fechaInicio: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      },
    } as typeof proceso;

    render(createElement(DetalleProcesoOperador, {
      proceso: conDemora,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(), mover: vi.fn(), liberar: vi.fn(), iniciar: vi.fn(),
        reanudar: vi.fn(), cerrarPausa: vi.fn(), actualizarAvance: vi.fn(), cerrar,
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.change(screen.getByLabelText('Piezas cortadas'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'material-1' } });
    fireEvent.change(screen.getByLabelText('Usado'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('motivo-consumo'), { target: { value: 'Consumo de producción' } });
    fireEvent.click(screen.getByTestId('cerrar-sesion-detalle'));

    expect(screen.getByTestId('dialogo-motivo-demora')).toBeTruthy();
    expect(cerrar).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('opcion-demora'), { target: { value: 'OTRO' } });
    fireEvent.change(screen.getByTestId('detalle-demora'), {
      target: { value: 'Se atascó el láser y hubo que recalibrar el equipo' },
    });
    fireEvent.click(screen.getByTestId('confirmar-demora'));

    await waitFor(() => expect(cerrar).toHaveBeenCalledOnce());
    expect(cerrar.mock.calls[0]?.[1]).toMatchObject({
      motivoExceso: 'OTRO',
      detalleExceso: 'Se atascó el láser y hubo que recalibrar el equipo',
    });
  });

  it('bloquea el cierre y ofrece liberar la primera pieza cuando la corrida la exige', () => {
    const conPrimeraPendiente = {
      ...proceso,
      sesionActiva: { ...proceso.sesionActiva, primeraPiezaPendiente: true },
    } as typeof proceso;

    render(createElement(DetalleProcesoOperador, {
      proceso: conPrimeraPendiente,
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(), mover: vi.fn(), liberar: vi.fn(), iniciar: vi.fn(),
        reanudar: vi.fn(), cerrarPausa: vi.fn(), actualizarAvance: vi.fn(), cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.getByTestId('bloqueo-primera-pieza-cierre').textContent)
      .toContain('Falta liberar la primera pieza para poder finalizar');
    expect((screen.getByTestId('cerrar-sesion-detalle') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('liberar-primera-pieza-desde-cierre')).toBeTruthy();
  });

describe('actualizar avance: cierre visual sin PIN', () => {
  const sesionPausada = {
    id: 'sesion-pausada',
    corridaId: null,
    operadorId: 'operador-1',
    operadorNombre: 'Operador de prueba',
    estadoSesion: 'pausada' as const,
    fechaInicio: '2026-11-18T09:00:00.000Z',
    fechaFin: '2026-11-18T11:00:00.000Z',
    piezasProducidas: 6,
    horasNetas: 2,
    motivoPausa: 'FIN_JORNADA',
    motivoPausaNota: null,
    notas: null,
    verificacionCompleta: true,
    pendienteActualizacionAvance: true,
  };
  const pausado = {
    ...proceso,
    columna: 'pausada',
    sesionActiva: null,
    ultimaSesion: sesionPausada,
    sesiones: [sesionPausada],
    hechoPiezas: 6,
    metaPiezas: 10,
    pendientePiezas: 4,
    procesoCompleto: false,
    puedeReanudar: true,
    puedeIniciar: false,
  } as unknown as ProcesoEspacioOperador;

  function montar(
    actualizarAvance: ReturnType<typeof vi.fn>,
    procesoBase: ProcesoEspacioOperador = pausado,
  ) {
    return render(createElement(DetalleProcesoOperador, {
      proceso: procesoBase,
      hoy: '2026-11-18',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: actualizarAvance as never,
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));
  }

  it('A16: explica por qué la comida registró cero horas en el bloque', () => {
    const comida = {
      ...sesionPausada,
      id: 'sesion-comida',
      fechaInicio: '2026-11-20T20:15:48.000Z',
      fechaFin: '2026-11-20T20:48:44.000Z',
      horasBrutas: 0.55,
      horasNetas: 0,
      piezasProducidas: 50,
      motivoPausa: 'COMIDA',
      pendienteActualizacionAvance: false,
    };
    const pausaComida = {
      ...pausado,
      ultimaSesion: comida,
      sesiones: [comida],
    } as unknown as ProcesoEspacioOperador;

    montar(vi.fn(), pausaComida);

    expect(screen.getByTestId('aviso-comida-sin-horas').textContent)
      .toContain('Este bloque coincidió con la comida, de 12:00 a 13:00');
  });

  it('cierra el formulario y muestra confirmación verde al guardar el avance', async () => {
    const actualizar = vi.fn().mockResolvedValue({
      exito: true,
      datos: {
        id: sesionPausada.id,
        estadoSesion: 'finalizada',
        horasNetas: 2,
        piezasProducidas: 40,
        cantidadProducidaPartida: 40,
        estadoOrden: 'en_proceso',
        estadoPlaneacion: 'programada',
        actualizadoEn: '2026-11-18T11:05:00.000Z',
      },
    });
    montar(actualizar);

    expect(screen.getByTestId('formulario-actualizar-avance')).toBeDefined();
    fireEvent.change(screen.getByTestId('avance-piezas'), { target: { value: '40' } });
    fireEvent.change(screen.getByTestId('avance-horas'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('actualizar-avance-detalle'));

    await waitFor(() =>
      expect(actualizar).toHaveBeenCalledWith(pausado, expect.objectContaining({ piezasProducidas: 40 })),
    );
    await waitFor(() => expect(screen.queryByTestId('formulario-actualizar-avance')).toBeNull());
    expect(screen.getByTestId('avance-actualizado-confirmacion').textContent).toContain(
      'actualizados correctamente',
    );
  });

  it('mantiene el formulario abierto si la pausa sigue pendiente de consumo', async () => {
    const actualizar = vi.fn().mockResolvedValue({
      exito: true,
      estadoSesion: 'pausada',
      datos: { id: sesionPausada.id, estadoSesion: 'pausada' },
    });
    montar(actualizar);

    fireEvent.change(screen.getByTestId('avance-piezas'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('avance-horas'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('actualizar-avance-detalle'));

    await waitFor(() => expect(actualizar).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('formulario-actualizar-avance')).toBeTruthy();
    expect(screen.queryByTestId('avance-actualizado-confirmacion')).toBeNull();
  });

  it('envía el avance solo con la sesión del operador, sin pedir PIN', async () => {
    const actualizar = vi.fn().mockResolvedValue({ exito: true });
    montar(actualizar);

    fireEvent.change(screen.getByTestId('avance-piezas'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('actualizar-avance-detalle'));

    await waitFor(() => expect(actualizar).toHaveBeenCalledTimes(1));
    const [, datos] = actualizar.mock.calls[0] ?? [];
    expect(datos).not.toHaveProperty('pinConfirmacion');
    expect(screen.queryByTestId('avance-pin')).toBeNull();
  });


  it('no pide consumo de lámina en una operación posterior y lo explica', () => {
    const posterior = {
      ...pausado,
      piezasDisponibles: 8,
      procesoPrevioNombre: 'Corte',
      puedeReanudar: false,
    } as unknown as ProcesoEspacioOperador;

    render(createElement(DetalleProcesoOperador, {
      proceso: posterior,
      hoy: '2026-11-18',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.queryByTestId('avance-opcion-consumo')).toBeNull();
    expect(screen.queryByTestId('avance-material')).toBeNull();
    expect(screen.getByTestId('formulario-actualizar-avance').textContent).toContain(
      'se registra al cerrar la operación',
    );
  });

  it('exige consumo cuando el avance completa la primera operación', async () => {
    const actualizar = vi.fn().mockResolvedValue({ exito: true, estadoSesion: 'finalizada' });

    render(createElement(DetalleProcesoOperador, {
      proceso: pausado,
      hoy: '2026-11-18',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: actualizar as never,
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.change(screen.getByTestId('avance-piezas'), { target: { value: '10' } });
    expect(screen.getByTestId('avance-material')).toBeDefined();

    // Sin cantidades no se envía: finalizaría sin asentar el consumo.
    fireEvent.click(screen.getByTestId('actualizar-avance-detalle'));
    await waitFor(() => expect(screen.getByTestId('error-avance-dialogo')).toBeDefined());
    expect(actualizar).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('avance-material-usada'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('avance-material-motivo'), {
      target: { value: 'Consumo de lámina' },
    });
    fireEvent.click(screen.getByTestId('actualizar-avance-detalle'));

    await waitFor(() => expect(actualizar).toHaveBeenCalledWith(
      pausado,
      expect.objectContaining({
        materialId: 'material-1',
        cantidadUsada: 5,
        motivoConsumo: 'Consumo de lámina',
      }),
    ));
  });

  it('no vuelve a exigir consumo si la partida ya lo registró', async () => {
    const actualizar = vi.fn().mockResolvedValue({ exito: true, estadoSesion: 'finalizada' });

    render(createElement(DetalleProcesoOperador, {
      proceso: pausado,
      hoy: '2026-11-18',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [{
        id: 'consumo-1',
        partidaId: 'partida-1',
        materialId: 'material-1',
        cantidadUsada: 12,
        cantidadScrap: 0,
        creadoEn: '2026-11-18T08:00:00.000Z',
      }],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: actualizar as never,
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.change(screen.getByTestId('avance-piezas'), { target: { value: '10' } });
    expect(screen.queryByTestId('avance-material')).toBeNull();
    fireEvent.click(screen.getByTestId('actualizar-avance-detalle'));

    await waitFor(() => expect(actualizar).toHaveBeenCalledTimes(1));
    expect(actualizar.mock.calls[0]?.[1]).not.toHaveProperty('materialId');
  });

  it('repliega el avance a solo el consumo si el servidor deja la pausa abierta', async () => {
    const actualizar = vi.fn().mockResolvedValue({ exito: true, estadoSesion: 'pausada' });

    render(createElement(DetalleProcesoOperador, {
      proceso: pausado,
      hoy: '2026-11-18',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: actualizar as never,
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.change(screen.getByTestId('avance-piezas'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('avance-material-usada'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('avance-material-motivo'), {
      target: { value: 'Consumo de lámina' },
    });
    fireEvent.click(screen.getByTestId('actualizar-avance-detalle'));

    await waitFor(() => expect(actualizar).toHaveBeenCalledTimes(1));
    const formulario = screen.getByTestId('formulario-actualizar-avance');
    expect(formulario.textContent).toContain('falta el consumo de material');
    expect(screen.queryByTestId('avance-piezas')).toBeNull();
    expect(screen.queryByTestId('avance-horas')).toBeNull();
    expect(screen.getByTestId('actualizar-avance-detalle').textContent).toContain(
      'Registrar consumo',
    );
  });

  it('no envía horas mayores a la duración del bloque y explica cuánto duró', async () => {
    const actualizar = vi.fn().mockResolvedValue({ exito: true });
    montar(actualizar);

    expect((screen.getByTestId('avance-horas') as HTMLInputElement).max).toBe('2');
    expect(screen.getByTestId('avance-horas-ayuda').textContent).toContain('duró 2 h');
    expect(screen.getByTestId('duracion-bloque-pausa').textContent).toContain('duró 2 h');

    fireEvent.change(screen.getByTestId('avance-horas'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('actualizar-avance-detalle'));

    const dialogo = await screen.findByTestId('error-avance-dialogo');
    expect(dialogo.getAttribute('role')).toBe('alertdialog');
    expect(actualizar).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-cierre-mensaje').textContent).toContain('duró 2 h');
    expect(screen.getByTestId('error-cierre-mensaje').textContent).toContain('no puede ser mayor');
    expect(screen.getByTestId('error-cierre-accion').textContent).toBe('Ajustar a 2 h');
  });

  it('el ajuste sugerido nunca supera el bloque: 5 min no se redondea a 0.08 h', async () => {
    // Bloque de 4 min 30 s. El redondeo a dos decimales lo dejaba en 0.08 h y
    // el reintento volvía a fallar con «horas_reales_exceden_sesion».
    const sesionCorta = {
      ...sesionPausada,
      id: 'sesion-corta',
      fechaInicio: '2026-11-18T10:55:30.000Z',
      fechaFin: '2026-11-18T11:00:00.000Z',
      horasNetas: 0.075,
      piezasProducidas: 0,
    };
    const pausadoCorto = {
      ...pausado,
      ultimaSesion: sesionCorta,
      sesiones: [sesionCorta],
      hechoPiezas: 0,
    } as unknown as ProcesoEspacioOperador;
    const actualizar = vi.fn().mockResolvedValue({ exito: true });
    montar(actualizar, pausadoCorto);

    const campo = screen.getByTestId('avance-horas') as HTMLInputElement;
    expect(Number(campo.max)).toBeLessThanOrEqual(0.075);
    expect(Number(campo.max)).toBeGreaterThan(0);

    fireEvent.change(campo, { target: { value: '0.08' } });
    fireEvent.click(screen.getByTestId('actualizar-avance-detalle'));

    await screen.findByTestId('error-avance-dialogo');
    expect(screen.getByTestId('error-cierre-accion').textContent).toBe('Ajustar a 4 min');
    expect(actualizar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('error-cierre-accion'));
    await waitFor(() => expect(screen.queryByTestId('error-avance-dialogo')).toBeNull());
    expect(Number((screen.getByTestId('avance-horas') as HTMLInputElement).value))
      .toBeLessThanOrEqual(0.075);

    fireEvent.click(screen.getByTestId('actualizar-avance-detalle'));
    await waitFor(() => expect(actualizar).toHaveBeenCalledTimes(1));
    const [, datos] = actualizar.mock.calls[0] ?? [];
    expect(datos.horasReales).toBeLessThanOrEqual(0.075);
  });

  it('ofrece cambiar al bloque donde sí cupo el tiempo declarado', async () => {
    const sesionAntigua = {
      ...sesionPausada,
      id: 'sesion-antigua',
      fechaInicio: '2026-11-18T06:00:00.000Z',
      fechaFin: '2026-11-18T09:00:00.000Z',
      piezasProducidas: 4,
      horasNetas: 3,
    };
    const sesionReciente = {
      ...sesionPausada,
      id: 'sesion-reciente',
      fechaInicio: '2026-11-18T09:00:00.000Z',
      fechaFin: '2026-11-18T09:05:00.000Z',
      piezasProducidas: 2,
      horasNetas: 0.08,
    };
    const pausadoDoble = {
      ...pausado,
      ultimaSesion: sesionReciente,
      sesiones: [sesionAntigua, sesionReciente],
      hechoPiezas: 6,
    } as unknown as ProcesoEspacioOperador;
    const actualizar = vi.fn().mockResolvedValue({ exito: true });
    montar(actualizar, pausadoDoble);

    fireEvent.change(screen.getByTestId('avance-horas'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('actualizar-avance-detalle'));

    await screen.findByTestId('error-avance-dialogo');
    expect(actualizar).not.toHaveBeenCalled();
    const usarBloque = screen.getByTestId('error-cierre-accion-1');
    expect(usarBloque.textContent).toContain('Usar el bloque del');

    fireEvent.click(usarBloque);
    await waitFor(() => expect(screen.queryByTestId('error-avance-dialogo')).toBeNull());
    expect((screen.getByTestId('avance-piezas') as HTMLInputElement).value).toBe('4');
    expect((screen.getByTestId('avance-sesion') as HTMLSelectElement).value).toBe('sesion-antigua');
  });
});

describe('proceso reclamado por otro operador', () => {
  const sesionPausada = {
    id: 'sesion-pausada',
    corridaId: null,
    operadorId: 'operador-otro',
    operadorNombre: 'Operadora Dos',
    estadoSesion: 'pausada' as const,
    fechaInicio: '2026-11-18T09:00:00.000Z',
    fechaFin: '2026-11-18T11:00:00.000Z',
    piezasProducidas: 6,
    horasNetas: 2,
    motivoPausa: 'FIN_JORNADA',
    motivoPausaNota: null,
    notas: null,
    verificacionCompleta: true,
    pendienteActualizacionAvance: true,
  };

  function procesoPausado(reclamadoPorMi: boolean) {
    return {
      ...proceso,
      columna: 'pausada',
      sesionActiva: null,
      ultimaSesion: sesionPausada,
      sesiones: [sesionPausada],
      pendienteActualizacionAvance: true,
      puedeReanudar: reclamadoPorMi,
      puedeIniciar: false,
      reclamo: {
        id: 'reclamo-1',
        ordenId: 'orden-1',
        partidaId: 'partida-1',
        metaProcesoId: 'meta-1',
        programacionId: 'programacion-1',
        operadorId: reclamadoPorMi ? 'operador-1' : 'operador-otro',
        fecha: '2026-11-18',
        turno: 'matutino',
        horasEstimadas: 2,
        estado: 'activo',
        creadoEn: '2026-11-18T08:00:00.000Z',
        actualizadoEn: '2026-11-18T08:00:00.000Z',
      },
      reclamadoPorMi,
      nombreReclamante: reclamadoPorMi ? 'Operador de prueba' : 'Operadora Dos',
    } as unknown as ProcesoEspacioOperador;
  }

  function montar(actual: ProcesoEspacioOperador) {
    return render(createElement(DetalleProcesoOperador, {
      proceso: actual,
      hoy: '2026-11-18',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));
  }

  it('muestra los detalles y el reclamante, sin formulario de avance ni acciones', () => {
    montar(procesoPausado(false));

    expect(screen.getByTestId('aviso-proceso-tomado').textContent).toContain('Operadora Dos');
    expect(screen.getByTestId('pausa-sesion-detalle')).toBeDefined();
    expect(screen.queryByTestId('formulario-actualizar-avance')).toBeNull();
    expect(screen.queryByTestId('alerta-primera-pieza')).toBeNull();
    expect(screen.queryByLabelText('Acciones del proceso')).toBeNull();
    expect(screen.queryByTestId('actualizar-avance-detalle')).toBeNull();
    expect(screen.queryByTestId('reanudar-detalle')).toBeNull();
    expect(screen.queryByTestId('cerrar-pausa-detalle')).toBeNull();
    expect(screen.queryByTestId('reclamar-detalle')).toBeNull();
    expect(screen.getByTestId('aviso-pausa-proceso-ajeno').textContent).toContain('Operadora Dos');
  });

  it('permite operar la pausa cuando el proceso sí está reclamado por mí', () => {
    montar(procesoPausado(true));

    expect(screen.queryByTestId('aviso-proceso-tomado')).toBeNull();
    expect(screen.getByTestId('formulario-actualizar-avance')).toBeDefined();
    expect(screen.getByTestId('actualizar-avance-detalle')).toBeDefined();
  });

  it('muestra Crear Lote dentro de la ficha cuando el ítem tiene una sugerencia', () => {
    const sugerencia = {
      clave: 'orden|material|1.4|CORTE LASER',
      ordenId: 'orden-1',
      materialCodigo: 'LAM-CR-14',
      espesorMm: 1.4,
      procesoNombre: 'CORTE LASER',
      procesos: [procesoPausado(true)],
      mensaje: 'Puede iniciarlos en una misma corrida.',
    } as unknown as SugerenciaCorrida;
    const onCrearLote = vi.fn();

    render(createElement(DetalleProcesoOperador, {
      proceso: procesoPausado(true),
      hoy: '2026-11-18',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      sugerenciaLote: sugerencia,
      onCrearLote,
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    const boton = screen.getByTestId(`crear-lote-detalle-${sugerencia.clave}`);
    expect(boton.textContent).toContain('Crear Lote');
    fireEvent.click(boton);
    expect(onCrearLote).toHaveBeenCalledWith(sugerencia);
  });

  it('muestra la referencia del lote terminado en la ficha de la operación', () => {
    render(createElement(DetalleProcesoOperador, {
      proceso: {
        ...proceso,
        corridaReferencia: { id: 'corrida-1', codigo: 'LAS02', estado: 'COMPLETADA' },
      },
      hoy: '2026-11-18',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    const etiqueta = screen.getByTestId(`corrida-operacion-${proceso.id}`);
    expect(etiqueta.textContent).toContain('Trabajado en lote LAS02');
  });

  it('ofrece «Ver lote» que abre la ficha del lote en vez de iniciar el proceso por ítem', () => {
    const onIniciarCorridaLote = vi.fn();
    render(createElement(DetalleProcesoOperador, {
      proceso: { ...proceso, loteId: 'corrida-1', loteCodigo: 'LAS02', puedeIniciar: true },
      hoy: '2026-11-18',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      onIniciarCorridaLote,
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.queryByTestId('iniciar-detalle')).toBeNull();
    const boton = screen.getByTestId('ver-lote-desde-detalle');
    expect(boton.textContent).toContain('LAS02');
    expect(boton.textContent).not.toContain('iniciar corrida');
    fireEvent.click(boton);
    expect(onIniciarCorridaLote).toHaveBeenCalledTimes(1);
  });

  it('oculta Crear Lote en la ficha cuando ya no hay sugerencia', () => {
    render(createElement(DetalleProcesoOperador, {
      proceso: procesoPausado(true),
      hoy: '2026-11-18',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.queryByText('Crear Lote')).toBeNull();
  });
});

describe('DetalleProcesoOperador — consumo y reprogramación', () => {
  function montarConMaterial(
    datosMaterialCliente: unknown[],
    procesoExtra: Record<string, unknown> = {},
    iniciar: (...args: unknown[]) => void = vi.fn(),
  ) {
    vi.mocked(obtenerMaterialClienteOrdenAccion).mockResolvedValueOnce({
      exito: true,
      datos: datosMaterialCliente as never,
    });
    render(createElement(DetalleProcesoOperador, {
      proceso: { ...proceso, ...procesoExtra },
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [{ id: 'material-1', codigo: 'AC-01', nombre: 'Acero', unidadBase: 'kg' }],
      consumos: [],
      acciones: {
        reclamar: vi.fn(), mover: vi.fn(), liberar: vi.fn(), iniciar,
        reanudar: vi.fn(), cerrarPausa: vi.fn(), actualizarAvance: vi.fn(), cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));
  }

  it('marca consumo y merma obligatorios cuando el material lo pone la empresa', () => {
    montarConMaterial([]);
    expect(screen.getAllByText(/Consumo de material/u).some((nodo) => (
      nodo.textContent?.includes('obligatorio')
    ))).toBe(true);
    expect(screen.getByTestId('usado-cierre').className).toContain('border-peligro/50');
    expect(screen.getByTestId('merma-cierre').className).toContain('border-peligro/50');
  });

  it('deja el consumo opcional cuando el material lo puso el cliente', async () => {
    montarConMaterial([{
      partidaId: 'partida-1', materialId: 'material-cliente-1',
      codigoItem: 'PZA-01', cantidad: 5,
    }]);
    await waitFor(() => expect(screen.getAllByText(/Consumo de material/u).some((nodo) => (
      nodo.textContent?.includes('opcional')
    ))).toBe(true));
    expect(screen.getByTestId('usado-cierre').className).not.toContain('border-peligro/50');
  });

  it('autocompleta la fecha al iniciar y no pide asterisco ni borde rojo', () => {
    const iniciar = vi.fn();
    montarConMaterial([], {
      sesionActiva: null,
      puedeIniciar: true,
      reclamadoPorMi: false,
    }, iniciar);
    const campo = screen.getByLabelText('Día de la jornada') as HTMLInputElement;
    expect(campo.value).toBe('2026-10-28');
    expect(campo.className).not.toContain('border-peligro/50');
    expect(campo.closest('label')?.className).not.toContain('after:content');
    expect((screen.getByTestId('iniciar-detalle') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('iniciar-detalle'));
    expect(iniciar).toHaveBeenCalledTimes(1);
    expect(iniciar.mock.calls[0]?.[1]).toBe('2026-10-28');
    expect(iniciar.mock.calls[0]?.[2]).toBe('matutino');
  });

  it('deja la fecha de reprogramación vacía y marcada en la ficha del operador', () => {
    montarConMaterial([], {
      reclamadoPorMi: true,
      sesionActiva: null,
      programacion: { ...proceso.programacion, estadoPlaneacion: 'en_preparacion' },
    });
    const fecha = screen.getByLabelText('Día de la jornada') as HTMLInputElement;
    expect(fecha.value).toBe('');
    expect(fecha.className).toContain('border-peligro/50');
    fireEvent.click(screen.getByTestId('mover-detalle'));
    expect(screen.getByText('Indica la fecha de reprogramación.')).toBeTruthy();
  });

  it('revalida la ocupación al cambiar la fecha o el turno', () => {
    const onValidarOcupacion = vi.fn(async () => null);
    render(createElement(DetalleProcesoOperador, {
      proceso: {
        ...proceso,
        puedeIniciar: true,
        motivoNoInicia: null,
        reclamadoPorMi: false,
        sesionActiva: null,
      },
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      onValidarOcupacion,
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar: vi.fn(),
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    fireEvent.change(screen.getByLabelText('Día de la jornada'), { target: { value: '2026-10-29' } });
    expect(onValidarOcupacion).toHaveBeenCalledWith('2026-10-29', 'matutino');
    fireEvent.change(screen.getByLabelText('Turno'), { target: { value: 'vespertino' } });
    expect(onValidarOcupacion).toHaveBeenCalledWith('2026-10-29', 'vespertino');
  });

  it('reemplaza «Iniciar proceso» por el aviso de equipo ocupado', () => {
    const iniciar = vi.fn();
    render(createElement(DetalleProcesoOperador, {
      proceso: {
        ...proceso,
        puedeIniciar: true,
        motivoNoInicia: null,
        sesionActiva: null,
      },
      hoy: '2026-10-28',
      soloLectura: false,
      procesando: false,
      motivosPausa: [],
      materiales: [],
      consumos: [],
      mensajeEquipoOcupado: 'LASER-01 (LASER FIBRA) está ocupado por la orden O-1126_16 · IT01, operador alex.',
      acciones: {
        reclamar: vi.fn(),
        mover: vi.fn(),
        liberar: vi.fn(),
        iniciar,
        reanudar: vi.fn(),
        cerrarPausa: vi.fn(),
        actualizarAvance: vi.fn(),
        cerrar: vi.fn(),
      },
      onCerrar: vi.fn(),
      presentacion: 'integrado',
    }));

    expect(screen.queryByTestId('iniciar-detalle')).toBeNull();
    const aviso = screen.getByTestId('equipo-ocupado-detalle');
    expect(aviso.textContent).toContain('LASER-01');
    expect(aviso.textContent).toContain('O-1126_16');
  });
});
