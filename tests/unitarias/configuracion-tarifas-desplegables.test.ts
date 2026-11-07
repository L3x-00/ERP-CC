// @vitest-environment jsdom
// Configuración → Tarifas / TC: las estaciones y el tarifario del ruteo van
// plegados por defecto (cambio visual: la funcionalidad no se altera).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/modulos/configuracion/componentes/consulta-catalogos-base', () => ({
  CLAVE_CATALOGOS_BASE: ['catalogos-base', 'prueba'],
  consultarCatalogosBase: vi.fn(),
}));
vi.mock('@/modulos/catalogos/acciones/indice', () => ({
  alternarEquipoActivoAccion: vi.fn(async () => ({ exito: true, datos: null })),
  asignarProcesosAGrupoAccion: vi.fn(async () => ({ exito: true, datos: { procesos: 1 } })),
  crearEquipoAccion: vi.fn(async () => ({
    exito: true,
    datos: { id: 'equipo-1', codigo: 'LASER-01', nombre: 'Láser Fibra 01' },
  })),
  guardarGrupoEquipoAccion: vi.fn(async () => ({
    exito: true,
    datos: { id: 'g-new', codigo: 'GRUPO', nombre: 'Grupo nuevo' },
  })),
  guardarTarifaRecursoAccion: vi.fn(),
  listarTarifasRecursosAccion: vi.fn(async () => ({ exito: true, datos: [] })),
}));

import { consultarCatalogosBase } from '@/modulos/configuracion/componentes/consulta-catalogos-base';
import {
  asignarProcesosAGrupoAccion,
  crearEquipoAccion,
  guardarGrupoEquipoAccion,
} from '@/modulos/catalogos/acciones/indice';
import { EditorTarifasEstaciones } from '@/modulos/configuracion/componentes/editor-tarifas-estaciones';
import { SeccionTarifarioRuteo } from '@/modulos/configuracion/componentes/seccion-tarifario-ruteo';
import { CATALOGO_TARIFAS_DEFECTO } from '@/modulos/cotizador/servicios/catalogo-tarifas';

const GRUPO = {
  id: 'g1',
  codigo: 'LASER_FIBRA',
  nombre: 'Láser Fibra',
  activo: true,
  orden: 1,
  tarifaHora: 950,
  tarifaMoneda: 'MXN',
  estacionTarifa: 'laser',
};
const GRUPO_SIN_TARIFA = {
  ...GRUPO,
  id: 'g2',
  codigo: 'EXTRA',
  nombre: 'Extra',
  tarifaHora: null,
  estacionTarifa: null,
};

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
    procesos: [
      {
        id: 'p1',
        codigo: 'CORTE_LASER',
        nombre: 'Corte láser',
        prefijoCorrida: 'LAS',
        grupoEquipoId: null,
        grupoPlaneadoId: null,
        areaTrabajoCodigo: null,
        activo: true,
      },
    ],
    tarifasEstacion: {
      laser: 950,
      router: 550,
      doblado: 700,
      soldadura: 450,
      mano_obra: 350,
      acabado: 300,
    },
    tarifaRespaldo: 680,
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

describe('SeccionTarifasRecursos — alta guiada de un equipo', () => {
  async function abrirFormulario() {
    montarTarifario();
    fireEvent.click(await screen.findByRole('button', { name: /^Tarifario del ruteo/ }));
    fireEvent.click(await screen.findByTestId('alta-guiada-equipo-nuevo'));
    return screen.getByTestId('alta-guiada-equipo');
  }

  it('muestra la tarifa heredada del grupo antes de guardar', async () => {
    await abrirFormulario();

    fireEvent.change(screen.getByTestId('alta-guiada-equipo-grupo'), {
      target: { value: 'g1' },
    });

    expect(screen.getByTestId('alta-guiada-equipo-heredada').textContent).toContain(
      'Tarifa heredada: 950.00 MXN/h',
    );
  });

  it('avisa cuando el grupo elegido solo tiene tarifa de respaldo', async () => {
    await abrirFormulario();

    fireEvent.change(screen.getByTestId('alta-guiada-equipo-grupo'), {
      target: { value: 'g2' },
    });

    const heredada = screen.getByTestId('alta-guiada-equipo-heredada').textContent ?? '';
    expect(heredada).toContain('tarifa de respaldo');
    expect(heredada).toContain('680.00');
  });

  it('solo pide la tarifa propia cuando se activa la excepción', async () => {
    await abrirFormulario();

    expect(screen.queryByTestId('alta-guiada-equipo-tarifa')).toBeNull();
    fireEvent.click(screen.getByTestId('alta-guiada-equipo-propia'));
    expect(screen.getByTestId('alta-guiada-equipo-tarifa')).toBeDefined();
  });

  it('crea el equipo con grupo y sin tarifa propia por defecto', async () => {
    await abrirFormulario();

    fireEvent.change(screen.getByTestId('alta-guiada-equipo-codigo'), {
      target: { value: 'LASER-01' },
    });
    fireEvent.change(screen.getByTestId('alta-guiada-equipo-nombre'), {
      target: { value: 'Láser Fibra 01' },
    });
    fireEvent.change(screen.getByTestId('alta-guiada-equipo-grupo'), {
      target: { value: 'g1' },
    });
    fireEvent.click(screen.getByTestId('alta-guiada-equipo-guardar'));

    await waitFor(() =>
      expect(crearEquipoAccion).toHaveBeenCalledWith(
        expect.objectContaining({
          codigo: 'LASER-01',
          nombre: 'Láser Fibra 01',
          grupoEquipoId: 'g1',
          activo: true,
          tarifaPropiaActiva: false,
        }),
      ),
    );
    expect(crearEquipoAccion).toHaveBeenCalledWith(
      expect.not.objectContaining({ tarifaHora: expect.anything() }),
    );
  });
});

describe('SeccionTarifarioRuteo — alta guiada de un grupo con procesos', () => {
  it('guarda la tarifa estándar y vincula los procesos compatibles en el mismo flujo', async () => {
    montarTarifario();
    fireEvent.click(await screen.findByRole('button', { name: /^Tarifario del ruteo/ }));
    fireEvent.click(await screen.findByTestId('alta-guiada-grupo-nuevo'));

    fireEvent.change(screen.getByTestId('alta-guiada-grupo-codigo'), {
      target: { value: 'GRUPO_NUEVO' },
    });
    fireEvent.change(screen.getByTestId('alta-guiada-grupo-nombre'), {
      target: { value: 'Grupo nuevo' },
    });
    fireEvent.change(screen.getByTestId('alta-guiada-grupo-tarifa'), {
      target: { value: '800' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Corte láser' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear grupo con tarifa' }));

    await waitFor(() =>
      expect(guardarGrupoEquipoAccion).toHaveBeenCalledWith(
        expect.objectContaining({
          codigo: 'GRUPO_NUEVO',
          nombre: 'Grupo nuevo',
          tarifaHora: 800,
          tarifaMoneda: 'MXN',
          estacionTarifa: null,
        }),
      ),
    );
    await waitFor(() =>
      expect(asignarProcesosAGrupoAccion).toHaveBeenCalledWith({
        grupoId: 'g-new',
        procesoIds: ['p1'],
      }),
    );
  });
});
