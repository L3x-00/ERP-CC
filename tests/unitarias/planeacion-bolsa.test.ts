import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  elegirHueco,
  horasSugeridas,
  obtenerBolsaPlaneacionServicio,
  siguienteSecuencia,
} from '@/modulos/planeacion/servicios/indice';
import type { CargaCapacidadDiaria } from '@/modulos/planeacion/tipos/indice';

function carga(parcial: Partial<CargaCapacidadDiaria> & {
  recursoId: string;
  fechaProgramada: string;
  turno: CargaCapacidadDiaria['turno'];
  horasDisponibles: number;
}): CargaCapacidadDiaria {
  return {
    area: 'taller',
    horasCapacidad: 8,
    horasProgramadas: 8 - parcial.horasDisponibles,
    horasReales: 0,
    horasExceso: 0,
    porcentajeOcupacion: 0,
    sobrecargado: false,
    ...parcial,
  };
}

type RespuestaLectura = { data: unknown; error: null };

interface ConsultaDeSoloLectura extends PromiseLike<RespuestaLectura> {
  select(columnas: string): ConsultaDeSoloLectura;
  in(campo: string, valores: readonly string[]): ConsultaDeSoloLectura;
  eq(campo: string, valor: unknown): ConsultaDeSoloLectura;
  order(campo: string, opciones: { ascending: boolean }): ConsultaDeSoloLectura;
  maybeSingle(): ConsultaDeSoloLectura;
  insert(datos: unknown): never;
  update(datos: unknown): never;
  upsert(datos: unknown): never;
  delete(): never;
}

function crearClienteDeSoloLectura(
  filasPorTabla: Readonly<Record<string, unknown>>,
): { cliente: SupabaseClient<Database>; operaciones: string[] } {
  const operaciones: string[] = [];

  function consulta(tabla: string): ConsultaDeSoloLectura {
    const respuesta: RespuestaLectura = { data: filasPorTabla[tabla] ?? [], error: null };
    const promesa = Promise.resolve(respuesta);
    const mutacionProhibida = (operacion: string): never => {
      operaciones.push(`${operacion}:${tabla}`);
      throw new Error(`La bolsa no puede ejecutar ${operacion}`);
    };
    const siguiente: ConsultaDeSoloLectura = {
      select(columnas) {
        operaciones.push(`select:${tabla}:${columnas}`);
        return siguiente;
      },
      in(campo) {
        operaciones.push(`in:${tabla}:${campo}`);
        return siguiente;
      },
      eq(campo) {
        operaciones.push(`eq:${tabla}:${campo}`);
        return siguiente;
      },
      order(campo) {
        operaciones.push(`order:${tabla}:${campo}`);
        return siguiente;
      },
      maybeSingle() {
        operaciones.push(`maybeSingle:${tabla}`);
        return siguiente;
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
    return siguiente;
  }

  const cliente = {
    from(tabla: string) {
      operaciones.push(`from:${tabla}`);
      return consulta(tabla);
    },
    rpc(nombre: string) {
      operaciones.push(`rpc:${nombre}`);
      if (nombre !== 'obtener_carga_capacidad_diaria') {
        throw new Error(`La bolsa no puede invocar ${nombre}`);
      }
      return Promise.resolve({
        data: [{
          recurso_id: 'recurso-1',
          area: 'taller',
          fecha_programada: '2026-10-18',
          turno: 'matutino',
          horas_capacidad: 40,
          horas_programadas: 0,
          horas_reales: 0,
          horas_exceso: 0,
          horas_disponibles: 40,
          porcentaje_ocupacion: 0,
          sobrecargado: false,
        }],
        error: null,
      });
    },
  } as unknown as SupabaseClient<Database>;

  return { cliente, operaciones };
}

describe('PLA-05: bolsa de trabajo y huecos', () => {
  it('sugiere horas con mínimo de un cuarto y redondeo a dos decimales', () => {
    expect(horasSugeridas(0)).toBe(0.25);
    expect(horasSugeridas(7)).toBe(0.25);
    expect(horasSugeridas(60)).toBe(1);
    expect(horasSugeridas(90)).toBe(1.5);
    expect(horasSugeridas(95)).toBe(1.58);
  });

  it('calcula la siguiente secuencia libre de la partida', () => {
    expect(siguienteSecuencia([])).toBe(1);
    expect(siguienteSecuencia([1, 3, 2])).toBe(4);
  });

  it('elige el primer hueco por fecha, turno y código de recurso', () => {
    const codigos = new Map([['r2', 'B'], ['r1', 'A']]);
    const hueco = elegirHueco(2, [
      carga({ recursoId: 'r2', fechaProgramada: '2026-10-02', turno: 'matutino', horasDisponibles: 3 }),
      carga({ recursoId: 'r1', fechaProgramada: '2026-10-01', turno: 'nocturno', horasDisponibles: 4 }),
      carga({ recursoId: 'r1', fechaProgramada: '2026-10-01', turno: 'matutino', horasDisponibles: 1.5 }),
    ], codigos);
    expect(hueco?.carga.recursoId).toBe('r1');
    expect(hueco?.carga.turno).toBe('nocturno');
    expect(hueco?.horasDisponibles).toBe(4);
  });

  it('descarta huecos saturados o sin capacidad suficiente', () => {
    const codigos = new Map([['r1', 'A'], ['r2', 'B']]);
    expect(elegirHueco(3, [
      carga({ recursoId: 'r1', fechaProgramada: '2026-10-01', turno: 'matutino', horasDisponibles: 2 }),
      carga({
        recursoId: 'r2', fechaProgramada: '2026-10-01', turno: 'matutino',
        horasDisponibles: 6, sobrecargado: true,
      }),
    ], codigos)).toBeNull();
  });

  it('prefiere la fecha más próxima aunque el recurso tenga otro código', () => {
    const codigos = new Map([['r1', 'Z'], ['r2', 'A']]);
    const hueco = elegirHueco(1, [
      carga({ recursoId: 'r2', fechaProgramada: '2026-10-05', turno: 'matutino', horasDisponibles: 5 }),
      carga({ recursoId: 'r1', fechaProgramada: '2026-10-01', turno: 'vespertino', horasDisponibles: 5 }),
    ], codigos);
    expect(hueco?.carga.fechaProgramada).toBe('2026-10-01');
  });

  it('solo lee y usa la RPC de capacidad; limita la bolsa a 12 sugerencias (C9.4/P-18)', async () => {
    const partidas = Array.from({ length: 30 }, (_, indice) => ({
      id: `partida-${indice + 1}`,
      orden_id: 'orden-1',
      codigo_pieza: `PZA-${indice + 1}`,
      area_trabajo_codigo: 'taller',
      procesos: ['Corte'],
      tiempo_estimado_minutos: 60,
    }));
    const { cliente, operaciones } = crearClienteDeSoloLectura({
      ordenes_produccion: [{
        id: 'orden-1',
        folio: 'OP-000001',
        estado: 'programada',
        estado_sii: 'PLANIFICADA',
      }],
      partidas_orden_produccion: partidas,
      programacion_areas: [],
      recursos_planeacion: [{ id: 'recurso-1', codigo: 'R-01' }],
      metas_proceso_partida: [],
    });

    const bolsa = await obtenerBolsaPlaneacionServicio(cliente, cliente, '2026-10-18');

    expect(bolsa.sugerencias).toHaveLength(12);
    expect(operaciones.filter((operacion) => operacion.startsWith('rpc:'))).toEqual([
      'rpc:obtener_carga_capacidad_diaria',
    ]);
    expect(operaciones.some((operacion) => /^(insert|update|upsert|delete):/.test(operacion))).toBe(false);
  });
});
