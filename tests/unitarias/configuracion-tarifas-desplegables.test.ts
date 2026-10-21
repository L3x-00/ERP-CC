// @vitest-environment jsdom
// Configuración → Tarifas / TC: las estaciones y el tarifario del ruteo van
// plegados por defecto (cambio visual: la funcionalidad no se altera).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/modulos/configuracion/componentes/consulta-catalogos-base', () => ({
  CLAVE_CATALOGOS_BASE: ['catalogos-base', 'prueba'],
  consultarCatalogosBase: vi.fn(),
}));
vi.mock('@/modulos/catalogos/acciones/indice', () => ({
  guardarGrupoEquipoAccion: vi.fn(),
  guardarTarifaRecursoAccion: vi.fn(),
  listarTarifasRecursosAccion: vi.fn(async () => ({ exito: true, datos: [] })),
}));

import { consultarCatalogosBase } from '@/modulos/configuracion/componentes/consulta-catalogos-base';
import { EditorTarifasEstaciones } from '@/modulos/configuracion/componentes/editor-tarifas-estaciones';
import { SeccionTarifarioRuteo } from '@/modulos/configuracion/componentes/seccion-tarifario-ruteo';
import { CATALOGO_TARIFAS_DEFECTO } from '@/modulos/cotizador/servicios/catalogo-tarifas';

const GRUPO = {
  id: 'g1',
  codigo: 'LASER_FIBRA',
  nombre: 'Láser Fibra',
  activo: true,
  orden: 1,
  tarifaHora: null,
  tarifaMoneda: 'MXN',
  estacionTarifa: 'laser',
};
const GRUPO_SIN_TARIFA = { ...GRUPO, id: 'g2', codigo: 'EXTRA', nombre: 'Extra', estacionTarifa: null };

function montarTarifario(onIrACatalogosBase?: () => void) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: cliente },
      createElement(SeccionTarifarioRuteo, onIrACatalogosBase ? { onIrACatalogosBase } : {}),
    ),
  );
}

beforeEach(() => {
  vi.mocked(consultarCatalogosBase).mockResolvedValue({
    puedeEditar: true,
    gruposEquipo: [GRUPO, GRUPO_SIN_TARIFA],
    tarifasEstacion: { laser: 950, router: 550, doblado: 700, fabricacion: 400 },
  } as unknown as Awaited<ReturnType<typeof consultarCatalogosBase>>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EditorTarifasEstaciones — estaciones plegadas por defecto', () => {
  function montarEditor() {
    return render(
      createElement(EditorTarifasEstaciones, {
        valor: CATALOGO_TARIFAS_DEFECTO,
        onCambio: () => undefined,
      }),
    );
  }

  it('Corte láser, Router CNC, Dobladora y Fabricación nacen colapsadas con su resumen', () => {
    montarEditor();

    for (const nombre of ['Corte láser', 'Router CNC', 'Dobladora', 'Fabricación']) {
      const boton = screen.getByRole('button', { name: new RegExp(`^${nombre}`) });
      expect(boton.getAttribute('aria-expanded')).toBe('false');
    }
    expect(screen.getByRole('button', { name: /^Corte láser/ }).textContent).toMatch(/Máquina .*\/h · Preparación .*\/h/);
  });

  it('desplegar una estación no altera los valores: siguen montados y editables', () => {
    const cambios: unknown[] = [];
    render(
      createElement(EditorTarifasEstaciones, {
        valor: CATALOGO_TARIFAS_DEFECTO,
        onCambio: (nuevo) => cambios.push(nuevo),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^Router CNC/ }));
    const region = screen.getByRole('region', { name: /Router CNC/ });
    const campo = within(region).getByLabelText('Tarifa máquina por hora') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '777' } });

    expect(cambios).toHaveLength(1);
    expect((cambios[0] as typeof CATALOGO_TARIFAS_DEFECTO).router.maquinaHora).toBe(777);
  });
});

describe('SeccionTarifarioRuteo — plegado por defecto', () => {
  it('nace colapsado y avisa en el encabezado cuántos grupos no tienen tarifa', async () => {
    montarTarifario();

    const encabezado = await screen.findByRole('button', { name: /^Tarifario del ruteo/ });
    expect(encabezado.getAttribute('aria-expanded')).toBe('false');
    expect(await screen.findByTestId('tarifario-resumen-sin-tarifa')).toBeDefined();
    expect(encabezado.textContent).toContain('2 grupos de equipo');
    expect(encabezado.textContent).toContain('1 sin tarifa');
  });

  it('al desplegar muestra las tarifas por grupo y por máquina', async () => {
    montarTarifario();

    fireEvent.click(await screen.findByRole('button', { name: /^Tarifario del ruteo/ }));

    expect(await screen.findByTestId('tarifa-grupo-LASER_FIBRA')).toBeDefined();
    expect(screen.getByTestId('seccion-tarifas-recursos')).toBeDefined();
  });

  it('ofrece el atajo a Catálogos base solo cuando se entrega la acción', async () => {
    const ir = vi.fn();
    const { unmount } = montarTarifario(ir);
    fireEvent.click(await screen.findByRole('button', { name: /^Tarifario del ruteo/ }));

    fireEvent.click(await screen.findByRole('button', { name: 'Ir a Catálogos base' }));
    expect(ir).toHaveBeenCalledTimes(1);
    unmount();

    montarTarifario();
    fireEvent.click(await screen.findByRole('button', { name: /^Tarifario del ruteo/ }));
    await screen.findByTestId('tarifa-grupo-LASER_FIBRA');
    expect(screen.queryByRole('button', { name: 'Ir a Catálogos base' })).toBeNull();
  });
});
