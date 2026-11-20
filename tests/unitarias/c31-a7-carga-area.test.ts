import { describe, expect, it } from 'vitest';

import { resumirAreaCarga } from '@/modulos/produccion/utilidades/carga-area';
import type { ProcesoEspacioOperador, SesionProceso } from '@/modulos/produccion/tipos/espacio-operador';

const RECURSO = 'recurso-1';
const HOY = '2026-11-19';
const AYER = '2026-11-18';

function sesion(id: string, inicio: string, estado: 'activa' | 'pausada' | 'finalizada', horas = 2): SesionProceso {
  return {
    id,
    operadorId: 'operador-1',
    operadorNombre: 'Operador',
    estadoSesion: estado,
    fechaInicio: inicio,
    fechaFin: estado === 'finalizada' ? inicio : null,
    pendienteActualizacionAvance: false,
    sesionInvalida: false,
    recursoLiberado: false,
    piezasProducidas: estado === 'finalizada' ? 4 : 0,
    horasNetas: horas,
    motivoPausa: null,
    motivoPausaNota: null,
    notas: null,
    verificacionCompleta: true,
  } as SesionProceso;
}

function proceso(sesiones: SesionProceso[], activa: SesionProceso | null): ProcesoEspacioOperador {
  return {
    id: 'proceso-1',
    programacion: { recursoId: RECURSO },
    sesionActiva: activa,
    sesiones,
  } as unknown as ProcesoEspacioOperador;
}

describe('C31/A7 — detalle de carga por área', () => {
  it('no dice «Ocupado ahora» al consultar un día pasado', () => {
    const activa = sesion('s-activa', '2026-11-19T20:00:00Z', 'activa');
    const resultado = resumirAreaCarga([proceso([activa], activa)], RECURSO, AYER, HOY);
    expect(resultado.procesoActual).toBeNull();
  });

  it('sí dice «Ocupado ahora» cuando la sesión es de hoy', () => {
    const activa = sesion('s-activa', '2026-11-19T20:00:00Z', 'activa');
    const resultado = resumirAreaCarga([proceso([activa], activa)], RECURSO, HOY, HOY);
    expect(resultado.procesoActual?.id).toBe('proceso-1');
  });

  it('no cuenta una pausa como sesión cerrada', () => {
    const pausada = sesion('s-pausada', '2026-11-19T17:00:00Z', 'pausada', 1);
    const finalizada = sesion('s-final', '2026-11-19T18:00:00Z', 'finalizada', 2);
    const resultado = resumirAreaCarga(
      [proceso([pausada, finalizada], null)], RECURSO, HOY, HOY,
    );
    expect(resultado.sesionesCerradas.map((item) => item.sesion.id)).toEqual(['s-final']);
    expect(resultado.horasTrabajadas).toBe(2);
  });

  it('filtra las sesiones cerradas por el día consultado', () => {
    const ayer = sesion('s-ayer', '2026-11-18T20:00:00Z', 'finalizada', 3);
    const hoy = sesion('s-hoy', '2026-11-19T20:00:00Z', 'finalizada', 1);
    const resultado = resumirAreaCarga([proceso([ayer, hoy], null)], RECURSO, HOY, HOY);
    expect(resultado.sesionesCerradas.map((item) => item.sesion.id)).toEqual(['s-hoy']);
    expect(resultado.horasTrabajadas).toBe(1);
  });
});
