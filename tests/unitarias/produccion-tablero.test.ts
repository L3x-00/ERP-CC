import { describe, expect, it } from 'vitest';
import type { Orden } from '@/modulos/ordenes/tipos/ordenes';
import type { PartidaTableroProduccion } from '@/modulos/produccion/servicios/indice';
import { obtenerEstadoKanbanProduccion } from '@/modulos/produccion/servicios/indice';
import type { SesionTrabajo } from '@/modulos/produccion/tipos/indice';

const orden: Orden = {
  id: '11111111-1111-4111-8111-111111111111', folio: 'OP-001001',
  clienteId: '22222222-2222-4222-8222-222222222222', cotizacionId: null, estado: 'programada',
  prioridad: 'normal', fechaCompromiso: '2026-08-14T18:00:00.000Z', fechaInicio: null, fechaFin: null,
  motivoCancelacion: null, creadoEn: '2026-08-14T12:00:00.000Z', actualizadoEn: '2026-08-14T12:00:00.000Z',
};

function crearPartida(cantidadProducida: number, cantidadEntregada: number): PartidaTableroProduccion {
  return {
    id: '33333333-3333-4333-8333-333333333333', ordenId: orden.id, codigoPieza: 'PIEZA-PRD',
    descripcion: null, cantidadSolicitada: 5, cantidadProducida, cantidadScrap: 0, unidadMedida: 'pieza',
    materialId: null, tiempoEstimadoMinutos: 60, tiempoRealMinutos: 0, maquinaAsignada: null,
    operadorAsignadoId: null, creadoEn: orden.creadoEn, actualizadoEn: orden.actualizadoEn,
    programaciones: [], cantidadEntregada,
  };
}

function crearSesion(estadoSesion: SesionTrabajo['estadoSesion']): SesionTrabajo {
  return {
    id: '44444444-4444-4444-8444-444444444444', ordenId: orden.id,
    partidaId: '33333333-3333-4333-8333-333333333333',
    programacionId: '55555555-5555-4555-8555-555555555555',
    operadorId: '66666666-6666-4666-8666-666666666666',
    fechaInicio: orden.creadoEn, fechaFin: estadoSesion === 'activa' ? null : orden.actualizadoEn,
    horasBrutas: 0, horasNetas: 0, piezasProducidas: 0, motivoPausa: null, notas: null,
    estadoSesion, creadoEn: orden.creadoEn, actualizadoEn: orden.actualizadoEn,
  };
}

describe('proyección Kanban de Producción', () => {
  it('prioriza entrega total y lista sin persistir estados de interfaz', () => {
    expect(obtenerEstadoKanbanProduccion(orden, [crearPartida(5, 5)], [])).toBe('entregada');
    expect(obtenerEstadoKanbanProduccion(orden, [crearPartida(5, 2)], [])).toBe('lista');
  });

  it('deriva sesión activa y pausa de los registros auditables', () => {
    expect(obtenerEstadoKanbanProduccion(orden, [crearPartida(1, 0)], [crearSesion('activa')])).toBe('en_proceso');
    expect(obtenerEstadoKanbanProduccion(orden, [crearPartida(1, 0)], [crearSesion('pausada')])).toBe('pausada');
  });
});
