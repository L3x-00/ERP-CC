import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usuarioMock, canMock, rpcMock, visibilidadMock, desdeMock } = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  canMock: vi.fn(),
  rpcMock: vi.fn(),
  visibilidadMock: vi.fn(),
  desdeMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: (...args: unknown[]) => rpcMock(...args) }),
}));
// Cliente de sesión: `from('pipeline').select('id').in('id', ids)` aplica la RLS.
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: async () => ({
    from: (tabla: string) => {
      desdeMock(tabla);
      return {
        select: (columnas: string) => ({
          in: (columna: string, ids: string[]) => visibilidadMock(columnas, columna, ids),
        }),
      };
    },
  }),
}));

import { validarRfqsListoLoteAccion } from '@/modulos/rfq/acciones/validar-rfqs-listo-lote';
import { MAXIMO_RFQ_VALIDACION_LOTE } from '@/modulos/rfq/tipos/indice';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';
import {
  dividirIdsEnLotes,
  idsRfqParaValidarEnCola,
  validacionConfirmadaDeFila,
  validarRfqsEnCola,
} from '@/modulos/rfq/utilidades/validacion-cola';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

const SECCIONES_VACIAS = { cliente: [], general: [], items: [], archivos: [], seguimiento: [] };
const COMPLETA: ValidacionRfqListo = { listo: true, secciones: SECCIONES_VACIAS };

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

describe('idsRfqParaValidarEnCola', () => {
  it('solo toma los INCOMPLETE; el resto conserva su estado comercial', () => {
    const ids = idsRfqParaValidarEnCola([
      { id: 'a', estadoRfq: 'NEW' },
      { id: 'b', estadoRfq: 'INCOMPLETE' },
      { id: 'c', estadoRfq: 'WAITING_CUSTOMER' },
      { id: 'd', estadoRfq: 'READY_FOR_PROPOSAL' },
      { id: 'e', estadoRfq: 'CONVERTED' },
      { id: 'f', estadoRfq: 'CLOSED' },
      { id: 'g', estadoRfq: 'CANCELLED' },
    ]);
    expect(ids).toEqual(['b']);
  });

  it('no repite ids y devuelve un orden estable aunque cambie el de las filas', () => {
    const filas = [
      { id: 'z', estadoRfq: 'INCOMPLETE' as const },
      { id: 'a', estadoRfq: 'INCOMPLETE' as const },
      { id: 'z', estadoRfq: 'INCOMPLETE' as const },
    ];
    expect(idsRfqParaValidarEnCola(filas)).toEqual(['a', 'z']);
    expect(idsRfqParaValidarEnCola([...filas].reverse())).toEqual(['a', 'z']);
  });

  it('no trunca: devuelve TODOS los Incompletos aunque superen el tope por llamada', () => {
    const filas = Array.from({ length: MAXIMO_RFQ_VALIDACION_LOTE * 2 + 40 }, (_, i) => ({
      id: uuid(i),
      estadoRfq: 'INCOMPLETE' as const,
    }));
    expect(idsRfqParaValidarEnCola(filas)).toHaveLength(MAXIMO_RFQ_VALIDACION_LOTE * 2 + 40);
  });

  it('sin Incompletos no hay nada que consultar', () => {
    expect(idsRfqParaValidarEnCola([{ id: 'a', estadoRfq: 'NEW' }])).toEqual([]);
    expect(idsRfqParaValidarEnCola([])).toEqual([]);
  });
});

describe('dividirIdsEnLotes', () => {
  it('parte en lotes acotados sin perder ni repetir ids', () => {
    const ids = Array.from({ length: 250 }, (_, i) => uuid(i));
    const lotes = dividirIdsEnLotes(ids);
    expect(lotes.map((lote) => lote.length)).toEqual([100, 100, 50]);
    expect(lotes.flat()).toEqual(ids);
  });

  it('respeta un tamaño explícito y una lista vacía no genera lotes', () => {
    expect(dividirIdsEnLotes(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
    expect(dividirIdsEnLotes([])).toEqual([]);
  });
});

describe('validarRfqsEnCola', () => {
  const idsTodos = Array.from({ length: 250 }, (_, i) => uuid(i));

  function respuestaCompleta(rfqIds: string[]): RespuestaAccion<Record<string, ValidacionRfqListo>> {
    return { exito: true, datos: Object.fromEntries(rfqIds.map((id) => [id, COMPLETA])) };
  }

  it('valida más de 100 RFQ en lotes de a lo más 100 y devuelve todos', async () => {
    const validarLote = vi.fn(async ({ rfqIds }: { rfqIds: string[] }) => respuestaCompleta(rfqIds));

    const resultado = await validarRfqsEnCola(idsTodos, validarLote);

    expect(validarLote).toHaveBeenCalledTimes(3);
    for (const [entrada] of validarLote.mock.calls) {
      expect(entrada.rfqIds.length).toBeLessThanOrEqual(MAXIMO_RFQ_VALIDACION_LOTE);
    }
    expect(Object.keys(resultado).sort()).toEqual([...idsTodos].sort());
  });

  it('las llamadas son en serie: nunca dos lotes a la vez', async () => {
    let enVuelo = 0;
    let maximo = 0;
    const validarLote = vi.fn(async ({ rfqIds }: { rfqIds: string[] }) => {
      enVuelo += 1;
      maximo = Math.max(maximo, enVuelo);
      await new Promise((resolver) => setTimeout(resolver, 1));
      enVuelo -= 1;
      return respuestaCompleta(rfqIds);
    });

    await validarRfqsEnCola(idsTodos, validarLote);

    expect(maximo).toBe(1);
  });

  it('un lote con error o excepción no invalida a los demás; sus ids quedan sin validar', async () => {
    const validarLote = vi.fn(async ({ rfqIds }: { rfqIds: string[] }) => {
      if (rfqIds[0] === idsTodos[100]) return { exito: false as const, error: 'falla' };
      if (rfqIds[0] === idsTodos[200]) throw new Error('red');
      return respuestaCompleta(rfqIds);
    });

    const resultado = await validarRfqsEnCola(idsTodos, validarLote);

    expect(validarLote).toHaveBeenCalledTimes(3);
    expect(Object.keys(resultado).sort()).toEqual(idsTodos.slice(0, 100).sort());
    expect(validacionConfirmadaDeFila(resultado, idsTodos[0])).toBe(COMPLETA);
    expect(validacionConfirmadaDeFila(resultado, idsTodos[150])).toBeNull();
    expect(validacionConfirmadaDeFila(resultado, idsTodos[249])).toBeNull();
  });

  it('fallo parcial dentro de un lote (id omitido por el servidor) deja solo ese id sin validar', async () => {
    const validarLote = vi.fn(async ({ rfqIds }: { rfqIds: string[] }) =>
      respuestaCompleta(rfqIds.filter((id) => id !== idsTodos[5])),
    );

    const resultado = await validarRfqsEnCola(idsTodos, validarLote);

    expect(Object.keys(resultado)).toHaveLength(249);
    expect(validacionConfirmadaDeFila(resultado, idsTodos[5])).toBeNull();
  });

  it('si todos los lotes fallan lanza (la consulta queda en error) y sin ids no llama a nada', async () => {
    const validarLote = vi.fn(async () => ({ exito: false as const, error: 'falla' }));
    await expect(validarRfqsEnCola(idsTodos, validarLote)).rejects.toThrow();
    expect(validarLote).toHaveBeenCalledTimes(3);

    const noLlamar = vi.fn();
    expect(await validarRfqsEnCola([], noLlamar)).toEqual({});
    expect(noLlamar).not.toHaveBeenCalled();
  });
});

describe('validacionConfirmadaDeFila', () => {
  it('sin mapa o sin el id no hay validación confirmada', () => {
    expect(validacionConfirmadaDeFila(null, 'a')).toBeNull();
    expect(validacionConfirmadaDeFila({}, 'a')).toBeNull();
  });

  it('devuelve la validación del RFQ pedido', () => {
    expect(validacionConfirmadaDeFila({ a: COMPLETA }, 'a')).toBe(COMPLETA);
  });
});

describe('validarRfqsListoLoteAccion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioMock.mockResolvedValue({ id: 'usuario-1' });
    canMock.mockResolvedValue(true);
    // Por defecto la RLS deja ver todos los ids pedidos.
    visibilidadMock.mockImplementation(async (_columnas: string, _columna: string, ids: string[]) => ({
      data: ids.map((id) => ({ id })),
      error: null,
    }));
    rpcMock.mockResolvedValue({ data: { listo: true, secciones: SECCIONES_VACIAS }, error: null });
  });

  it('rechaza entradas inválidas sin tocar la base', async () => {
    for (const entrada of [
      undefined,
      {},
      { rfqIds: [] },
      { rfqIds: ['no-es-uuid'] },
      { rfqIds: [UUID_A], extra: 1 },
      { rfqIds: Array.from({ length: MAXIMO_RFQ_VALIDACION_LOTE + 1 }, (_, i) => uuid(i)) },
    ]) {
      expect(await validarRfqsListoLoteAccion(entrada)).toEqual({
        exito: false,
        error: 'Datos inválidos',
      });
    }
    expect(visibilidadMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('sin sesión o sin permiso rfq_vista no consulta nada', async () => {
    usuarioMock.mockResolvedValueOnce(null);
    expect(await validarRfqsListoLoteAccion({ rfqIds: [UUID_A] })).toEqual({
      exito: false,
      error: 'No autorizado',
    });

    canMock.mockResolvedValueOnce(false);
    expect(await validarRfqsListoLoteAccion({ rfqIds: [UUID_A] })).toEqual({
      exito: false,
      error: 'Sin permiso para ver RFQ',
    });
    expect(canMock).toHaveBeenCalledWith({ id: 'usuario-1' }, 'rfq_vista');
    expect(visibilidadMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('verifica los ids con el cliente de sesión sobre pipeline ANTES de la RPC admin', async () => {
    const orden: string[] = [];
    visibilidadMock.mockImplementation(async (_c: string, _col: string, ids: string[]) => {
      orden.push('visibilidad');
      return { data: ids.map((id) => ({ id })), error: null };
    });
    rpcMock.mockImplementation(async () => {
      orden.push('rpc');
      return { data: { listo: true, secciones: SECCIONES_VACIAS }, error: null };
    });

    await validarRfqsListoLoteAccion({ rfqIds: [UUID_A, UUID_B] });

    expect(desdeMock).toHaveBeenCalledWith('pipeline');
    expect(visibilidadMock).toHaveBeenCalledTimes(1);
    expect(visibilidadMock).toHaveBeenCalledWith('id', 'id', [UUID_A, UUID_B]);
    expect(orden[0]).toBe('visibilidad');
    expect(orden.slice(1)).toEqual(['rpc', 'rpc']);
  });

  it('un ID no visible por RLS se omite: no se ejecuta la RPC admin ni se revela su existencia', async () => {
    visibilidadMock.mockResolvedValue({ data: [{ id: UUID_A }, { id: UUID_C }], error: null });

    const respuesta = await validarRfqsListoLoteAccion({ rfqIds: [UUID_A, UUID_B, UUID_C] });

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).not.toHaveBeenCalledWith('validar_rfq_listo', { p_rfq_id: UUID_B });
    expect(respuesta.exito).toBe(true);
    expect(Object.keys(respuesta.exito ? (respuesta.datos ?? {}) : {}).sort()).toEqual(
      [UUID_A, UUID_C].sort(),
    );
  });

  it('si ningún ID es visible responde éxito vacío sin llamar a la RPC (no se confunde con fallo)', async () => {
    visibilidadMock.mockResolvedValue({ data: [], error: null });

    expect(await validarRfqsListoLoteAccion({ rfqIds: [UUID_A, UUID_B] })).toEqual({
      exito: true,
      datos: {},
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('si la verificación de visibilidad falla, falla cerrado: no se ejecuta ninguna RPC', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    visibilidadMock.mockResolvedValue({ data: null, error: { message: 'rls' } });

    expect(await validarRfqsListoLoteAccion({ rfqIds: [UUID_A] })).toEqual({
      exito: false,
      error: 'No se pudo validar el RFQ',
    });
    expect(rpcMock).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('usa la RPC validar_rfq_listo de la ficha (p_rfq_id) una vez por RFQ distinto', async () => {
    const respuesta = await validarRfqsListoLoteAccion({ rfqIds: [UUID_A, UUID_B, UUID_A] });

    expect(visibilidadMock).toHaveBeenCalledWith('id', 'id', [UUID_A, UUID_B]);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenCalledWith('validar_rfq_listo', { p_rfq_id: UUID_A });
    expect(rpcMock).toHaveBeenCalledWith('validar_rfq_listo', { p_rfq_id: UUID_B });
    expect(respuesta).toEqual({
      exito: true,
      datos: { [UUID_A]: COMPLETA, [UUID_B]: COMPLETA },
    });
  });

  it('normaliza igual que la ficha: faltantes anulan «listo»', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { listo: true, secciones: { ...SECCIONES_VACIAS, items: ['Falta un ítem'] } },
      error: null,
    });
    const respuesta = await validarRfqsListoLoteAccion({ rfqIds: [UUID_A] });

    expect(respuesta.exito && respuesta.datos?.[UUID_A].listo).toBe(false);
    expect(respuesta.exito && respuesta.datos?.[UUID_A].secciones.items).toEqual(['Falta un ítem']);
  });

  it('si la RPC falla para un RFQ lo omite (no se declara completo) y conserva los demás', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpcMock.mockImplementation((_nombre: string, { p_rfq_id: id }: { p_rfq_id: string }) =>
      Promise.resolve(
        id === UUID_B
          ? { data: null, error: { message: 'falla' } }
          : { data: { listo: true, secciones: SECCIONES_VACIAS }, error: null },
      ),
    );

    const respuesta = await validarRfqsListoLoteAccion({ rfqIds: [UUID_A, UUID_B, UUID_C] });

    expect(respuesta.exito).toBe(true);
    expect(Object.keys(respuesta.exito ? (respuesta.datos ?? {}) : {}).sort()).toEqual(
      [UUID_A, UUID_C].sort(),
    );
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('visible + fallo parcial + no visible en la misma llamada: solo el visible que valida queda', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    visibilidadMock.mockResolvedValue({ data: [{ id: UUID_A }, { id: UUID_B }], error: null });
    rpcMock.mockImplementation((_nombre: string, { p_rfq_id: id }: { p_rfq_id: string }) =>
      Promise.resolve(
        id === UUID_B
          ? { data: null, error: { message: 'falla' } }
          : { data: { listo: true, secciones: SECCIONES_VACIAS }, error: null },
      ),
    );

    const respuesta = await validarRfqsListoLoteAccion({ rfqIds: [UUID_A, UUID_B, UUID_C] });

    expect(respuesta).toEqual({ exito: true, datos: { [UUID_A]: COMPLETA } });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    errorLog.mockRestore();
  });

  it('si fallan todas las RPC de los visibles devuelve error genérico', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rpcMock.mockResolvedValue({ data: null, error: { message: 'falla' } });

    expect(await validarRfqsListoLoteAccion({ rfqIds: [UUID_A, UUID_B] })).toEqual({
      exito: false,
      error: 'No se pudo validar el RFQ',
    });
    errorLog.mockRestore();
  });

  it('con el tope completo limita las RPC simultáneas', async () => {
    let enVuelo = 0;
    let maximoEnVuelo = 0;
    rpcMock.mockImplementation(async () => {
      enVuelo += 1;
      maximoEnVuelo = Math.max(maximoEnVuelo, enVuelo);
      await new Promise((resolver) => setTimeout(resolver, 1));
      enVuelo -= 1;
      return { data: { listo: false, secciones: SECCIONES_VACIAS }, error: null };
    });

    const ids = Array.from({ length: MAXIMO_RFQ_VALIDACION_LOTE }, (_, i) => uuid(i));
    const respuesta = await validarRfqsListoLoteAccion({ rfqIds: ids });

    expect(respuesta.exito).toBe(true);
    expect(rpcMock).toHaveBeenCalledTimes(MAXIMO_RFQ_VALIDACION_LOTE);
    expect(maximoEnVuelo).toBeLessThanOrEqual(8);
  });
});
