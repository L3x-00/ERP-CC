import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

const {
  canMock,
  crearClienteAdminMock,
  crearClienteServidorMock,
  obtenerUsuarioMock,
} = vi.hoisted(() => ({
  canMock: vi.fn(),
  crearClienteAdminMock: vi.fn(),
  crearClienteServidorMock: vi.fn(),
  obtenerUsuarioMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => canMock(...argumentos),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => crearClienteAdminMock(),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: () => crearClienteServidorMock(),
}));

import { proponerHuecoReprogramacionAccion } from '@/modulos/planeacion/acciones/proponer-hueco-reprogramacion';

type RespuestaLectura = { data: unknown; error: null };

interface ConsultaDeSoloLectura extends PromiseLike<RespuestaLectura> {
  select(columnas: string): ConsultaDeSoloLectura;
  eq(campo: string, valor: string | boolean): ConsultaDeSoloLectura;
  maybeSingle(): ConsultaDeSoloLectura;
  insert(datos: unknown): never;
  update(datos: unknown): never;
  upsert(datos: unknown): never;
  delete(): never;
}

function crearClienteDeLectura(
  operaciones: string[],
): SupabaseClient<Database> {
  const respuesta: RespuestaLectura = { data: { id: '33333333-3333-4333-8333-333333333333' }, error: null };
  const promesa = Promise.resolve(respuesta);
  const mutacionProhibida = (operacion: string): never => {
    operaciones.push(operacion);
    throw new Error(`Buscar hueco no puede ejecutar ${operacion}`);
  };
  const consulta: ConsultaDeSoloLectura = {
    select() {
      operaciones.push('select');
      return consulta;
    },
    eq() {
      operaciones.push('eq');
      return consulta;
    },
    maybeSingle() {
      operaciones.push('maybeSingle');
      return consulta;
    },
    insert() {
      return mutacionProhibida('insert');
    },
    update() {
      return mutacionProhibida('update');
    },
    upsert() {
      return mutacionProhibida('upsert');
    },
    delete() {
      return mutacionProhibida('delete');
    },
    then: promesa.then.bind(promesa),
  };

  return {
    from() {
      operaciones.push('from');
      return consulta;
    },
  } as unknown as SupabaseClient<Database>;
}

function crearAdministradorDeCapacidad(operaciones: string[]): SupabaseClient<Database> {
  return {
    rpc(nombre: string) {
      operaciones.push(`rpc:${nombre}`);
      if (nombre !== 'obtener_carga_capacidad_diaria') {
        throw new Error(`Buscar hueco no puede invocar ${nombre}`);
      }
      return Promise.resolve({
        data: [{
          recurso_id: '33333333-3333-4333-8333-333333333333',
          area: 'taller',
          fecha_programada: '2026-10-19',
          turno: 'matutino',
          horas_capacidad: 8,
          horas_programadas: 4,
          horas_reales: 0,
          horas_exceso: 0,
          horas_disponibles: 4,
          porcentaje_ocupacion: 50,
          sobrecargado: false,
        }],
        error: null,
      });
    },
  } as unknown as SupabaseClient<Database>;
}

describe('proponerHuecoReprogramacionAccion', () => {
  it('solo consulta el recurso y la RPC de capacidad al previsualizar (C9.4/P-18)', async () => {
    const operacionesCliente: string[] = [];
    const operacionesAdmin: string[] = [];
    obtenerUsuarioMock.mockResolvedValue({ id: 'actor-planeacion' });
    canMock.mockResolvedValue(true);
    crearClienteServidorMock.mockResolvedValue(crearClienteDeLectura(operacionesCliente));
    crearClienteAdminMock.mockReturnValue(crearAdministradorDeCapacidad(operacionesAdmin));

    const resultado = await proponerHuecoReprogramacionAccion({
      recursoId: '33333333-3333-4333-8333-333333333333',
      turno: 'matutino',
      horasEstimadas: 2,
      desdeFecha: '2026-10-19',
    });

    expect(resultado).toEqual({
      exito: true,
      datos: expect.objectContaining({ fecha: '2026-10-19', horasDisponibles: 4 }),
    });
    expect(operacionesCliente).toEqual(['from', 'select', 'eq', 'eq', 'maybeSingle']);
    expect(operacionesAdmin).toEqual(['rpc:obtener_carga_capacidad_diaria']);
  });
});
