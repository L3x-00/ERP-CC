import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { obtenerDatosComparativaServicio } from '@/modulos/ordenes/servicios/datos-comparativa-servicio';
import { obtenerOrdenesConPartidasServicio } from '@/modulos/ordenes/servicios/ordenes-servicio';

type Respuesta = { data: unknown[] | null; error: { message: string } | null; count?: number };

/**
 * Cadena mínima de PostgREST para leer los filtros usados por cada consulta y
 * responder según la tabla; imita el patrón de `cobranza-historial-servicio`.
 */
function clienteFalso(responder: (tabla: string, filtros: Record<string, unknown>) => Respuesta) {
  const llamadas: { tabla: string; filtros: Record<string, unknown> }[] = [];
  const from = vi.fn((tabla: string) => {
    const filtros: Record<string, unknown> = {};
    llamadas.push({ tabla, filtros });
    const cadena = {
      select: vi.fn(() => cadena),
      in: vi.fn((clave: string, valores: string[]) => {
        filtros[clave] = valores;
        return cadena;
      }),
      eq: vi.fn((clave: string, valor: unknown) => {
        filtros[clave] = valor;
        return cadena;
      }),
      order: vi.fn(() => cadena),
      range: vi.fn((desde: number, hasta: number) => {
        filtros.rango = [desde, hasta];
        return cadena;
      }),
      then: (resolver: (valor: Respuesta) => unknown) =>
        Promise.resolve(responder(tabla, filtros)).then(resolver),
    };
    return cadena;
  });
  return { cliente: { from } as unknown as SupabaseClient<Database>, llamadas };
}

function loteDe(filtros: Record<string, unknown>): string[] {
  return (filtros.orden_id as string[] | undefined) ?? [];
}

function filaOrdenBase(indice: number) {
  return {
    id: `orden-${indice}`,
    folio: `OP-${String(indice).padStart(6, '0')}`,
    cliente_id: 'cliente-1',
    cotizacion_id: null,
    estado: 'programada',
    estado_sii: null,
    folio_sii: null,
    prioridad: 'normal',
    fecha_compromiso: '2099-12-31T00:00:00Z',
    fecha_inicio: null,
    fecha_fin: null,
    motivo_cancelacion: null,
    es_interna: false,
    archivada_en: null,
    id_historico: null,
    referencia_externa: null,
    notas: null,
    fecha_trabajo: null,
    horas_estimadas: null,
    orden_origen_id: null,
    creado_en: '2026-01-01T00:00:00Z',
    actualizado_en: '2026-01-01T00:00:00Z',
    pipeline: null,
  };
}

function filaPartidaBase(ordenId: string) {
  return {
    id: `partida-${ordenId}`,
    orden_id: ordenId,
    codigo_pieza: `PIEZA-${ordenId}`,
    descripcion: null,
    cantidad_solicitada: 1,
    cantidad_producida: 0,
    cantidad_scrap: 0,
    unidad_medida: 'pza',
    catalogo_material_id: null,
    material_id: null,
    tiempo_estimado_minutos: 0,
    tiempo_real_minutos: 0,
    maquina_asignada: null,
    operador_asignado_id: null,
    area_trabajo_codigo: null,
    procesos: [],
    creado_en: '2026-01-01T00:00:00Z',
    actualizado_en: '2026-01-01T00:00:00Z',
    metas_proceso_partida: [],
  };
}

describe('loteo de consultas de órdenes (límite 414 del gateway)', () => {
  it('consulta partidas en lotes de máximo 100 ids y conserva todas las órdenes', async () => {
    const filasOrden = Array.from({ length: 250 }, (_, indice) => filaOrdenBase(indice));
    const filasPartida = filasOrden.map((orden) => filaPartidaBase(orden.id));
    const { cliente, llamadas } = clienteFalso((tabla, filtros) => {
      if (tabla === 'ordenes_produccion') return { data: filasOrden, error: null };
      const lote = new Set(loteDe(filtros));
      return { data: filasPartida.filter((partida) => lote.has(partida.orden_id)), error: null };
    });

    const resultado = await obtenerOrdenesConPartidasServicio(cliente);

    expect(resultado).toHaveLength(250);
    expect(resultado[0].partidas).toHaveLength(1);
    expect(resultado[249].orden.folio).toBe('OP-000249');
    const lotesPartidas = llamadas
      .filter((llamada) => llamada.tabla === 'partidas_orden_produccion')
      .map((llamada) => loteDe(llamada.filtros).length);
    expect(lotesPartidas).toEqual([100, 100, 50]);
    expect(Math.max(...lotesPartidas)).toBeLessThanOrEqual(100);
  });

  it('la comparativa consulta las tres tablas en lotes de máximo 100 ids', async () => {
    const ids = Array.from({ length: 250 }, (_, indice) => `orden-${indice}`);
    const { cliente, llamadas } = clienteFalso((tabla, filtros) => {
      const lote = loteDe(filtros);
      if (tabla === 'sesiones_trabajo') {
        return {
          data: lote.map((id) => ({ orden_id: id, estado_sesion: 'activa', motivo_pausa: null })),
          error: null,
        };
      }
      if (tabla === 'notas_entrega') {
        return {
          data: lote.map((id) => ({ orden_id: id, creado_en: '2026-01-01T00:00:00Z' })),
          error: null,
        };
      }
      return {
        data: lote.map((id) => ({ orden_id: id, estado: 'pendiente', monto_total: 100, tipo_cambio_origen: 1 })),
        error: null,
      };
    });

    const datos = await obtenerDatosComparativaServicio(cliente, ids, true);

    expect(datos.sesiones).toHaveLength(250);
    expect(datos.entregas).toHaveLength(250);
    expect(datos.cuentas).toHaveLength(250);
    for (const tabla of ['sesiones_trabajo', 'notas_entrega', 'cuentas_por_cobrar']) {
      const lotes = llamadas
        .filter((llamada) => llamada.tabla === tabla)
        .map((llamada) => loteDe(llamada.filtros).length);
      expect(lotes).toEqual([100, 100, 50]);
    }
  });

  it('sin ids no dispara consultas a la comparativa', async () => {
    const { cliente, llamadas } = clienteFalso(() => ({ data: [], error: null }));

    const datos = await obtenerDatosComparativaServicio(cliente, [], true);

    expect(datos).toEqual({
      sesiones: [],
      entregas: [],
      cuentas: [],
      entregadaPorPartida: {},
      entregadaPorOrden: {},
    });
    expect(llamadas).toHaveLength(0);
  });
});
