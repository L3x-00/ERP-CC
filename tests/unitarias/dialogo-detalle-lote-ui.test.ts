// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogoDetalleLote } from '@/modulos/produccion/componentes/dialogo-detalle-lote';
import { hoyIso } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import type { LoteTablero, SesionLote } from '@/modulos/produccion/tipos/indice';

afterEach(cleanup);

const LOTE: LoteTablero = {
  id: 'corrida-1',
  codigo: 'LAS01',
  estado: 'PLANIFICADA',
  ordenId: 'orden-1',
  folioOrden: 'O-1126_12',
  clienteNombre: 'Muebles Industriales Bravo',
  procesoNombre: 'CORTE LASER',
  areaCodigo: 'LASER',
  areaCodigos: ['LASER'],
  cantidadPlanificada: 210,
  items: [
    { id: null, partidaId: 'partida-1', codigoItem: 'IT01', cantidad: 120 },
    { id: null, partidaId: 'partida-2', codigoItem: 'IT02', cantidad: 90 },
  ],
  creadoEn: '2026-11-27T00:00:00.000Z',
};

describe('DialogoDetalleLote', () => {
  it('muestra el detalle del lote y exige fecha antes de iniciar la corrida', () => {
    const onIniciar = vi.fn();
    render(createElement(DialogoDetalleLote, {
      lote: LOTE,
      puedeOperar: true,
      onIniciar,
      onCerrar: vi.fn(),
    }));

    expect(screen.getByText('Lote LAS01')).toBeTruthy();
    expect(screen.getByTestId('item-lote-partida-1').textContent).toContain('120');
    expect(screen.getByTestId('item-lote-partida-2').textContent).toContain('90');

    const fecha = screen.getByTestId('fecha-inicio-corrida') as HTMLInputElement;
    const hoy = hoyIso();
    expect(fecha.value).toBe(hoy);
    expect(fecha.className).not.toContain('border-peligro/50');
    expect((screen.getByTestId('iniciar-corrida-lote') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('iniciar-corrida-lote'));
    expect(onIniciar).toHaveBeenCalledWith(LOTE, hoy, 'matutino');
  });

  const sesion: SesionLote = {
    sesionId: 'sesion-1',
    partidaId: 'partida-1',
    programacionId: 'programacion-1',
    actualizadoEnEsperado: '2026-11-27T10:00:00.000Z',
    fechaInicio: '2026-11-27T15:00:00.000Z',
    estadoSesion: 'activa',
    horasNetas: 0.5,
    operadorNombre: 'Jorge Ramírez',
    motivoPausa: null,
    pendienteActualizacionAvance: false,
  };

  const LOTE_EN_CURSO: LoteTablero = {
    ...LOTE,
    codigo: 'LAS05',
    estado: 'EN_PROCESO',
    sesion,
    limiteHoras: 0.58,
    items: [
      {
        id: null,
        partidaId: 'partida-1',
        codigoItem: 'IT01',
        cantidad: 100,
        descripcion: 'Placa base',
        materialCodigo: 'LAM-CR-14',
        materialNombre: 'Acero calibre 14',
        pendientePiezas: 60,
        hechoPiezas: 40,
        primeraPiezaPendiente: false,
      },
      {
        id: null,
        partidaId: 'partida-2',
        codigoItem: 'IT02',
        cantidad: 80,
        descripcion: 'Conector',
        primeraPiezaPendiente: true,
      },
    ],
  };

  it('muestra la sesión y acciones en un lote en curso, sin campos de inicio', () => {
    const onPausar = vi.fn();
    const onFinalizar = vi.fn();
    const onAbrirItem = vi.fn();
    render(createElement(DialogoDetalleLote, {
      lote: LOTE_EN_CURSO,
      puedeOperar: true,
      onIniciar: vi.fn(),
      onPausar,
      onFinalizar,
      onAbrirItem,
      onCerrar: vi.fn(),
    }));

    expect(screen.queryByTestId('fecha-inicio-corrida')).toBeNull();
    expect(screen.queryByTestId('iniciar-corrida-lote')).toBeNull();
    expect(screen.getByTestId('tiempo-acumulado-lote').textContent).toContain('30 min');
    expect(screen.getByTestId('contador-sesion-lote')).toBeTruthy();
    expect(screen.getByTestId('item-lote-partida-1').textContent).toContain('Placa base');
    expect(screen.getByTestId('material-lote-partida-1').textContent).toContain('LAM-CR-14');
    expect(screen.getByTestId('item-lote-partida-2').textContent).toContain('Primera pieza pendiente');

    fireEvent.click(screen.getByTestId('pausar-lote'));
    expect(onPausar).toHaveBeenCalledWith(LOTE_EN_CURSO, { motivoPausa: 'DUDA', piezasProducidas: 0 });

    fireEvent.click(screen.getByTestId('finalizar-lote'));
    expect(onFinalizar).toHaveBeenCalledWith(LOTE_EN_CURSO);

    fireEvent.click(screen.getByTestId('ver-item-lote-partida-1'));
    expect(onAbrirItem).toHaveBeenCalledWith('partida-1');
  });

  it('exige nota cuando el motivo de pausa la requiere', () => {
    const onPausar = vi.fn();
    render(createElement(DialogoDetalleLote, {
      lote: LOTE_EN_CURSO,
      puedeOperar: true,
      motivosPausa: [
        { codigo: 'DUDA', nombre: 'Duda', requiereNota: false, liberaMaquina: true },
        { codigo: 'OTRA', nombre: 'Otra causa', requiereNota: true, liberaMaquina: false },
      ],
      onIniciar: vi.fn(),
      onPausar,
      onCerrar: vi.fn(),
    }));

    const motivo = screen.getByLabelText('Motivo de pausa') as HTMLSelectElement;
    fireEvent.change(motivo, { target: { value: 'OTRA' } });
    const boton = screen.getByTestId('pausar-lote') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(screen.getByText('Este motivo exige una nota para pausar.')).toBeTruthy();

    fireEvent.change(screen.getByTestId('notas-pausa-lote'), { target: { value: 'Esperando material' } });
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    expect(onPausar).toHaveBeenCalledWith(LOTE_EN_CURSO, {
      motivoPausa: 'OTRA', piezasProducidas: 0, notas: 'Esperando material',
    });
  });

  it('no permite declarar más piezas al pausar de las que están pendientes en el ítem', () => {
    render(createElement(DialogoDetalleLote, {
      lote: LOTE_EN_CURSO,
      puedeOperar: true,
      onIniciar: vi.fn(),
      onPausar: vi.fn(),
      onCerrar: vi.fn(),
    }));

    const campo = screen.getByTestId('piezas-pausa-lote') as HTMLInputElement;
    const boton = screen.getByTestId('pausar-lote') as HTMLButtonElement;
    fireEvent.change(campo, { target: { value: '61' } });
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(boton.disabled).toBe(true);
    expect(screen.getByText('Indica un número entero de piezas que no supere el pendiente del ítem.')).toBeTruthy();
  });

  it('declara las piezas de esa pausa, no el acumulado de la partida', () => {
    const onPausar = vi.fn();
    render(createElement(DialogoDetalleLote, {
      lote: LOTE_EN_CURSO,
      puedeOperar: true,
      onIniciar: vi.fn(),
      onPausar,
      onCerrar: vi.fn(),
    }));

    fireEvent.change(screen.getByTestId('piezas-pausa-lote'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('pausar-lote'));
    expect(onPausar).toHaveBeenCalledWith(LOTE_EN_CURSO, {
      motivoPausa: 'DUDA', piezasProducidas: 5,
    });
  });

  it('reemplaza «Iniciar corrida» por el aviso de equipo ocupado', () => {
    const onIniciar = vi.fn();
    render(createElement(DialogoDetalleLote, {
      lote: LOTE,
      puedeOperar: true,
      mensajeEquipoOcupado: 'LASER-01 (LASER FIBRA) está ocupado por la orden O-1126_16 · IT01, operador alex.',
      onIniciar,
      onCerrar: vi.fn(),
    }));
    expect(screen.queryByTestId('iniciar-corrida-lote')).toBeNull();
    expect(screen.getByTestId('equipo-ocupado-lote').textContent).toContain('O-1126_16');
  });

  it('ofrece reanudar cuando el lote está pausado', () => {
    const onReanudar = vi.fn();
    render(createElement(DialogoDetalleLote, {
      lote: { ...LOTE_EN_CURSO, estado: 'PAUSADA', sesion: { ...sesion, estadoSesion: 'pausada' } },
      puedeOperar: true,
      onIniciar: vi.fn(),
      onReanudar,
      onCerrar: vi.fn(),
    }));

    fireEvent.click(screen.getByTestId('reanudar-lote'));
    expect(onReanudar).toHaveBeenCalledTimes(1);
  });
});
