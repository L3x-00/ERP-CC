// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ResumenAdministrativoOrden } from '@/modulos/produccion/componentes/resumen-administrativo-orden';
import type { CierreSupervisor } from '@/modulos/produccion/componentes/panel-operador-produccion';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/tablero-produccion-servicio';

type ResultadoPausaPrueba = { exito: true } | { exito: false; error: string };

const ORDEN = {
  id: 'orden-1',
  folio: 'O-1126_11',
  clienteNombre: 'Carso',
  prioridad: 'normal',
  fechaCompromiso: '2026-11-21T18:00:00.000Z',
  fechaCompromisoComercial: '2026-11-21',
  estadoKanban: 'en_proceso',
  partidas: [{
    id: 'partida-1',
    cantidadSolicitada: 50,
    cantidadProducida: 20,
    cantidadEntregada: 5,
    cantidadScrap: 1,
    operadorAsignadoId: 'operador-1',
  }],
  sesiones: [],
  notasEntrega: [],
} as unknown as OrdenTableroProduccion;

const SESION = {
  id: 'sesion-1',
  operadorId: 'operador-1',
  fechaInicio: new Date(Date.now() - 90 * 60_000).toISOString(),
  piezasProducidas: 4,
  horasNetas: 1.5,
  estadoSesion: 'activa',
};

const RESPONSABLES = { 'operador-1': 'Jorge Ramírez Ortega' };

afterEach(cleanup);

function renderResumen(opciones: {
  esAdmin?: boolean;
  conSesion?: boolean;
  sesionPausada?: boolean;
  onPausar?: (datos: CierreSupervisor) => Promise<ResultadoPausaPrueba>;
} = {}) {
  const onPausar = opciones.onPausar
    ?? vi.fn(async (datos: CierreSupervisor): Promise<ResultadoPausaPrueba> => {
      void datos;
      return { exito: true };
    });
  const sesion = opciones.sesionPausada
    ? { ...SESION, estadoSesion: 'pausada' }
    : SESION;
  const orden = opciones.conSesion
    ? { ...ORDEN, sesiones: [sesion] } as unknown as OrdenTableroProduccion
    : ORDEN;
  render(createElement(ResumenAdministrativoOrden, {
    orden,
    sesionActivaId: opciones.conSesion ? 'sesion-1' : null,
    responsables: RESPONSABLES,
    esAdmin: opciones.esAdmin ?? false,
    procesando: false,
    onPausarAdministrativa: onPausar,
  }));
  return onPausar;
}

describe('ResumenAdministrativoOrden — cierre del módulo de Producción', () => {
  it('centraliza los datos administrativos esenciales', () => {
    renderResumen();

    const resumen = screen.getByTestId('resumen-administrativo-orden');
    expect(resumen.textContent).toContain('Carso');
    expect(resumen.textContent).toContain('Responsable');
    expect(resumen.textContent).toContain('Jorge Ramírez Ortega');
    expect(screen.getByTestId('resumen-avance-piezas').textContent).toBe('20/50 piezas');
    expect(resumen.textContent).toContain('Horas registradas');
  });

  it('muestra quién opera, desde cuándo y cuánto lleva cuando hay sesión', () => {
    renderResumen({ conSesion: true });

    expect(screen.getByTestId('resumen-operando-ahora').textContent).toBe('Jorge Ramírez Ortega');
    expect(screen.getByTestId('resumen-inicio-sesion').textContent).toBeTruthy();
    expect(screen.getByTestId('resumen-tiempo-sesion').textContent).toContain('1 h');
    expect(screen.getByTestId('resumen-piezas-sesion').textContent).toBe('4');
  });

  it('ofrece la pausa administrativa solo al administrador con sesión activa', () => {
    const onPausar = renderResumen({ conSesion: true, esAdmin: true });

    const nota = screen.getByTestId('pausa-administrativa-nota');
    const boton = screen.getByTestId('pausar-administrativamente') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.change(nota, { target: { value: 'Esperando autorización del cliente' } });
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);

    expect(onPausar).toHaveBeenCalledWith({
      sesionId: 'sesion-1',
      piezasProducidas: 4,
      estadoDestino: 'pausada',
      motivoPausa: 'PAUSA_ADMIN',
      notas: 'Esperando autorización del cliente',
    });
  });

  it('no muestra la pausa a un perfil sin permiso de administrador', () => {
    renderResumen({ conSesion: true, esAdmin: false });
    expect(screen.queryByTestId('pausar-administrativamente')).toBeNull();
  });

  it('oculta la sesión y la pausa cuando la sesión ya fue pausada', () => {
    renderResumen({ conSesion: true, sesionPausada: true, esAdmin: true });
    expect(screen.queryByTestId('resumen-operando-ahora')).toBeNull();
    expect(screen.queryByTestId('pausar-administrativamente')).toBeNull();
  });
});
