// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { VistaCargaEquipos } from '@/modulos/produccion/componentes/vista-carga-equipos';
import type {
  CargaCapacidadDiaria,
  RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';

afterEach(cleanup);

const HOY = '2026-11-18'; // miércoles; la semana va del lunes 16 al domingo 22.

const RECURSOS: RecursoPlaneacion[] = [
  {
    id: 'recurso-cnc',
    codigo: 'CNC-01',
    nombre: 'CNC principal',
    area: 'sheet_metal',
    activo: true,
    creadoEn: '2026-01-01T00:00:00.000Z',
    actualizadoEn: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'recurso-laser',
    codigo: 'LASER-01',
    nombre: 'Láser de fibra',
    area: 'sheet_metal',
    activo: true,
    creadoEn: '2026-01-01T00:00:00.000Z',
    actualizadoEn: '2026-01-01T00:00:00.000Z',
  },
];

function carga(
  recursoId: string,
  fecha: string,
  programadas: number,
  capacidad = 8,
  reales = 0,
): CargaCapacidadDiaria {
  return {
    recursoId,
    area: 'sheet_metal',
    fechaProgramada: fecha,
    turno: 'jornada',
    horasCapacidad: capacidad,
    horasProgramadas: programadas,
    horasReales: reales,
    horasExceso: Math.max(0, programadas - capacidad),
    horasDisponibles: Math.max(0, capacidad - programadas),
    porcentajeOcupacion: capacidad === 0 ? 0 : (programadas / capacidad) * 100,
    sobrecargado: programadas > capacidad,
  };
}

const CARGAS: CargaCapacidadDiaria[] = [
  carga('recurso-cnc', '2026-11-16', 8),
  carga('recurso-cnc', '2026-11-17', 2),
  carga('recurso-cnc', '2026-11-18', 4),
  carga('recurso-cnc', '2026-11-21', 0, 4),
  carga('recurso-laser', '2026-11-18', 6),
  carga('recurso-laser', '2026-11-21', 0, 4),
];

function renderizar() {
  return render(
    createElement(VistaCargaEquipos, {
      cargas: CARGAS,
      recursos: RECURSOS,
      hoy: HOY,
    }),
  );
}

describe('VistaCargaEquipos', () => {
  it('abre en modo Semana con la matriz de equipos y la semana en curso', () => {
    renderizar();

    expect(screen.getByRole('heading', { name: 'Carga de equipos' })).toBeTruthy();
    expect(screen.getByText(/Semana del lunes 16 de noviembre al domingo 22 de noviembre/))
      .toBeTruthy();
    expect(
      (screen.getByTestId('carga-modo-semana') as HTMLButtonElement).getAttribute('aria-pressed'),
    ).toBe('true');

    const resumen = screen.getByTestId('resumen-carga-semanal');
    expect(within(resumen).getByRole('heading', { name: 'Carga semanal' })).toBeTruthy();
    expect(resumen.textContent).toContain('CNC-01 · CNC principal');
    expect(resumen.textContent).toContain('LASER-01 · Láser de fibra');
    // Columnas de lunes a sábado; el domingo sin carga no se pinta.
    expect(within(resumen).getByText('lun 16 nov')).toBeTruthy();
    expect(within(resumen).getByText('sáb 21 nov')).toBeTruthy();
    expect(within(resumen).queryByText('dom 22 nov')).toBeNull();
  });

  it('en modo Día muestra sólo el día elegido y su capacidad libre', () => {
    renderizar();

    fireEvent.click(screen.getByTestId('carga-modo-dia'));

    const resumen = screen.getByTestId('resumen-carga-semanal');
    expect(within(resumen).getByRole('heading', { name: 'Carga del día' })).toBeTruthy();
    expect(within(resumen).getAllByText('mié 18 nov')).toHaveLength(1);
    expect(within(resumen).queryByText('lun 16 nov')).toBeNull();
    expect(within(resumen).getByTestId('libre-CNC-01').textContent).toBe('4 h');
    expect(within(resumen).getByTestId('libre-LASER-01').textContent).toBe('2 h');

    fireEvent.click(screen.getByTestId('carga-dia-2026-11-16'));

    const lunes = screen.getByTestId('resumen-carga-semanal');
    expect(within(lunes).getAllByText('lun 16 nov')).toHaveLength(1);
    expect(within(lunes).getByTestId('libre-CNC-01').textContent).toBe('0 h');
    expect(within(lunes).queryByText('LASER-01 · Láser de fibra')).not.toBeNull();
  });

  it('muestra un aviso si la lectura de capacidad falló y conserva el panel', () => {
    render(createElement(VistaCargaEquipos, {
      cargas: [],
      recursos: [],
      hoy: HOY,
      error: true,
    }));

    expect(screen.getByRole('heading', { name: 'Carga de equipos' })).toBeTruthy();
    expect(screen.getByTestId('carga-equipos-error').textContent)
      .toContain('No se pudo leer la carga de equipos');
    expect(screen.queryByTestId('resumen-carga-semanal')).toBeNull();
    expect(screen.queryByTestId('carga-dia-cerrado')).toBeNull();
  });

  it('marca el día de hoy y explica que el domingo no se labora', () => {
    renderizar();

    fireEvent.click(screen.getByTestId('carga-modo-dia'));

    const hoy = screen.getByTestId(`carga-dia-${HOY}`);
    expect(hoy.getAttribute('aria-current')).toBe('date');
    expect(hoy.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('carga-dia-2026-11-22'));

    expect(screen.getByTestId('carga-dia-cerrado').textContent).toContain(
      'La empresa no labora el domingo',
    );
    expect(screen.queryByTestId('resumen-carga-semanal')).toBeNull();
  });

  it('el chip del equipo en uso cambia de color y abre el detalle del área', () => {
    render(
      createElement(VistaCargaEquipos, {
        cargas: CARGAS,
        recursos: RECURSOS,
        hoy: HOY,
        procesos: [procesoEnMarcha()],
      }),
    );

    const enUso = screen.getByTestId('estado-LASER-01');
    expect(enUso.textContent).toBe('En uso');
    expect(enUso.className).toContain('advertencia');
    expect(screen.getByTestId('estado-CNC-01').textContent).toBe('Libre');

    fireEvent.click(enUso);

    const dialogo = screen.getByTestId('detalle-carga-area');
    expect(dialogo.textContent).toContain('LASER-01 · Láser de fibra');
    expect(dialogo.textContent).toContain('Ocupado ahora');
    expect(dialogo.textContent).toContain('O-1126_09');
    expect(dialogo.textContent).toContain('Ana Operadora');
    expect(dialogo.textContent).toContain('Corte laser');
    expect(dialogo.textContent).toContain('100/350');
    expect(within(dialogo).getByTestId('contador-detalle-area')).toBeTruthy();
  });

  it('el detalle lista los procesos trabajados hoy en el área', () => {
    render(
      createElement(VistaCargaEquipos, {
        cargas: CARGAS,
        recursos: RECURSOS,
        hoy: HOY,
        procesos: [procesoConTrabajo()],
      }),
    );

    fireEvent.click(screen.getByTestId('estado-LASER-01'));

    const dialogo = screen.getByTestId('detalle-carga-area');
    expect(dialogo.textContent).toContain('Procesos trabajados hoy');
    expect(dialogo.textContent).toContain('2 h · 40 piezas');

    const trabajo = within(dialogo).getByTestId('trabajo-area-sesion-cerrada');
    expect(trabajo.textContent).toContain('O-1126_08');
    expect(trabajo.textContent).toContain('Corte laser');
    expect(trabajo.textContent).toContain('Bruno Operador');
    expect(trabajo.textContent).toContain('40');
  });

  it('un equipo libre abre su detalle sin proceso en marcha', () => {
    renderizar();

    fireEvent.click(screen.getByTestId('estado-CNC-01'));

    const dialogo = screen.getByTestId('detalle-carga-area');
    expect(dialogo.textContent).toContain('Libre ahora');
    expect(screen.getByTestId('detalle-carga-area-sin-proceso')).toBeTruthy();
    expect(screen.getByTestId('detalle-carga-area-sin-trabajo')).toBeTruthy();
  });

  it('las horas ya trabajadas descuentan el saldo libre del equipo', () => {
    render(
      createElement(VistaCargaEquipos, {
        cargas: [carga('recurso-laser', HOY, 0, 8, 6)],
        recursos: [RECURSOS[1]],
        hoy: HOY,
      }),
    );

    fireEvent.click(screen.getByTestId('carga-modo-dia'));

    // 8 h de capacidad − 0 pendientes − 6 h ya trabajadas = 2 h libres.
    expect(screen.getByTestId('libre-LASER-01').textContent).toBe('2 h');
  });
});

function procesoEnMarcha(): ProcesoEspacioOperador {
  return {
    id: 'proceso-laser',
    folioOrden: 'O-1126_09',
    clienteNombre: 'FORESTAM',
    codigoPieza: 'IT01',
    procesoNombre: 'Corte laser',
    unidadMedida: 'unidad',
    metaPiezas: 350,
    hechoPiezas: 100,
    fechaCompromiso: '2026-11-23',
    horasEstimadas: 3,
    programacion: {
      id: 'programacion-laser',
      fecha: '2026-11-18',
      turno: 'matutino',
      estadoPlaneacion: 'en_proceso',
      horasEstimadas: 3,
      recursoId: 'recurso-laser',
      recursoCodigo: 'LASER-01',
      recursoNombre: 'Láser de fibra',
      actualizadoEn: '2026-11-18T15:00:00.000Z',
    },
    sesionActiva: {
      id: 'sesion-laser',
      operadorId: 'operador-ana',
      operadorNombre: 'Ana Operadora',
      estadoSesion: 'activa',
      fechaInicio: '2026-11-18T16:25:00.000Z',
      fechaFin: null,
      pendienteActualizacionAvance: false,
      sesionInvalida: false,
      recursoLiberado: false,
      piezasProducidas: 10,
      horasNetas: 0,
      motivoPausa: null,
      motivoPausaNota: null,
      notas: null,
      verificacionCompleta: false,
    },
    sesiones: [],
  } as unknown as ProcesoEspacioOperador;
}

/** Proceso del mismo equipo con una sesión ya cerrada durante el día. */
function procesoConTrabajo(): ProcesoEspacioOperador {
  return {
    id: 'proceso-laser-cerrado',
    folioOrden: 'O-1126_08',
    clienteNombre: 'FORESTAM',
    codigoPieza: 'IT01',
    procesoNombre: 'Corte laser',
    unidadMedida: 'unidad',
    metaPiezas: 350,
    hechoPiezas: 40,
    fechaCompromiso: '2026-11-23',
    horasEstimadas: 3,
    programacion: {
      id: 'programacion-laser-cerrada',
      fecha: '2026-11-18',
      turno: 'matutino',
      estadoPlaneacion: 'terminada',
      horasEstimadas: 3,
      recursoId: 'recurso-laser',
      recursoCodigo: 'LASER-01',
      recursoNombre: 'Láser de fibra',
      actualizadoEn: '2026-11-18T20:00:00.000Z',
    },
    sesionActiva: null,
    sesiones: [
      {
        id: 'sesion-cerrada',
        operadorId: 'operador-bruno',
        operadorNombre: 'Bruno Operador',
        estadoSesion: 'finalizada',
        fechaInicio: '2026-11-18T18:00:00.000Z',
        fechaFin: '2026-11-18T20:00:00.000Z',
        pendienteActualizacionAvance: false,
        sesionInvalida: false,
        recursoLiberado: false,
        piezasProducidas: 40,
        horasNetas: 2,
        motivoPausa: null,
        motivoPausaNota: null,
        notas: null,
        verificacionCompleta: true,
      },
    ],
  } as unknown as ProcesoEspacioOperador;
}
