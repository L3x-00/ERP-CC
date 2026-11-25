import { describe, expect, it, vi } from 'vitest';

vi.mock('@/modulos/produccion/servicios/sesiones-servicio', () => ({
  lanzarErrorProduccion: (mensaje: string) => { throw new Error(mensaje); },
}));

import { obtenerTiemposIntegradosOrdenServicio } from '@/modulos/produccion/servicios/corrida-integrada-servicio';

function consulta(datos: unknown[]) {
  const objeto = {
    select: () => objeto,
    in: () => objeto,
    then: (resolver: (valor: unknown) => unknown, rechazar?: (error: unknown) => unknown) =>
      Promise.resolve({ data: datos, error: null }).then(resolver, rechazar),
  };
  return objeto;
}

const TIEMPOS = [
  { sesion_id: 's1', fecha_inicio: '2026-11-24T10:00:00Z', operador_nombre: 'Jorge', partida_id: 'p1', codigo_pieza: 'IT01', piezas: 10, minutos: null },
  { sesion_id: 's2', fecha_inicio: '2026-11-24T11:00:00Z', operador_nombre: 'Jorge', partida_id: 'p2', codigo_pieza: 'IT02', piezas: 5, minutos: 30 },
];

describe('C5 — sesiones de corrida', () => {
  it('enriquece cada tiempo con el código de su corrida', async () => {
    const admin = {
      rpc: async () => ({ data: TIEMPOS, error: null }),
      from: (tabla: string) => {
        if (tabla === 'sesiones_trabajo') {
          return consulta([{ id: 's1', corrida_id: 'c1' }, { id: 's2', corrida_id: 'c1' }]);
        }
        if (tabla === 'corridas') return consulta([{ id: 'c1', codigo: 'LAS01' }]);
        return consulta([]);
      },
    } as never;

    const tiempos = await obtenerTiemposIntegradosOrdenServicio(admin, {
      ordenId: '11111111-1111-4111-8111-111111111111',
      actorId: '22222222-2222-4222-8222-222222222222',
    });

    expect(tiempos).toHaveLength(2);
    expect(tiempos[0]!.corridaCodigo).toBe('LAS01');
    expect(tiempos[1]!.corridaCodigo).toBe('LAS01');
  });

  it('deja el código a null cuando la sesión no tiene corrida', async () => {
    const admin = {
      rpc: async () => ({ data: TIEMPOS, error: null }),
      from: (tabla: string) => {
        if (tabla === 'sesiones_trabajo') {
          return consulta([{ id: 's1', corrida_id: null }, { id: 's2', corrida_id: null }]);
        }
        return consulta([]);
      },
    } as never;

    const tiempos = await obtenerTiemposIntegradosOrdenServicio(admin, {
      ordenId: '11111111-1111-4111-8111-111111111111',
      actorId: '22222222-2222-4222-8222-222222222222',
    });

    expect(tiempos[0]!.corridaCodigo).toBeNull();
  });
});
