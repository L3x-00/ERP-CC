import { describe, expect, it } from 'vitest';

import {
  alternarActivoServicio,
  guardarCanalServicio,
  listarCanales,
  obtenerCatalogosBaseServicio,
  type ClienteCatalogos,
} from '@/modulos/catalogos/servicios/indice';

const CANAL_UUID = '00000000-0000-4000-8000-0000000c0b01';

const FILAS_CANALES = [
  {
    id: CANAL_UUID,
    codigo: 'WHATSAPP',
    nombre: 'WhatsApp',
    es_otro: false,
    activo: true,
    orden: 10,
    creado_en: '2026-10-08T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000c0b02',
    codigo: 'OTRO',
    nombre: 'Otro',
    es_otro: true,
    activo: false,
    orden: 60,
    creado_en: '2026-10-08T00:00:00.000Z',
  },
];

interface Llamada {
  tabla: string;
  operacion: string;
  payload?: unknown;
  filtros: Array<[string, unknown]>;
  ordenes: string[];
}

/**
 * Doble del constructor de PostgREST: encadena igual que el cliente real y
 * registra tabla, operación, filtros y orden para verificar el contrato.
 */
function crearClienteFalso(filas: unknown = FILAS_CANALES) {
  const llamadas: Llamada[] = [];
  const cliente = {
    from(tabla: string) {
      const actual: Llamada = { tabla, operacion: 'select', filtros: [], ordenes: [] };
      llamadas.push(actual);
      const constructor = {
        select: () => constructor,
        insert(payload: unknown) {
          actual.operacion = 'insert';
          actual.payload = payload;
          return constructor;
        },
        update(payload: unknown) {
          actual.operacion = 'update';
          actual.payload = payload;
          return constructor;
        },
        eq(columna: string, valor: unknown) {
          actual.filtros.push([columna, valor]);
          return constructor;
        },
        order(columna: string) {
          actual.ordenes.push(columna);
          return constructor;
        },
        single: () => Promise.resolve({ data: Array.isArray(filas) ? filas[0] : filas, error: null }),
        maybeSingle: () => Promise.resolve({ data: Array.isArray(filas) ? filas[0] : filas, error: null }),
        then<T>(alCumplir: (valor: { data: unknown; error: null }) => T) {
          return Promise.resolve({ data: filas, error: null }).then(alCumplir);
        },
      };
      return constructor;
    },
  };
  return { cliente: cliente as unknown as ClienteCatalogos, llamadas };
}

describe('servicio de canales RFQ (DC-02)', () => {
  it('lista todos los canales ordenados por orden y nombre', async () => {
    const { cliente, llamadas } = crearClienteFalso();
    const canales = await listarCanales(cliente);

    expect(canales.map((canal) => canal.codigo)).toEqual(['WHATSAPP', 'OTRO']);
    expect(canales[1].esOtro).toBe(true);
    expect(canales[1].activo).toBe(false);
    expect(llamadas[0].tabla).toBe('catalogo_canales');
    expect(llamadas[0].ordenes).toEqual(['orden', 'nombre']);
    expect(llamadas[0].filtros).toEqual([]);
  });

  it('filtra solo activos cuando se piden opciones de captura', async () => {
    const { cliente, llamadas } = crearClienteFalso();
    await listarCanales(cliente, true);
    expect(llamadas[0].filtros).toEqual([['activo', true]]);
  });

  it('da de alta un canal con insert y sin id', async () => {
    const { cliente, llamadas } = crearClienteFalso();
    const canal = await guardarCanalServicio(cliente, {
      codigo: 'WHATSAPP',
      nombre: 'WhatsApp',
      esOtro: false,
      activo: true,
      orden: 10,
    });

    expect(canal.codigo).toBe('WHATSAPP');
    expect(llamadas[0].operacion).toBe('insert');
    expect(llamadas[0].payload).toEqual({
      codigo: 'WHATSAPP',
      nombre: 'WhatsApp',
      es_otro: false,
      activo: true,
      orden: 10,
    });
    expect(llamadas[0].filtros).toEqual([]);
  });

  it('edita un canal existente con update acotado por id', async () => {
    const { cliente, llamadas } = crearClienteFalso();
    await guardarCanalServicio(cliente, {
      id: CANAL_UUID,
      codigo: 'OTRO',
      nombre: 'Otro',
      esOtro: true,
      activo: true,
      orden: 60,
    });

    expect(llamadas[0].operacion).toBe('update');
    expect(llamadas[0].payload).toEqual({
      codigo: 'OTRO',
      nombre: 'Otro',
      es_otro: true,
      activo: true,
      orden: 60,
    });
    expect(llamadas[0].filtros).toEqual([['id', CANAL_UUID]]);
  });

  it('desactiva un canal por el mecanismo existente, sin borrado físico', async () => {
    const { cliente, llamadas } = crearClienteFalso({ id: CANAL_UUID });
    const resultado = await alternarActivoServicio(cliente, {
      entidad: 'catalogo_canales',
      id: CANAL_UUID,
      activo: false,
    });

    expect(resultado).toEqual({ id: CANAL_UUID, activo: false });
    expect(llamadas[0].tabla).toBe('catalogo_canales');
    expect(llamadas[0].operacion).toBe('update');
    expect(llamadas[0].payload).toEqual({ activo: false });
    expect(llamadas[0].filtros).toEqual([['id', CANAL_UUID]]);
  });

  it('incluye los canales en el paquete de catálogos base', async () => {
    const { cliente } = crearClienteFalso();
    const datos = await obtenerCatalogosBaseServicio(cliente);
    expect(datos.canales.map((canal) => canal.codigo)).toEqual(['WHATSAPP', 'OTRO']);
  });

  it('rechaza alternar un canal que ya no existe', async () => {
    const { cliente } = crearClienteFalso(null);
    await expect(
      alternarActivoServicio(cliente, { entidad: 'catalogo_canales', id: CANAL_UUID, activo: true }),
    ).rejects.toThrow('catalogo_no_encontrado');
  });
});
