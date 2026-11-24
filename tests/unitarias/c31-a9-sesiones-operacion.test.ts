import { describe, expect, it } from 'vitest';

import { horasAcumuladasSesiones, sesionesDeOperacion } from '@/modulos/produccion/servicios/espacio-operador-servicio';
import { derivarColumnaProceso, accionPrincipal } from '@/modulos/produccion/tipos/espacio-operador';
import type { SesionTrabajo } from '@/modulos/produccion/tipos/produccion';
import type { ProgramacionArea } from '@/modulos/planeacion/tipos/indice';

function sesion(id: string, programacionId: string): SesionTrabajo {
  return { id, programacionId, estadoSesion: 'activa' } as unknown as SesionTrabajo;
}

function programacion(id: string): ProgramacionArea {
  return { id } as unknown as ProgramacionArea;
}

describe('C31/A9 — sesiones por operación', () => {
  it('una operación con meta propia no hereda la sesión activa de otra operación', () => {
    const corte = programacion('programacion-corte');
    const porProgramacion = new Map<string, readonly SesionTrabajo[]>([
      ['programacion-corte', [sesion('sesion-corte', 'programacion-corte')]],
    ]);
    const sesionesPartida = [sesion('sesion-corte', 'programacion-corte')];

    expect(sesionesDeOperacion(corte, porProgramacion, sesionesPartida, 'meta-corte', 2))
      .toHaveLength(1);
    // Doblado no tiene programación propia: con dos metas no debe tomar la
    // sesión de Corte aunque ambas estén en la misma partida.
    expect(sesionesDeOperacion(
      null, porProgramacion, sesionesPartida, 'meta-doblado', 2,
      new Map([['meta-corte', 'programacion-corte']]),
    )).toEqual([]);
  });

  it('una operación multiproceso no hereda sesiones ajenas pero conserva las huérfanas', () => {
    const sesionesPartida = [
      sesion('sesion-corte', 'programacion-corte'),
      sesion('sesion-huerfana', 'programacion-dada-de-baja'),
    ];
    const porMeta = new Map([['meta-corte', 'programacion-corte']]);
    const resultado = sesionesDeOperacion(null, new Map(), sesionesPartida, 'meta-doblado', 2, porMeta);
    expect(resultado.map((item) => item.id)).toEqual(['sesion-huerfana']);
  });

  it('la partida con una sola operación sí conserva el fallback a sus sesiones', () => {
    const sesionesPartida = [sesion('sesion-unica', 'programacion-unica')];
    expect(sesionesDeOperacion(null, new Map(), sesionesPartida, null, 1))
      .toEqual(sesionesPartida);
  });
});

describe('C31/A15 — tiempo acumulado de la operación', () => {
  it('suma las horas netas válidas y descarta las inválidas y las liberadas', () => {
    const sesiones = [
      { horasNetas: 0.55, sesionInvalida: false, recursoLiberado: false },
      { horasNetas: 0.36, sesionInvalida: false, recursoLiberado: false },
      { horasNetas: 5, sesionInvalida: true, recursoLiberado: false },
      { horasNetas: 3, sesionInvalida: false, recursoLiberado: true },
    ] as never;

    expect(horasAcumuladasSesiones(sesiones)).toBeCloseTo(0.91, 2);
  });

  it('devuelve cero cuando no hay sesiones que contar', () => {
    expect(horasAcumuladasSesiones([])).toBe(0);
  });
});

describe('C31/A9 — derivación visible de la operación posterior', () => {
  it('Doblado deja de aparecer "En proceso" y sigue bloqueado por piezas', () => {
    const sesionCorte = sesion('sesion-corte', 'programacion-corte');
    const sesionesDoblado = sesionesDeOperacion(
      null,
      new Map(),
      [sesionCorte],
      'meta-doblado',
      2,
      new Map([['meta-corte', 'programacion-corte']]),
    );
    const columnaDoblado = derivarColumnaProceso({
      estadoOrden: 'en_proceso',
      estadoSii: 'EN_PRODUCCION',
      procesoCompleto: false,
      sesionActiva: (sesionesDoblado.find((item) => item.estadoSesion === 'activa') ?? null) !== null,
      sesionPausada: false,
      pendienteActualizacionAvance: false,
      programacionEstado: null,
    });
    expect(columnaDoblado).not.toBe('en_proceso');
    const proceso = {
      columna: columnaDoblado,
      reclamo: null,
      reclamadoPorMi: false,
      sesionActiva: null,
      puedeIniciar: false,
      puedeReanudar: false,
      motivoNoInicia: 'Sin piezas del proceso anterior',
      motivoBloqueo: null,
    } as never;
    expect(accionPrincipal(proceso).tipo).toBe('iniciar');
    expect(proceso).toMatchObject({ puedeIniciar: false });
  });
});
