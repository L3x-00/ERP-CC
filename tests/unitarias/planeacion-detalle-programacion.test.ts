import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@/compartido/tipos/supabase';
import { obtenerDetalleProgramacionServicio } from '@/modulos/planeacion/servicios/indice';

const PROGRAMACION_ID = '11111111-1111-4111-8111-111111111111';
const ORDEN_ID = '22222222-2222-4222-8222-222222222222';
const RECURSO_ID = '33333333-3333-4333-8333-333333333333';
const RECURSO_ANTERIOR_ID = '44444444-4444-4444-8444-444444444444';
const GRUPO_ID = '55555555-5555-4555-8555-555555555555';
const ACTOR_INICIAL_ID = '66666666-6666-4666-8666-666666666666';
const ACTOR_CAMBIO_ID = '77777777-7777-4777-8777-777777777777';

type Respuesta = { data: unknown; error: { message: string } | null };

function crearClienteDetalle(opciones: { sinProgramacion?: boolean } = {}) {
  const llamadas: Array<{ tabla: string; filtros: Record<string, unknown> }> = [];
  const responder = (tabla: string, filtros: Record<string, unknown>): Respuesta => {
    if (tabla === 'programacion_areas') {
      return {
        data: opciones.sinProgramacion
          ? null
          : { orden_id: ORDEN_ID, recurso_id: RECURSO_ID, horas_estimadas: 8 },
        error: null,
      };
    }
    if (tabla === 'sesiones_trabajo') {
      return { data: [{ horas_netas: 3 }, { horas_netas: 1, recurso_liberado: true }], error: null };
    }
    if (tabla === 'orden_eventos_cambio') {
      if (filtros.tipo === 'programacion_inicial') {
        return {
          data: {
            actor_id: ACTOR_INICIAL_ID,
            creado_en: '2026-10-15T10:00:00.000Z',
            motivo: 'Programación inicial',
            tipo: 'programacion_inicial',
            detalle: { nuevo: { programacion_id: PROGRAMACION_ID } },
          },
          error: null,
        };
      }
      return {
        data: [{
          actor_id: ACTOR_CAMBIO_ID,
          creado_en: '2026-10-16T10:00:00.000Z',
          motivo: 'Cambio por mantenimiento',
          tipo: 'reprogramacion_operativa',
          detalle: {
            programacion_id: PROGRAMACION_ID,
            anterior: {
              recurso_id: RECURSO_ANTERIOR_ID,
              fecha_programada: '2026-10-16',
              turno: 'matutino',
              horas_estimadas: 8,
              orden_prioridad: 2,
            },
            nuevo: {
              recurso_id: RECURSO_ID,
              fecha_programada: '2026-10-17',
              turno: 'vespertino',
              horas_estimadas: 8,
              orden_prioridad: 1,
            },
          },
        }],
        error: null,
      };
    }
    if (tabla === 'usuarios') {
      return {
        data: [
          { id: ACTOR_INICIAL_ID, nombre_completo: 'Ana Planeación' },
          { id: ACTOR_CAMBIO_ID, nombre_completo: 'Bruno Planeación' },
        ],
        error: null,
      };
    }
    if (tabla === 'grupos_equipo') {
      return { data: { codigo: 'LAS', nombre: 'Láser' }, error: null };
    }
    if (tabla === 'recursos_planeacion' && Array.isArray(filtros.ids)) {
      return {
        data: [
          { id: RECURSO_ID, codigo: 'LAS-02', nombre: 'Láser 2' },
          { id: RECURSO_ANTERIOR_ID, codigo: 'LAS-01', nombre: 'Láser 1' },
        ],
        error: null,
      };
    }
    if (tabla === 'recursos_planeacion') {
      return {
        data: { codigo: 'LAS-02', nombre: 'Láser 2', grupo_equipo_id: GRUPO_ID },
        error: null,
      };
    }
    return { data: null, error: { message: `Tabla inesperada: ${tabla}` } };
  };

  const from = vi.fn((tabla: string) => {
    const filtros: Record<string, unknown> = {};
    llamadas.push({ tabla, filtros });
    const consulta = {
      select: vi.fn(() => consulta),
      eq: vi.fn((campo: string, valor: unknown) => {
        filtros[campo] = valor;
        return consulta;
      }),
      in: vi.fn((_campo: string, valores: string[]) => {
        filtros.ids = valores;
        return consulta;
      }),
      or: vi.fn((filtro: string) => {
        filtros.or = filtro;
        return consulta;
      }),
      order: vi.fn(() => consulta),
      limit: vi.fn(() => consulta),
      maybeSingle: vi.fn(() => consulta),
      then: (resolver: (respuesta: Respuesta) => unknown) =>
        Promise.resolve(responder(tabla, filtros)).then(resolver),
    };
    return consulta;
  });

  return {
    cliente: { from } as unknown as SupabaseClient<Database>,
    llamadas,
  };
}

describe('obtenerDetalleProgramacionServicio', () => {
  it('proyecta responsable, grupo, horas e historial sin exponer identificadores', async () => {
    const { cliente, llamadas } = crearClienteDetalle();

    const detalle = await obtenerDetalleProgramacionServicio(cliente, PROGRAMACION_ID);

    expect(detalle).toEqual({
      responsableNombre: 'Ana Planeación',
      recursoNombre: 'LAS-02 · Láser 2',
      grupoEquipoNombre: 'LAS · Láser',
      horasEstimadas: 8,
      horasReales: 4,
      horasExceso: 0,
      recursoLiberado: true,
      historial: [{
        creadoEn: '2026-10-16T10:00:00.000Z',
        actorNombre: 'Bruno Planeación',
        motivo: 'Cambio por mantenimiento',
        anterior: {
          recurso: 'LAS-01 · Láser 1',
          fechaProgramada: '2026-10-16',
          turno: 'matutino',
          horasEstimadas: 8,
          ordenPrioridad: 2,
        },
        nuevo: {
          recurso: 'LAS-02 · Láser 2',
          fechaProgramada: '2026-10-17',
          turno: 'vespertino',
          horasEstimadas: 8,
          ordenPrioridad: 1,
        },
      }],
    });
    expect(JSON.stringify(detalle)).not.toContain(PROGRAMACION_ID);
    expect(JSON.stringify(detalle)).not.toContain(RECURSO_ID);
    const filtrosEventos = llamadas
      .filter((llamada) => llamada.tabla === 'orden_eventos_cambio')
      .map((llamada) => String(llamada.filtros.or));
    expect(filtrosEventos).toHaveLength(2);
    expect(filtrosEventos.every((filtro) =>
      filtro.includes('detalle->>programacion_id')
      && filtro.includes('detalle->nuevo->>programacion_id'))).toBe(true);
  });

  it('normaliza una programación inexistente al error de dominio', async () => {
    const { cliente } = crearClienteDetalle({ sinProgramacion: true });

    await expect(obtenerDetalleProgramacionServicio(cliente, PROGRAMACION_ID))
      .rejects.toMatchObject({ codigo: 'programacion_inexistente' });
  });
});
