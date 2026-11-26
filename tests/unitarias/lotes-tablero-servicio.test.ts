import { describe, expect, it } from 'vitest';

import {
  agruparLotesPorOrden,
  claveLotePartida,
  mapaLotesPorOperacion,
  obtenerLotesTableroServicio,
  obtenerReferenciasCorridaPorPartida,
} from '@/modulos/produccion/servicios/lotes-tablero-servicio';

const ORDEN = '11111111-1111-4111-8111-111111111111';
const CORRIDA = '22222222-2222-4222-8222-222222222222';
const PROCESO = '33333333-3333-4333-8333-333333333333';
const ITEM1 = '44444444-4444-4444-8444-444444444444';
const ITEM2 = '55555555-5555-4555-8555-555555555555';
const CLIENTE = '66666666-6666-4666-8666-666666666666';

function consulta(datos: Record<string, unknown>[]) {
  let campo: string | null = null;
  let valores: unknown[] = [];
  const objeto = {
    select: () => objeto,
    eq: (nombre: string, valor: unknown) => {
      if (campo === null || campo === nombre) { campo = nombre; valores = [valor]; }
      return objeto;
    },
    in: (nombre: string, lista: unknown[]) => {
      if (campo === null || campo === nombre) { campo = nombre; valores = lista; }
      return objeto;
    },
    order: () => objeto,
    then: (resolver: (valor: unknown) => unknown, rechazar?: (error: unknown) => unknown) => {
      const filas = campo
        ? datos.filter((fila) => valores.includes(fila[campo!]))
        : datos;
      return Promise.resolve({ data: filas, error: null }).then(resolver, rechazar);
    },
  };
  return objeto;
}

function admin(datosPorTabla: Record<string, Record<string, unknown>[]>) {
  return {
    from: (tabla: string) => consulta(datosPorTabla[tabla] ?? []),
  } as never;
}

const DATOS = {
  corridas: [{
    id: CORRIDA,
    codigo: 'LAS02',
    estado: 'PLANIFICADA',
    orden_id: ORDEN,
    proceso_id: PROCESO,
    cantidad_planificada: '180.0000',
    creado_en: '2026-11-26T00:09:00.000Z',
  }],
  ordenes_produccion: [{
    id: ORDEN,
    folio: 'O-1126_02',
    folio_sii: null,
    cliente_id: CLIENTE,
  }],
  corrida_items: [
    { corrida_id: CORRIDA, partida_id: ITEM1, codigo_item: 'IT01', cantidad: '60.0000' },
    { corrida_id: CORRIDA, partida_id: ITEM2, codigo_item: 'IT02', cantidad: '120.0000' },
  ],
  catalogo_procesos: [{ id: PROCESO, nombre: 'CORTE LASER' }],
  clientes: [{ id: CLIENTE, razon_social: 'Manufacturing Group', nombre_comercial: null }],
  partidas_orden_produccion: [
    { id: ITEM1, area_trabajo_codigo: 'LASER' },
    { id: ITEM2, area_trabajo_codigo: 'LASER' },
  ],
};

describe('lotes visibles en los tableros', () => {
  it('proyecta el lote creado con folio, proceso, ítems y área', async () => {
    const lotes = await obtenerLotesTableroServicio(admin(DATOS), [ORDEN]);

    expect(lotes).toHaveLength(1);
    const lote = lotes[0]!;
    expect(lote.codigo).toBe('LAS02');
    expect(lote.estado).toBe('PLANIFICADA');
    expect(lote.folioOrden).toBe('O-1126_02');
    expect(lote.clienteNombre).toBe('Manufacturing Group');
    expect(lote.procesoNombre).toBe('CORTE LASER');
    expect(lote.areaCodigo).toBe('LASER');
    expect(lote.cantidadPlanificada).toBe(180);
    expect(lote.items.map((item) => item.codigoItem)).toEqual(['IT01', 'IT02']);
  });

  it('relaciona cada ítem con su lote solo para ese proceso', async () => {
    const lotes = await obtenerLotesTableroServicio(admin(DATOS), [ORDEN]);
    const mapa = mapaLotesPorOperacion(lotes);

    expect(mapa.get(claveLotePartida(ITEM1, 'CORTE LASER'))?.codigo).toBe('LAS02');
    expect(mapa.get(claveLotePartida(ITEM2, 'corte laser'))?.codigo).toBe('LAS02');
    expect(mapa.has(claveLotePartida(ITEM1, 'DOB'))).toBe(false);
  });

  it('agrupa los lotes por orden sin perder ninguna corrida', async () => {
    const lotes = await obtenerLotesTableroServicio(admin(DATOS), [ORDEN]);
    const otroLote = { ...lotes[0]!, id: 'otra-corrida', codigo: 'LAS03' };
    const grupos = agruparLotesPorOrden([lotes[0]!, otroLote]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.folioOrden).toBe('O-1126_02');
    expect(grupos[0]!.lotes.map((lote) => lote.codigo)).toEqual(['LAS02', 'LAS03']);
  });

  it('conserva la referencia del lote terminado para etiquetar cada ítem', async () => {
    const referencias = await obtenerReferenciasCorridaPorPartida(admin({
      corrida_items: [
        { corrida_id: CORRIDA, partida_id: ITEM1 },
        { corrida_id: CORRIDA, partida_id: ITEM2 },
      ],
      corridas: [{
        id: CORRIDA, codigo: 'LAS02', estado: 'COMPLETADA',
        proceso_id: PROCESO, creado_en: '2026-11-26T01:00:00.000Z',
      }],
      catalogo_procesos: [{ id: PROCESO, nombre: 'CORTE LASER' }],
    }), [ITEM1, ITEM2]);

    expect(referencias.get(claveLotePartida(ITEM1, 'CORTE LASER'))).toMatchObject({
      codigo: 'LAS02', estado: 'COMPLETADA',
    });
    expect(referencias.get(claveLotePartida(ITEM2, 'corte laser'))?.codigo).toBe('LAS02');
    expect(referencias.get(claveLotePartida(ITEM1, 'DOB'))).toBeUndefined();
  });

  it('no consulta nada cuando no hay órdenes visibles', async () => {
    const lotes = await obtenerLotesTableroServicio(admin(DATOS), []);
    expect(lotes).toEqual([]);
  });
});
