import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  notificarInicioProcesoServicio,
  notificarSolicitudProgramacionServicio,
} from '@/modulos/produccion/servicios/notificaciones-produccion-servicio';

const ENTRADA = {
  ordenId: 'orden-1',
  partidaId: 'partida-1',
  operadorId: 'operador-1',
  operadorNombre: 'Jorge Ramírez',
  reclamoId: 'reclamo-1',
};

function clienteConInsert() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  function consulta(tabla: string) {
    const respuesta = Promise.resolve(
      tabla === 'ordenes_produccion'
        ? { data: { folio: 'O-1126_11', folio_sii: null }, error: null }
        : tabla === 'partidas_orden_produccion'
          ? { data: { codigo_pieza: 'IT01' }, error: null }
          : tabla === 'permisos_rol'
            ? { data: [{ rol: 'planeador' }], error: null }
            : { data: [{ id: 'admin-1' }], error: null },
    );
    const enc: Record<string, unknown> = {
      then: respuesta.then.bind(respuesta),
      select: () => enc,
      eq: () => enc,
      in: () => enc,
      maybeSingle: () => enc,
    };
    return enc;
  }
  const admin = {
    from: (tabla: string) => {
      const base = consulta(tabla);
      return { ...base, insert } as never;
    },
  } as unknown as SupabaseClient<Database>;
  return { admin, insert };
}

describe('PLAN-2 — notificaciones entendibles a Planeación', () => {
  it('el reclamo dice qué debe hacer Planeación', async () => {
    const { admin, insert } = clienteConInsert();
    await notificarSolicitudProgramacionServicio(admin, ENTRADA);

    const fila = insert.mock.calls[0][0][0];
    expect(fila.mensaje).toContain('Jorge Ramírez');
    expect(fila.mensaje).toContain('ha reclamado esta orden');
    expect(fila.mensaje).toContain('Programa la operación');
    expect(fila.titulo).toBe('Operador esperando programación');
  });

  it('el inicio nombra la orden y quién la empezó', async () => {
    const { admin, insert } = clienteConInsert();
    await notificarInicioProcesoServicio(admin, ENTRADA);

    const fila = insert.mock.calls[0][0][0];
    expect(fila.mensaje).toContain('Jorge Ramírez');
    expect(fila.mensaje).toContain('ha iniciado el proceso de la orden O-1126_11 · IT01');
    expect(fila.titulo).toBe('Proceso iniciado por el operador');
  });
});
