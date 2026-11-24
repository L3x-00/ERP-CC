import { describe, expect, it } from 'vitest';
import { mensajeEquipoOcupado } from '@/modulos/produccion/tipos/espacio-operador';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';

const MENSAJE = 'LASER-01 (Láser fibra-01) está ocupado por la orden O-1126_12 · IT01 (Corte laser), operador Jorge Ramírez Ortega. No puedes cancelar el trabajo en curso de otro operador desde aquí: pide que lo cierren o lo pausen, o reprograma esta operación.';

function ocupante(): ProcesoEspacioOperador {
  return {
    id: 'proceso-ocupante',
    folioOrden: 'O-1126_12',
    folioSii: null,
    codigoPieza: 'IT01',
    procesoNombre: 'Corte laser',
    programacion: {
      id: 'programacion-1',
      fecha: '2026-11-23',
      turno: 'matutino',
      estadoPlaneacion: 'en_proceso',
      horasEstimadas: 0.25,
      recursoId: 'laser-01',
      recursoCodigo: 'LASER-01',
      recursoNombre: 'Láser fibra-01',
      actualizadoEn: '2026-11-23T10:00:00.000Z',
    },
    sesionActiva: {
      id: 'sesion-1',
      operadorId: 'jorge',
      operadorNombre: 'Jorge Ramírez Ortega',
      estadoSesion: 'activa',
      fechaInicio: '2026-11-23T10:00:00.000Z',
      fechaFin: null,
      pendienteActualizacionAvance: false,
      sesionInvalida: false,
      recursoLiberado: false,
      recursoLiberadoPor: null,
      recursoLiberadoEn: null,
      recursoLiberadoReclamosCount: null,
      piezasProducidas: 0,
      horasBrutas: 0,
      horasNetas: 0,
      motivoPausa: null,
      motivoPausaNota: null,
      motivoExceso: null,
      motivoExcesoDetalle: null,
      notas: null,
      verificacionCompleta: true,
    },
  } as unknown as ProcesoEspacioOperador;
}

describe('mensajeEquipoOcupado — aviso antes del checklist (obs. operador)', () => {
  it('compone el mismo mensaje que la RPC con los datos del ocupante', () => {
    expect(mensajeEquipoOcupado(ocupante(), 'otro-operador')).toBe(MENSAJE);
  });

  it('prefiere el folio SII cuando existe', () => {
    const proceso = ocupante();
    proceso.folioSii = 'O-SII-1126_12';
    expect(mensajeEquipoOcupado(proceso, 'otro-operador'))
      .toContain('la orden O-SII-1126_12 · IT01');
  });

  it('no avisa si la sesión activa es del propio operador', () => {
    expect(mensajeEquipoOcupado(ocupante(), 'jorge')).toBeNull();
  });

  it('no avisa si no hay sesión activa ni recurso asignado', () => {
    const sinSesion = ocupante();
    sinSesion.sesionActiva = null;
    expect(mensajeEquipoOcupado(sinSesion, 'otro-operador')).toBeNull();

    const sinRecurso = ocupante();
    sinRecurso.programacion = null;
    expect(mensajeEquipoOcupado(sinRecurso, 'otro-operador')).toBeNull();
  });
});
