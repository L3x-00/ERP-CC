import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usuarioMock, puedeMock, firmarMock, tablas, admin } = vi.hoisted(() => {
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
  return { usuarioMock: vi.fn(), puedeMock: vi.fn(), firmarMock: vi.fn(), tablas, admin };
});

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => puedeMock(...argumentos),
}));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: () => admin }));
vi.mock('@/nucleo/almacenamiento/archivos/servicio', () => ({
  firmarLecturaArchivo: (...argumentos: unknown[]) => firmarMock(...argumentos),
}));

import { obtenerUrlArchivoFichaAccion } from '@/modulos/ordenes/acciones/obtener-url-archivo-ficha';

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';
const OTRA_ORDEN_ID = '99999999-9999-4999-8999-999999999999';
const ARCHIVO_ID = '22222222-2222-4222-8222-222222222222';
const ARCHIVO_RETIRADO_ID = '33333333-3333-4333-8333-333333333333';
const ARCHIVO_SIN_FILA_ID = '44444444-4444-4444-8444-444444444444';
const ARCHIVO_AJENO_ID = '55555555-5555-4555-8555-555555555555';

const SNAPSHOT_ORDEN = {
  version: 1,
  orden_id: ORDEN_ID,
  origen: {},
  cabecera: { total: 75000, moneda: 'MXN' },
  items: [{ codigo: 'IT01', precio_unitario: 75000, archivos: [] }],
  archivos: [{ archivo_id: ARCHIVO_ID }, { archivo_id: ARCHIVO_RETIRADO_ID }, { archivo_id: ARCHIVO_SIN_FILA_ID }],
};

function fila(id: string, cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, entidad: 'rfq', entidad_id: 'rfq-1', clase: 'CAD', nombre_original: 'a.dxf', nombre_erp: null,
    mime: 'application/dxf', vigente: true, retirado_en: null, ...cambios,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue({ id: 'usuario', rol: 'vendedor', activo: true });
  // Solo orden_vista: SIN orden_ver_totales ni gestionar_produccion.
  puedeMock.mockImplementation(async (_usuario: unknown, permiso: string) => permiso === 'orden_vista');
  firmarMock.mockResolvedValue('https://firmada/archivo');
  tablas.ordenes_produccion = [
    { id: ORDEN_ID, snapshot_json: SNAPSHOT_ORDEN, propuesta_revision_id: null },
    { id: OTRA_ORDEN_ID, snapshot_json: { ...SNAPSHOT_ORDEN, archivos: [{ archivo_id: ARCHIVO_AJENO_ID }] }, propuesta_revision_id: null },
  ];
  tablas.archivos = [
    fila(ARCHIVO_ID),
    fila(ARCHIVO_RETIRADO_ID, { retirado_en: '2026-10-10T10:00:00.000Z' }),
    fila(ARCHIVO_AJENO_ID),
  ];
  tablas.propuesta_items = [];
});

describe('URL de archivo de la ficha de Orden (O-05)', () => {
  it('firma un archivo que pertenece a la orden con solo orden_vista', async () => {
    const resultado = await obtenerUrlArchivoFichaAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_ID });

    expect(resultado).toEqual({ exito: true, datos: { url: 'https://firmada/archivo' } });
    expect(firmarMock).toHaveBeenCalledWith(admin, ARCHIVO_ID, 300);
    expect(puedeMock).toHaveBeenCalledWith(expect.anything(), 'orden_vista');
    expect(puedeMock).not.toHaveBeenCalledWith(expect.anything(), 'gestionar_produccion');
  });

  it('exige sesión', async () => {
    usuarioMock.mockResolvedValue(null);

    const resultado = await obtenerUrlArchivoFichaAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_ID });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('rechaza a quien no tiene orden_vista antes de tocar la base o el almacenamiento', async () => {
    puedeMock.mockResolvedValue(false);
    const desde = vi.spyOn(admin, 'from');

    const resultado = await obtenerUrlArchivoFichaAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_ID });

    expect(resultado.exito).toBe(false);
    expect(desde).not.toHaveBeenCalled();
    expect(firmarMock).not.toHaveBeenCalled();
    desde.mockRestore();
  });

  it('rechaza un archivo de OTRA orden aunque exista y el usuario tenga orden_vista', async () => {
    const resultado = await obtenerUrlArchivoFichaAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_AJENO_ID });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('rechaza un archivo retirado de la orden', async () => {
    const resultado = await obtenerUrlArchivoFichaAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_RETIRADO_ID });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('rechaza un archivo del snapshot que ya no tiene fila (no disponible)', async () => {
    const resultado = await obtenerUrlArchivoFichaAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_SIN_FILA_ID });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('rechaza una orden inexistente', async () => {
    const resultado = await obtenerUrlArchivoFichaAccion({
      ordenId: '66666666-6666-4666-8666-666666666666', archivoId: ARCHIVO_ID,
    });

    expect(resultado.exito).toBe(false);
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it.each([
    ['ids que no son UUID', { ordenId: 'x', archivoId: 'y' }],
    ['una clave extra', { ordenId: ORDEN_ID, archivoId: ARCHIVO_ID, ruta: '../secreto' }],
    ['sin entrada', undefined],
  ])('valida la entrada: %s', async (_caso, entrada) => {
    const resultado = await obtenerUrlArchivoFichaAccion(entrada);

    expect(resultado).toEqual({ exito: false, error: 'Datos inválidos' });
    expect(usuarioMock).not.toHaveBeenCalled();
    expect(firmarMock).not.toHaveBeenCalled();
  });

  it('no filtra la causa real si la firma falla', async () => {
    firmarMock.mockRejectedValue(new Error('archivo_no_encontrado: bucket secreto'));
    const registro = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const resultado = await obtenerUrlArchivoFichaAccion({ ordenId: ORDEN_ID, archivoId: ARCHIVO_ID });

    expect(resultado.exito).toBe(false);
    expect(JSON.stringify(resultado)).not.toContain('bucket secreto');
    expect(registro).toHaveBeenCalled();
    registro.mockRestore();
  });
});
