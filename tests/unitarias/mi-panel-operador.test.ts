
import { describe, expect, it } from 'vitest';
import {
  agruparMisProcesosPorOrden,
  obtenerMisProcesos,
  resumirMiPanel,
} from '@/modulos/produccion/utilidades/mi-panel-operador';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';

const OPERADOR = 'operador-1';
const OTRO = 'operador-2';

function crearProceso(
  id: string,
  opciones: {
    reclamante?: string;
    columna?: ProcesoEspacioOperador['columna'];
    partidaId?: string;
    piezasDisponibles?: number | null;
    sesiones?: Array<{
      operadorId: string;
      estadoSesion: 'activa' | 'pausada' | 'finalizada';
      horasNetas: number;
    }>;
  } = {},
): ProcesoEspacioOperador {
  const sesiones = (opciones.sesiones ?? []).map((sesion, indice) => ({
    id: `${id}-sesion-${indice}`,
    operadorId: sesion.operadorId,
    estadoSesion: sesion.estadoSesion,
    horasNetas: sesion.horasNetas,
    piezasProducidas: 3,
    fechaInicio: `2026-10-${String(20 + indice).padStart(2, '0')}T08:00:00Z`,
  }));

  return {
    id,
    partidaId: opciones.partidaId ?? id,
    columna: opciones.columna ?? 'bandeja',
    piezasDisponibles: opciones.piezasDisponibles ?? null,
    reclamo: opciones.reclamante
      ? {
          id: `${id}-reclamo`,
          operadorId: opciones.reclamante,
          estado: 'activo',
          horasEstimadas: 3,
          fecha: '2026-10-26',
        }
      : null,
    sesiones,
  } as unknown as ProcesoEspacioOperador;
}

describe('Mi panel de operador - cálculos', () => {
  it('excluye procesos sin reclamos ni sesiones del operador', () => {
    const procesos = [
      crearProceso('propio', { reclamante: OPERADOR }),
      crearProceso('ajeno', { reclamante: OTRO }),
      crearProceso('libre'),
    ];

    const resultado = obtenerMisProcesos(procesos, OPERADOR);

    expect(resultado.map((item) => item.proceso.id)).toEqual(['propio']);
  });

  it('incluye el proceso siguiente con piezas disponibles de una partida ya trabajada', () => {
    const procesos = [
      crearProceso('corte', {
        partidaId: 'partida-1',
        columna: 'en_proceso',
        sesiones: [{
          operadorId: OPERADOR,
          estadoSesion: 'finalizada',
          horasNetas: 2,
        }],
      }),
      crearProceso('doblado', { partidaId: 'partida-1', piezasDisponibles: 50 }),
      crearProceso('otra-partida', { partidaId: 'partida-2', piezasDisponibles: 50 }),
    ];

    expect(obtenerMisProcesos(procesos, OPERADOR).map((item) => item.proceso.id))
      .toEqual(['corte', 'doblado']);
  });

  it('no incluye el proceso siguiente cuando no hay piezas disponibles', () => {
    const procesos = [
      crearProceso('corte', {
        partidaId: 'partida-1',
        sesiones: [{
          operadorId: OPERADOR,
          estadoSesion: 'finalizada',
          horasNetas: 2,
        }],
      }),
      crearProceso('doblado', { partidaId: 'partida-1', piezasDisponibles: 0 }),
    ];

    expect(obtenerMisProcesos(procesos, OPERADOR).map((item) => item.proceso.id))
      .toEqual(['corte']);
  });

  it('reconoce procesos personales en ejecución', () => {
    const proceso = crearProceso('activo', {
      reclamante: OPERADOR,
      columna: 'en_proceso',
      sesiones: [{
        operadorId: OPERADOR,
        estadoSesion: 'activa',
        horasNetas: 0,
      }],
    });

    expect(obtenerMisProcesos([proceso], OPERADOR)[0]?.estado)
      .toBe('en_proceso');
  });

  it('identifica procesos terminados con sesión propia finalizada', () => {
    const proceso = crearProceso('terminado', {
      columna: 'lista',
      sesiones: [{
        operadorId: OPERADOR,
        estadoSesion: 'finalizada',
        horasNetas: 2.5,
      }],
    });

    const resultado = obtenerMisProcesos([proceso], OPERADOR);

    expect(resultado[0]?.estado).toBe('terminado');
    expect(resultado[0]?.horasTrabajadas).toBe(2.5);
  });

  it('suma únicamente las horas del operador autenticado', () => {
    const proceso = crearProceso('compartido', {
      reclamante: OPERADOR,
      sesiones: [
        {
          operadorId: OPERADOR,
          estadoSesion: 'finalizada',
          horasNetas: 2,
        },
        {
          operadorId: OTRO,
          estadoSesion: 'finalizada',
          horasNetas: 5,
        },
      ],
    });

    const misProcesos = obtenerMisProcesos([proceso], OPERADOR);
    const resumen = resumirMiPanel(misProcesos, OPERADOR);

    expect(resumen.reclamados).toBe(1);
    expect(resumen.horasReservadas).toBe(3);
    expect(resumen.horasTrabajadas).toBe(2);
  });

  it('clasifica sesiones pausadas y procesos pendientes', () => {
    const procesos = [
      crearProceso('pausa', {
        reclamante: OPERADOR,
        sesiones: [{
          operadorId: OPERADOR,
          estadoSesion: 'pausada',
          horasNetas: 1,
        }],
      }),
      crearProceso('pendiente', { reclamante: OPERADOR }),
    ];

    const resultado = resumirMiPanel(
      obtenerMisProcesos(procesos, OPERADOR),
      OPERADOR,
    );

    expect(resultado.pausados).toBe(1);
    expect(resultado.pendientes).toBe(1);
  });

  it('punto 10: agrupa los procesos personales en una sola orden', () => {
    const conOrden = (
      id: string,
      ordenId: string,
      partidaId: string,
      codigoPieza: string,
    ): ProcesoEspacioOperador => ({
      ...crearProceso(id, { reclamante: OPERADOR, partidaId }),
      ordenId,
      folioOrden: ordenId === 'orden-1' ? 'OP-001' : 'OP-002',
      folioSii: null,
      clienteNombre: 'Cliente de prueba',
      fechaCompromiso: '2026-10-26',
      urgencia: 'normal',
      prioridad: 'normal',
      notas: null,
      codigoPieza,
      descripcion: null,
      unidadMedida: 'pieza',
      cantidadProducida: 0,
      cantidadSolicitada: 5,
      material: null,
      secuencia: 1,
      horasEstimadas: 1,
    } as unknown as ProcesoEspacioOperador);

    const misProcesos = obtenerMisProcesos([
      conOrden('p1', 'orden-1', 'partida-1', 'IT01'),
      conOrden('p2', 'orden-1', 'partida-2', 'IT02'),
      conOrden('p3', 'orden-2', 'partida-3', 'IT03'),
    ], OPERADOR);

    const ordenes = agruparMisProcesosPorOrden(misProcesos);

    expect(ordenes).toHaveLength(2);
    const primera = ordenes.find(({ grupo }) => grupo.ordenId === 'orden-1');
    expect(primera?.grupo.folioOrden).toBe('OP-001');
    expect(primera?.procesos.map(({ proceso }) => proceso.id))
      .toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(primera?.procesos).toHaveLength(2);
  });
});
