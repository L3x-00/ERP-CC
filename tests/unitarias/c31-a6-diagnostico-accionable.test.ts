// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GUIAS_DIAGNOSTICO, type DiagnosticoOrdenItem } from '@/modulos/produccion/servicios/diagnostico-servicio';

const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: items, isPending: false, isError: false, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { PanelSaludOrden } from '@/modulos/produccion/componentes/panel-salud-orden';

let items: DiagnosticoOrdenItem[] = [];

afterEach(() => {
  cleanup();
  push.mockReset();
  items = [];
});

function item(codigo: string, sesionId: string | null = null): DiagnosticoOrdenItem {
  const guia = GUIAS_DIAGNOSTICO[codigo];
  return {
    codigo,
    severidad: 'media',
    partidaId: 'partida-1',
    sesionId,
    programacionId: 'programacion-1',
    detalle: `Detalle de ${codigo}`,
    valorActual: null,
    valorEsperado: null,
    ...guia,
    destino: '/produccion?ordenId=orden-1',
  };
}

describe('C31/A6 — diagnóstico accionable', () => {
  it('las 11 incidencias tienen guía con texto concreto', () => {
    expect(Object.keys(GUIAS_DIAGNOSTICO)).toHaveLength(11);
    for (const guia of Object.values(GUIAS_DIAGNOSTICO)) {
      expect(guia.textoAccion.length).toBeGreaterThan(5);
      expect(guia.accionSugerida).toBeTruthy();
    }
  });

  it('un gerente con gestionar_produccion ve cerrar la pausa huérfana', () => {
    items = [item('pausa_huerfana', 'sesion-1')];
    render(createElement(PanelSaludOrden, {
      ordenId: 'orden-1', esAdmin: false, puedeGestionarProduccion: true,
    }));
    expect(screen.getByTestId('accion-cerrar-pausa-sesion-1').textContent)
      .toContain('Cerrar pausa pendiente');
  });

  it('sin permiso se explica quién debe actuar, sin botón inalcanzable', () => {
    items = [item('pausa_huerfana', 'sesion-1')];
    render(createElement(PanelSaludOrden, { ordenId: 'orden-1' }));
    expect(screen.queryByTestId('accion-cerrar-pausa-sesion-1')).toBeNull();
    expect(screen.getByTestId('sin-permiso-pausa_huerfana').textContent)
      .toContain('permiso de Producción');
  });

  it('la operación bloqueada lleva a la salida de piso con permiso de Planeación', () => {
    items = [item('programacion_bloqueada_sin_sesion')];
    render(createElement(PanelSaludOrden, {
      ordenId: 'orden-1', puedeGestionarPlaneacion: true,
    }));
    const boton = screen.getByTestId('accion-reabrir_operacion-programacion_bloqueada_sin_sesion');
    boton.click();
    expect(push).toHaveBeenCalledWith('/produccion?ordenId=orden-1');
  });

  it('todas las incidencias muestran una salida o una explicación', () => {
    items = Object.keys(GUIAS_DIAGNOSTICO).map((codigo, indice) => item(codigo, `sesion-${indice}`));
    render(createElement(PanelSaludOrden, {
      ordenId: 'orden-1',
      puedeGestionarProduccion: true,
      puedeGestionarPlaneacion: true,
    }));
    expect(screen.getAllByRole('listitem')).toHaveLength(11);
    const salidas = document.querySelectorAll(
      '[data-testid^="accion-"], [data-testid^="sin-permiso-"]',
    );
    expect(salidas.length).toBeGreaterThanOrEqual(11);
  });
});
