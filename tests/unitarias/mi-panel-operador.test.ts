
import { describe, expect, it } from 'vitest';
import {
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
    columna: opciones.columna ?? 'bandeja',
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
});
