import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

export type RespuestaTabla = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
  count?: number | null;
};

export type RegistroConsulta = {
  tabla: string;
  columnas: string;
  igualdades: [string, unknown][];
  dentroDe: [string, readonly unknown[]][];
  ordenes: [string, { ascending?: boolean } | undefined][];
  rango: [number, number] | null;
  conteo: string | undefined;
};

export type FabricaRespuesta = (registro: RegistroConsulta) => RespuestaTabla;

/**
 * Cliente Supabase falso para el historial del cliente: registra tabla,
 * columnas, filtros, orden y rango de cada consulta para afirmar que el
 * filtrado, la paginación y la lista de columnas se resuelven en la consulta
 * y no en la UI. Una tabla sin fábrica responde vacía y sin error.
 */
export function crearSupabaseFalsoHistorial(respuestas: Record<string, FabricaRespuesta>) {
  const consultas: RegistroConsulta[] = [];
  const canalesCreados: string[] = [];
  const tablasEscuchadas: string[] = [];
  const suscribir = vi.fn();
  const quitarCanal = vi.fn();

  const from = (tabla: string) => {
    const registro: RegistroConsulta = {
      tabla,
      columnas: '',
      igualdades: [],
      dentroDe: [],
      ordenes: [],
      rango: null,
      conteo: undefined,
    };
    consultas.push(registro);

    const constructor = {
      select(columnas: string, opciones?: { count?: string }) {
        registro.columnas = columnas;
        registro.conteo = opciones?.count;
        return constructor;
      },
      eq(columna: string, valor: unknown) {
        registro.igualdades.push([columna, valor]);
        return constructor;
      },
      in(columna: string, valores: readonly unknown[]) {
        registro.dentroDe.push([columna, valores]);
        return constructor;
      },
      order(columna: string, opciones?: { ascending?: boolean }) {
        registro.ordenes.push([columna, opciones]);
        return constructor;
      },
      range(desde: number, hasta: number) {
        registro.rango = [desde, hasta];
        return constructor;
      },
      then<T>(alCumplir: (valor: RespuestaTabla) => T) {
        const fabrica = respuestas[tabla];
        const respuesta: RespuestaTabla = fabrica
          ? fabrica(registro)
          : { data: [], error: null, count: 0 };
        return Promise.resolve(respuesta).then(alCumplir);
      },
    };

    return constructor;
  };

  const canal = {
    on: (_tipo: string, filtro: { table: string }) => {
      tablasEscuchadas.push(filtro.table);
      return canal;
    },
    subscribe: suscribir,
  };

  const cliente = {
    from,
    channel: (nombre: string) => {
      canalesCreados.push(nombre);
      return canal;
    },
    removeChannel: quitarCanal,
  };

  return {
    cliente: cliente as unknown as SupabaseClient<Database>,
    consultas,
    canalesCreados,
    tablasEscuchadas,
    suscribir,
    quitarCanal,
  };
}

/** Pagina un arreglo con el mismo criterio de PostgREST (`range` inclusivo). */
export function paginarFilas(
  filas: Record<string, unknown>[],
  registro: RegistroConsulta,
): RespuestaTabla {
  const [desde, hasta] = registro.rango ?? [0, filas.length - 1];
  return { data: filas.slice(desde, hasta + 1), error: null, count: filas.length };
}
