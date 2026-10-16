import { beforeEach, describe, expect, it, vi } from 'vitest';

const { accesoMock, firmarMock, tablas, admin } = vi.hoisted(() => {
  const tablas: Record<string, Record<string, unknown>[]> = {};
  const admin = {
    from(tabla: string) {
      const filtros: { columna: string; valores: unknown[] }[] = [];
      const constructor: Record<string, unknown> = {};
      constructor.select = () => constructor;
      for (const metodo of ['order', 'limit']) constructor[metodo] = () => constructor;
      constructor.eq = (columna: string, valor: unknown) => {
        filtros.push({ columna, valores: [valor] });
        return constructor;
      };
      constructor.in = (columna: string, valores: unknown[]) => {
        filtros.push({ columna, valores });
        return constructor;
      };
      const filas = () => (tablas[tabla] ?? []).filter((fila) => filtros.every(
        ({ columna, valores }) => valores.includes(fila[columna]),
      ));
      constructor.maybeSingle = async () => ({ data: filas()[0] ?? null, error: null });
      constructor.then = (
        resolver: (valor: unknown) => unknown,
        rechazar?: (motivo: unknown) => unknown,
      ) => Promise.resolve({ data: filas(), error: null }).then(resolver, rechazar);
      return constructor;
    },
  };
  return { accesoMock: vi.fn(), firmarMock: vi.fn(), tablas, admin };
});

vi.mock('@/nucleo/autenticacion/obtener-operador-sesion', () => ({
  obtenerAccesoLecturaPiso: () => accesoMock(),
}));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: () => admin }));
vi.mock('@/nucleo/almacenamiento/archivos/servicio', () => ({
  firmarLecturaArchivo: (...argumentos: unknown[]) => firmarMock(...argumentos),
}));

import { obtenerUrlArchivoPisoAccion } from '@/modulos/ordenes/acciones/obtener-url-archivo-piso';

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';
const ORDEN_AJENA_ID = '99999999-9999-4999-8999-999999999999';
const ARCHIVO_ID = '22222222-2222-4222-8222-222222222222';
const ARCHIVO_RETIRADO_ID = '33333333-3333-4333-8333-333333333333';
const ARCHIVO_AJENO_ID = '55555555-5555-4555-8555-555555555555';
const OPERADOR_ID = '66666666-6666-4666-8666-666666666666';
const OTRO_OPERADOR_ID = '77777777-7777-4777-8777-777777777777';

function snapshot(ids: string[]): Record<string, unknown> {
  return {
    version: 1, orden_id: ORDEN_ID, origen: {}, cabecera: { total: 75000 },
    items: [{ codigo: 'IT01', precio_unitario: 75000, archivos: [] }],
    archivos: ids.map((id) => ({ archivo_id: id })),
  };
}

function fila(id: string, cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, entidad: 'rfq', entidad_id: 'rfq-1', clase: 'CAD', nombre_original: 'a.dxf', nombre_erp: null,
    vigente: true, retirado_en: null, ...cambios,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  accesoMock.mockResolvedValue({ operadorId: OPERADOR_ID });
  firmarMock.mockResolvedValue('https://firmada/archivo');
  tablas.ordenes_produccion = [
    { id: ORDEN_ID, estado: 'en_proceso', snapshot_json: snapshot([ARCHIVO_ID, ARCHIVO_RETIRADO_ID]), propuesta_revision_id: null },
    { id: ORDEN_AJENA_ID, estado: 'en_proceso', snapshot_json: snapshot([ARCHIVO_AJENO_ID]), propuesta_revision_id: null },
  ];
  tablas.partidas_orden_produccion = [
    { id: 'p1', orden_id: ORDEN_ID, operador_asignado_id: OPERADOR_ID },
    { id: 'p2', orden_id: ORDEN_AJENA_ID, operador_asignado_id: OTRO_OPERADOR_ID },
  ];
  tablas.archivos = [
    fila(ARCHIVO_ID),
    fila(ARCHIVO_RETIRADO_ID, { retirado_en: '2026-10-10T10:00:00.000Z' }),
    fila(ARCHIVO_AJENO_ID),
  ];
  tablas.propuesta_items = [];
});

describe('URL de archivo desde el piso (C8.3c · O-05)', () => {
  it('firma un archivo de una orden del operador con su sesión de PIN', async () => {
    const resultado = await obtenerUrlArchivoPisoAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_ID });

    expect(resultado).toEqual({ exito: true, datos: { url: 'https://firmada/archivo' } });
    expect(firmarMock).toHaveBeenCalledWith(admin, ARCHIVO_ID, 300);
  });

  it('sin sesión de piso no firma nada', async () => {
    accesoMock.mockResolvedValue(null);

    const resultado = await obtenerUrlArchivoPisoAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_ID });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('rechaza una orden asignada a OTRO operador aunque el archivo exista', async () => {
    const resultado = await obtenerUrlArchivoPisoAccion({ ordenId: ORDEN_AJENA_ID, archivoId: ARCHIVO_AJENO_ID });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('rechaza un archivo de otra orden usando una orden propia', async () => {
    const resultado = await obtenerUrlArchivoPisoAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_AJENO_ID });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('rechaza un archivo retirado', async () => {
    const resultado = await obtenerUrlArchivoPisoAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_RETIRADO_ID });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('rechaza una orden que ya no está en proceso', async () => {
    (tablas.ordenes_produccion?.[0] as Record<string, unknown>).estado = 'completada';

    const resultado = await obtenerUrlArchivoPisoAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_ID });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('la vista de administrador (operadorId null) abre archivos de cualquier orden en proceso', async () => {
    accesoMock.mockResolvedValue({ operadorId: null });

    const resultado = await obtenerUrlArchivoPisoAccion({ ordenId: ORDEN_AJENA_ID, archivoId: ARCHIVO_AJENO_ID });

    expect(resultado).toEqual({ exito: true, datos: { url: 'https://firmada/archivo' } });
  });

  it.each([
    ['ids que no son UUID', { ordenId: 'x', archivoId: 'y' }],
    ['una clave extra', { ordenId: ORDEN_ID, archivoId: ARCHIVO_ID, ruta: '../secreto' }],
    ['sin entrada', undefined],
  ])('valida la entrada antes de revisar la sesión: %s', async (_caso, entrada) => {
    const resultado = await obtenerUrlArchivoPisoAccion(entrada);

    expect(resultado).toEqual({ exito: false, error: 'Datos inválidos' });
    expect(accesoMock).not.toHaveBeenCalled();
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('no filtra la causa real si la firma falla', async () => {
    firmarMock.mockRejectedValue(new Error('archivo_no_encontrado: bucket secreto'));
    const registro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const resultado = await obtenerUrlArchivoPisoAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_ID });

    expect(resultado.exito).toBe(false);
    expect(JSON.stringify(resultado)).not.toContain('bucket secreto');
    expect(registro).toHaveBeenCalled();
    registro.mockRestore();
  });
});
