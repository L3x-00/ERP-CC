// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';

import { TarjetaOrdenMisProcesos } from '@/modulos/produccion/componentes/tarjeta-orden-mis-procesos';
import type { MiProceso } from '@/modulos/produccion/utilidades/mi-panel-operador';
import type {
  GrupoOrdenEspacioOperador,
  ProcesoEspacioOperador,
} from '@/modulos/produccion/tipos/espacio-operador';

afterEach(cleanup);

function proceso(id: string, nombre: string): ProcesoEspacioOperador {
  return {
    id,
    ordenId: 'orden-1',
    partidaId: `partida-${id}`,
    folioOrden: 'OP-001',
    codigoPieza: 'IT01',
    descripcion: 'Soporte',
    procesoNombre: nombre,
    areaNombre: 'Corte láser',
    areaMacro: null,
    columna: 'bandeja',
    porcentaje: 40,
    reclamo: null,
    reclamadoPorMi: false,
    piezasDisponibles: null,
    procesoPrevioNombre: null,
    puedeIniciar: false,
    puedeReanudar: false,
    motivoNoInicia: null,
    sesionActiva: null,
    programacion: null,
    hechoPiezas: 2,
    metaPiezas: 5,
    pendientePiezas: 3,
  } as unknown as ProcesoEspacioOperador;
}

const GRUPO = {
  ordenId: 'orden-1',
  folioOrden: 'OP-001',
  folioSii: null,
  clienteNombre: 'Aceros y Estructuras Tijuana',
  fechaCompromiso: '2026-11-20',
  urgencia: 'normal',
  prioridad: 'normal',
  notas: null,
  columna: 'bandeja',
  items: [],
  procesos: [],
  horas: 2,
  cantidadProducida: 2,
  cantidadSolicitada: 10,
  porcentaje: 20,
} as unknown as GrupoOrdenEspacioOperador;

describe('Mis procesos · una tarjeta por orden (punto 10)', () => {
  it('muestra la orden una sola vez y conserva cada proceso con sus métricas', () => {
    const procesos: MiProceso[] = [
      { proceso: proceso('p1', 'Corte'), estado: 'en_proceso', horasTrabajadas: 1.5, piezasRegistradas: 2 },
      { proceso: proceso('p2', 'Doblez'), estado: 'pendiente', horasTrabajadas: 0, piezasRegistradas: 0 },
    ];

    const onGestionar = vi.fn();
    render(createElement(TarjetaOrdenMisProcesos, {
      grupo: GRUPO,
      procesos,
      hoy: '2026-11-14',
      procesando: null,
      onIniciar: vi.fn(),
      onReanudar: vi.fn(),
      onLiberar: vi.fn(),
      onGestionar,
    }));

    const tarjeta = screen.getByTestId('mis-procesos-orden-orden-1');
    expect(within(tarjeta).getAllByText('OP-001')).toHaveLength(1);
    expect(within(tarjeta).getByTestId('mi-proceso-p1')).toBeTruthy();
    expect(within(tarjeta).getByTestId('mi-proceso-p2')).toBeTruthy();
    expect(within(tarjeta).getAllByRole('progressbar')).toHaveLength(2);
    expect(within(tarjeta).getByText('Corte')).toBeTruthy();
    expect(within(tarjeta).getByText('Doblez')).toBeTruthy();
  });

  it('abre la gestión del proceso concreto desde su fila', () => {
    const procesos: MiProceso[] = [
      { proceso: proceso('p1', 'Corte'), estado: 'pendiente', horasTrabajadas: 0, piezasRegistradas: 0 },
    ];
    const onGestionar = vi.fn();

    render(createElement(TarjetaOrdenMisProcesos, {
      grupo: GRUPO,
      procesos,
      hoy: '2026-11-14',
      procesando: null,
      onIniciar: vi.fn(),
      onReanudar: vi.fn(),
      onLiberar: vi.fn(),
      onGestionar,
    }));

    within(screen.getByTestId('mi-proceso-p1'))
      .getByRole('button', { name: 'Gestionar proceso' })
      .click();
    expect(onGestionar).toHaveBeenCalledOnce();
    expect(onGestionar.mock.calls[0]?.[0]).toMatchObject({ id: 'p1' });
  });

  it('muestra el cronómetro en vivo del proceso iniciado y lo pinta en rojo al excederse', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T14:30:00.000Z'));
    const enProceso = {
      ...proceso('p4', 'Doblado CNC'),
      columna: 'en_proceso',
      reclamadoPorMi: true,
      horasEstimadas: 3,
      sesionActiva: {
        id: 'sesion-1',
        operadorId: 'operador-1',
        operadorNombre: 'Operador',
        estadoSesion: 'activa',
        fechaInicio: '2026-11-19T10:00:00.000Z',
        fechaFin: null,
        pendienteActualizacionAvance: false,
        sesionInvalida: false,
        recursoLiberado: false,
        piezasProducidas: 0,
        horasNetas: 0,
        motivoPausa: null,
        motivoPausaNota: null,
        notas: null,
        verificacionCompleta: true,
      },
    } as unknown as ProcesoEspacioOperador;

    render(createElement(TarjetaOrdenMisProcesos, {
      grupo: GRUPO,
      procesos: [{ proceso: enProceso, estado: 'en_proceso', horasTrabajadas: 4.5, piezasRegistradas: 2 }],
      hoy: '2026-11-19',
      procesando: null,
      onIniciar: vi.fn(),
      onReanudar: vi.fn(),
      onLiberar: vi.fn(),
      onGestionar: vi.fn(),
    }));

    const contador = screen.getByTestId('contador-sesion-p4');
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(contador.textContent).toContain('04:30:00');
    expect(contador.getAttribute('data-estado')).toBe('excedido');
    vi.useRealTimers();
  });

  it('no muestra cronómetro cuando el proceso no tiene sesión iniciada', () => {
    render(createElement(TarjetaOrdenMisProcesos, {
      grupo: GRUPO,
      procesos: [{ proceso: proceso('p5', 'Corte'), estado: 'pendiente', horasTrabajadas: 0, piezasRegistradas: 0 }],
      hoy: '2026-11-19',
      procesando: null,
      onIniciar: vi.fn(),
      onReanudar: vi.fn(),
      onLiberar: vi.fn(),
      onGestionar: vi.fn(),
    }));

    expect(screen.queryByTestId('contador-sesion-p5')).toBeNull();
  });

  it('ofrece registrar el consumo cuando la producción está completa y el reclamo sigue activo', () => {
    const completo = {
      ...proceso('p3', 'Router'),
      columna: 'lista',
      hechoPiezas: 40,
      metaPiezas: 40,
      reclamadoPorMi: true,
      pendienteActualizacionAvance: false,
    } as unknown as ProcesoEspacioOperador;

    render(createElement(TarjetaOrdenMisProcesos, {
      grupo: GRUPO,
      procesos: [{ proceso: completo, estado: 'terminado', horasTrabajadas: 4, piezasRegistradas: 40 }],
      hoy: '2026-11-18',
      procesando: null,
      onIniciar: vi.fn(),
      onReanudar: vi.fn(),
      onLiberar: vi.fn(),
      onGestionar: vi.fn(),
    }));

    const boton = screen.getByTestId('gestionar-proceso-p3') as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    expect(boton.textContent).toContain('Registrar consumo pendiente');
  });

  it('mantiene deshabilitado el proceso completado que otro operador reclamó', () => {
    const ajeno = {
      ...proceso('p6', 'Router'),
      columna: 'lista',
      hechoPiezas: 40,
      metaPiezas: 40,
      reclamadoPorMi: false,
      reclamanteNombre: 'Otro operador',
    } as unknown as ProcesoEspacioOperador;

    render(createElement(TarjetaOrdenMisProcesos, {
      grupo: GRUPO,
      procesos: [{ proceso: ajeno, estado: 'terminado', horasTrabajadas: 4, piezasRegistradas: 40 }],
      hoy: '2026-11-18',
      procesando: null,
      onIniciar: vi.fn(),
      onReanudar: vi.fn(),
      onLiberar: vi.fn(),
      onGestionar: vi.fn(),
    }));

    const boton = screen.getByTestId('gestionar-proceso-p6') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.textContent).toContain('Proceso completado');
  });
});
