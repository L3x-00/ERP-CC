// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { VistaKanbanOperador } from '@/modulos/produccion/componentes/vista-kanban-operador';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';

afterEach(cleanup);

function proceso(
  sobrescribir: Partial<ProcesoEspacioOperador> = {},
): ProcesoEspacioOperador {
  return {
    id: 'partida-1:meta-1',
    ordenId: 'orden-1',
    folioOrden: 'OF-001171',
    folioSii: null,
    estadoOrden: 'programada',
    estadoSii: 'PLANIFICADA',
    prioridad: 'normal',
    clienteNombre: 'Aceros y Estructuras Tijuana',
    fechaCompromiso: '2026-10-26',
    fechaOperativa: '2026-10-26',
    notas: null,
    partidaId: 'partida-1',
    codigoPieza: 'IT01',
    descripcion: 'Refuerzo',
    cantidadSolicitada: 80,
    cantidadProducida: 0,
    unidadMedida: 'pieza',
    esExterno: false,
    proveedorExterno: null,
    material: null,
    areaCodigo: 'taller',
    areaNombre: 'Sin área',
    areaMacro: null,
    areaColor: null,
    metaProcesoId: 'meta-1',
    procesoNombre: 'Fabricación',
    secuencia: 1,
    metaPiezas: 80,
    hechoPiezas: 0,
    pendientePiezas: 80,
    porcentaje: 0,
    esFinal: true,
    piezasDisponibles: null,
    procesoPrevioNombre: null,
    horasEstimadas: 0.25,
    programacion: null,
    reclamo: null,
    reclamadoPorMi: false,
    nombreReclamante: null,
    sesionActiva: null,
    ultimaSesion: null,
    sesiones: [],
    procesosRuteo: [],
    archivos: [],
    columna: 'bandeja',
    urgencia: 'normal',
    etiquetas: [],
    puedeIniciar: false,
    puedeReanudar: false,
    motivoNoInicia: null,
    ...sobrescribir,
  };
}

describe('VistaKanbanOperador agrupada por orden', () => {
  it('pinta una tarjeta por orden y conserva cada ítem y proceso con sus acciones', () => {
    render(createElement(VistaKanbanOperador, {
      procesos: [
        proceso({
          id: 'partida-1:meta-1', partidaId: 'partida-1', codigoPieza: 'IT01',
          secuencia: 1, procesoNombre: 'Corte',
        }),
        proceso({
          id: 'partida-1:meta-2', partidaId: 'partida-1', codigoPieza: 'IT01',
          secuencia: 2, procesoNombre: 'Doblez',
        }),
        proceso({
          id: 'partida-2:meta-1', partidaId: 'partida-2', codigoPieza: 'IT02',
          descripcion: 'Tapa maquinada',
        }),
        proceso({
          id: 'partida-3:meta-1', ordenId: 'orden-2', folioOrden: 'O-1026_09',
          partidaId: 'partida-3', codigoPieza: 'IT03',
        }),
      ],
      hoy: '2026-10-26',
      soloLectura: false,
      onAbrir: vi.fn(),
      onAbrirOrden: vi.fn(),
    }));

    expect(screen.getAllByTestId(/^orden-operador-/u)).toHaveLength(2);
    const tarjetaOrden = screen.getByTestId('orden-operador-orden-1');
    expect(tarjetaOrden.textContent).toContain('OF-001171');
    expect(tarjetaOrden.textContent).toContain('Aceros y Estructuras Tijuana');
    expect(tarjetaOrden.textContent).toContain('1. Corte → 2. Doblez');

    expect(tarjetaOrden.querySelectorAll('[data-testid^="proceso-"]')).toHaveLength(2);
    expect(tarjetaOrden.querySelector('[data-testid^="abrir-orden-operador-"]')).toBeTruthy();
    expect(tarjetaOrden.querySelector('[data-testid^="abrir-detalle-"]')).toBeTruthy();
    expect(tarjetaOrden.querySelector('[data-testid^="accion-"]')).toBeNull();
  });
});
