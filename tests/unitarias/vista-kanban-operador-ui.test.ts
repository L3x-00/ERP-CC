// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { VistaKanbanOperador } from '@/modulos/produccion/componentes/vista-kanban-operador';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';
import type { LoteTablero } from '@/modulos/produccion/tipos/indice';

afterEach(cleanup);

function reclamoDe(operadorId = 'operador-1') {
  return {
    id: 'reclamo-1',
    ordenId: 'orden-1',
    partidaId: 'partida-1',
    metaProcesoId: 'meta-1',
    programacionId: null,
    operadorId,
    fecha: '2026-10-26',
    turno: 'matutino',
    horasEstimadas: 0.25,
    estado: 'activo',
    creadoEn: '2026-10-26T08:00:00.000Z',
    actualizadoEn: '2026-10-26T08:00:00.000Z',
  };
}

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
    procesoCompleto: false,
    esFinal: true,
    piezasDisponibles: null,
    procesoPrevioNombre: null,
    horasEstimadas: 0.25,
    horasAcumuladas: 0,
    programacion: null,
    reclamo: null,
    reclamadoPorMi: false,
    nombreReclamante: null,
    sesionActiva: null,
    ultimaSesion: null,
    sesiones: [],
    avisoSupervision: null,
    motivoBloqueo: null,
    pendienteActualizacionAvance: false,
    procesosRuteo: [],
    archivos: [],
    comentariosOrden: [],
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

  it('muestra la operación pausada en su columna con motivo, operador y continuación', () => {
    const sesionBase = {
      operadorId: 'operador-1',
      operadorNombre: 'Ana Operadora',
      fechaInicio: '2026-10-26T08:00:00.000Z',
      fechaFin: '2026-10-26T16:00:00.000Z',
      pendienteActualizacionAvance: false,
      sesionInvalida: false,
      recursoLiberado: false,
      recursoLiberadoPor: null,
      recursoLiberadoEn: null,
      recursoLiberadoReclamosCount: null,
      piezasProducidas: 0,
      horasBrutas: 9,
      horasNetas: 8,
      motivoPausa: 'FIN_JORNADA',
      motivoPausaNota: 'Pausa automática al cumplir la jornada del turno.',
      motivoExceso: null,
      motivoExcesoDetalle: null,
      notas: null,
      verificacionCompleta: true,
    };
    render(createElement(VistaKanbanOperador, {
      procesos: [
        proceso({
          id: 'partida-1:meta-1', partidaId: 'partida-1', codigoPieza: 'IT01',
          secuencia: 1, procesoNombre: 'Corte', columna: 'en_proceso',
          sesionActiva: {
            ...sesionBase,
            id: 'sesion-activa',
            estadoSesion: 'activa',
            fechaFin: null,
            motivoPausa: null,
            motivoPausaNota: null,
            motivoExceso: null,
            motivoExcesoDetalle: null,
          },
        }),
        proceso({
          id: 'partida-1:meta-2', partidaId: 'partida-1', codigoPieza: 'IT01',
          secuencia: 2, procesoNombre: 'Doblez', columna: 'pausada',
          ultimaSesion: {
            ...sesionBase,
            id: 'sesion-pausada',
            estadoSesion: 'pausada',
          },
          reclamo: reclamoDe(),
          reclamadoPorMi: true,
          nombreReclamante: 'Ana Operadora',
          puedeReanudar: true,
        }),
      ],
      hoy: '2026-10-26',
      soloLectura: false,
      onAbrir: vi.fn(),
      onAbrirOrden: vi.fn(),
      onReanudar: vi.fn(),
      onCerrarPausa: vi.fn(),
    }));

    const columnaPausada = screen.getByTestId('columna-pausada');
    expect(columnaPausada.textContent).toContain('Fin de jornada');
    expect(columnaPausada.textContent).toContain('Ana Operadora');
    expect(columnaPausada.textContent).toContain('Continuar sesión');
    expect(columnaPausada.textContent).toContain('Cerrar pausa');
    expect(columnaPausada.querySelector('[data-testid="cerrar-pausa-proceso-partida-1:meta-2"]')).toBeTruthy();

    const columnaEnProceso = screen.getByTestId('columna-en_proceso');
    expect(columnaEnProceso.textContent).toContain('1. Corte');
    expect(columnaEnProceso.textContent).not.toContain('Fin de jornada');
  });

  it('C20: pinta la columna Actualizar avance y no ofrece continuar la pausa', () => {
    const abrir = vi.fn();
    render(createElement(VistaKanbanOperador, {
      procesos: [proceso({
        id: 'partida-1:meta-1',
        columna: 'actualizar_avance',
        pendienteActualizacionAvance: true,
        reclamo: reclamoDe(),
        reclamadoPorMi: true,
        nombreReclamante: 'Ana Operadora',
        ultimaSesion: {
          id: 'sesion-pausada',
          operadorId: 'operador-1',
          operadorNombre: 'Ana Operadora',
          estadoSesion: 'pausada',
          fechaInicio: '2026-10-26T08:00:00.000Z',
          fechaFin: '2026-10-26T17:00:00.000Z',
          pendienteActualizacionAvance: true,
          sesionInvalida: false,
          recursoLiberado: false,
          recursoLiberadoPor: null,
          recursoLiberadoEn: null,
          recursoLiberadoReclamosCount: null,
          piezasProducidas: 0,
          horasBrutas: 9,
          horasNetas: 9,
          motivoPausa: 'FIN_JORNADA',
          motivoPausaNota: null,
          motivoExceso: null,
          motivoExcesoDetalle: null,
          notas: null,
          verificacionCompleta: true,
        },
      })],
      hoy: '2026-10-26',
      soloLectura: false,
      onAbrir: abrir,
      onAbrirOrden: vi.fn(),
      onReanudar: vi.fn(),
      onCerrarPausa: vi.fn(),
      onActualizarAvance: abrir,
    }));

    const columna = screen.getByTestId('columna-actualizar_avance');
    expect(columna.textContent).toContain('Actualizar avance');
    expect(columna.textContent).toContain('avance pendiente');
    expect(columna.querySelector('[data-testid="actualizar-avance-proceso-partida-1:meta-1"]')).toBeTruthy();
    expect(columna.querySelector('[data-testid="reanudar-proceso-partida-1:meta-1"]')).toBeNull();
    expect(columna.textContent).not.toContain('Cerrar pausa');
  });

  it('no ofrece acciones de pausa en un proceso tomado por otro operador', () => {
    render(createElement(VistaKanbanOperador, {
      procesos: [proceso({
        id: 'partida-1:meta-1',
        columna: 'actualizar_avance',
        pendienteActualizacionAvance: true,
        reclamo: reclamoDe('operador-otro'),
        reclamadoPorMi: false,
        nombreReclamante: 'Ana Operadora',
        ultimaSesion: {
          id: 'sesion-pausada',
          operadorId: 'operador-otro',
          operadorNombre: 'Ana Operadora',
          estadoSesion: 'pausada',
          fechaInicio: '2026-10-26T08:00:00.000Z',
          fechaFin: '2026-10-26T17:00:00.000Z',
          pendienteActualizacionAvance: true,
          sesionInvalida: false,
          recursoLiberado: false,
          recursoLiberadoPor: null,
          recursoLiberadoEn: null,
          recursoLiberadoReclamosCount: null,
          piezasProducidas: 0,
          horasBrutas: 9,
          horasNetas: 9,
          motivoPausa: 'FIN_JORNADA',
          motivoPausaNota: null,
          motivoExceso: null,
          motivoExcesoDetalle: null,
          notas: null,
          verificacionCompleta: true,
        },
      })],
      hoy: '2026-10-26',
      soloLectura: false,
      onAbrir: vi.fn(),
      onAbrirOrden: vi.fn(),
      onReanudar: vi.fn(),
      onCerrarPausa: vi.fn(),
      onActualizarAvance: vi.fn(),
    }));

    const columna = screen.getByTestId('columna-actualizar_avance');
    expect(columna.textContent).toContain('Tomado por Ana Operadora');
    expect(columna.textContent).toContain('avance pendiente');
    expect(columna.querySelector('[data-testid="actualizar-avance-proceso-partida-1:meta-1"]')).toBeNull();
    expect(columna.querySelector('[data-testid="reanudar-proceso-partida-1:meta-1"]')).toBeNull();
    expect(columna.querySelector('[data-testid="cerrar-pausa-proceso-partida-1:meta-1"]')).toBeNull();
    expect(columna.textContent).not.toContain('Continuar sesión');
    expect(columna.textContent).not.toContain('Cerrar pausa');
  });

  it('muestra el lote recién creado en Bandeja hasta que se inicia', () => {
    const lote: LoteTablero = {
      id: 'corrida-1',
      codigo: 'LAS02',
      estado: 'PLANIFICADA',
      ordenId: 'orden-1',
      folioOrden: 'OF-001171',
      clienteNombre: 'Manufacturing Group',
      procesoNombre: 'CORTE LASER',
      areaCodigo: 'LASER',
      areaCodigos: ['LASER'],
      cantidadPlanificada: 180,
      items: [
        { id: null, partidaId: 'partida-1', codigoItem: 'IT01', cantidad: 60 },
        { id: null, partidaId: 'partida-2', codigoItem: 'IT02', cantidad: 120 },
      ],
      creadoEn: '2026-11-26T00:09:51.000Z',
    };

    render(createElement(VistaKanbanOperador, {
      procesos: [],
      lotes: [lote],
      hoy: '2026-11-26',
      soloLectura: false,
      onAbrir: vi.fn(),
      onAbrirOrden: vi.fn(),
    }));

    const columna = screen.getByTestId('columna-bandeja');
    const tarjeta = columna.querySelector('[data-testid="tarjeta-lote-piso-corrida-1"]');
    expect(tarjeta).not.toBeNull();
    expect(tarjeta!.textContent).toContain('LAS02');
    expect(tarjeta!.textContent).toContain('Planificada');
    expect(tarjeta!.textContent).toContain('IT01');
    expect(tarjeta!.textContent).toContain('IT02');
    expect(tarjeta!.textContent).toContain('180');
    expect(screen.getByTestId('columna-en_proceso').querySelector('[data-testid="tarjeta-lote-piso-corrida-1"]')).toBeNull();
  });

  it('mueve el lote a En proceso cuando la corrida ya se inició', () => {
    render(createElement(VistaKanbanOperador, {
      procesos: [],
      lotes: [{
        id: 'corrida-2',
        codigo: 'LAS03',
        estado: 'EN_PROCESO',
        ordenId: 'orden-1',
        folioOrden: 'OF-001171',
        clienteNombre: 'Manufacturing Group',
        procesoNombre: 'CORTE LASER',
        areaCodigo: 'LASER',
        areaCodigos: ['LASER'],
        cantidadPlanificada: 60,
        items: [{ id: null, partidaId: 'partida-1', codigoItem: 'IT01', cantidad: 60 }],
        creadoEn: '2026-11-26T00:09:51.000Z',
      }],
      hoy: '2026-11-26',
      soloLectura: false,
      onAbrir: vi.fn(),
      onAbrirOrden: vi.fn(),
    }));

    expect(screen.getByTestId('columna-en_proceso').querySelector('[data-testid="tarjeta-lote-piso-corrida-2"]')).not.toBeNull();
    expect(screen.getByTestId('columna-bandeja').querySelector('[data-testid="tarjeta-lote-piso-corrida-2"]')).toBeNull();
  });

  it('deja la tarjeta completa en la columna principal y compacta la réplica en la secundaria', () => {
    render(createElement(VistaKanbanOperador, {
      procesos: [
        proceso({
          id: 'p1', partidaId: 'partida-1', codigoPieza: 'IT01',
          secuencia: 1, procesoNombre: 'Corte', columna: 'en_proceso',
        }),
        proceso({
          id: 'p2', partidaId: 'partida-2', codigoPieza: 'IT02',
          secuencia: 1, procesoNombre: 'Corte', columna: 'pausada',
        }),
      ],
      hoy: '2026-11-26',
      soloLectura: false,
      onAbrir: vi.fn(),
      onAbrirOrden: vi.fn(),
    }));

    const principal = screen.getByTestId('columna-en_proceso')
      .querySelector('[data-testid="orden-operador-orden-1"]');
    expect(principal).not.toBeNull();
    expect(principal!.getAttribute('data-vista')).toBeNull();

    const secundaria = screen.getByTestId('columna-pausada')
      .querySelector('[data-testid="orden-operador-orden-1"]');
    expect(secundaria!.getAttribute('data-vista')).toBe('compacta');
    expect(secundaria!.querySelector('[data-testid="abrir-detalle-p2"]')).not.toBeNull();
  });

  it('etiqueta el ítem con el lote en que se trabajó aunque ya esté terminado', () => {
    render(createElement(VistaKanbanOperador, {
      procesos: [proceso({
        id: 'p1', partidaId: 'partida-1', codigoPieza: 'IT01', secuencia: 1,
        procesoNombre: 'Corte', corridaReferencia: {
          id: 'corrida-1', codigo: 'LAS02', estado: 'COMPLETADA',
        },
      })],
      hoy: '2026-11-26',
      soloLectura: false,
      onAbrir: vi.fn(),
      onAbrirOrden: vi.fn(),
    }));

    const etiqueta = screen.getByTestId('corrida-item-p1');
    expect(etiqueta.textContent).toContain('Trabajado en lote LAS02');
  });
});
