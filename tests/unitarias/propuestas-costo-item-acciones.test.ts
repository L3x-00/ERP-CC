import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ejecutarMock } = vi.hoisted(() => ({ ejecutarMock: vi.fn() }));

vi.mock('@/modulos/propuestas/acciones/utilidades-acciones', () => ({
  ejecutarRpcPropuesta: (...args: unknown[]) => ejecutarMock(...args),
  comoJson: (valor: Record<string, unknown>) => valor,
  leerNumero: (datos: unknown, clave: string) =>
    datos && typeof datos === 'object' && typeof (datos as Record<string, unknown>)[clave] === 'number'
      ? ((datos as Record<string, unknown>)[clave] as number)
      : 0,
  leerTexto: (datos: unknown, clave: string) =>
    datos && typeof datos === 'object' && typeof (datos as Record<string, unknown>)[clave] === 'string'
      ? ((datos as Record<string, unknown>)[clave] as string)
      : null,
}));

import { guardarCostoRevisionAccion } from '@/modulos/propuestas/acciones/guardar-costo-revision';
import { eliminarCostoRevisionAccion } from '@/modulos/propuestas/acciones/eliminar-costo-revision';

const REVISION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAS = '2026-11-18T12:00:00.000Z';

beforeEach(() => {
  vi.clearAllMocks();
  ejecutarMock.mockResolvedValue({
    exito: true,
    datos: { revisionId: REVISION, itemId: ITEM, costoTotal: 60 },
  });
});

describe('acciones de costeo interno por ítem', () => {
  it('guarda Material y Otros de un ítem en una sola RPC', async () => {
    const resultado = await guardarCostoRevisionAccion({
      revisionId: REVISION,
      itemId: ITEM,
      actualizadoEn: CAS,
      costos: [
        { categoria: 'material', monto: 40, nota: 'Acero' },
        { categoria: 'gastos_directos', monto: 20 },
      ],
    });

    expect(resultado.exito).toBe(true);
    expect(ejecutarMock).toHaveBeenCalledTimes(1);
    const solicitud = ejecutarMock.mock.calls[0]![0] as { rpc: string; args: Record<string, unknown> };
    expect(solicitud.rpc).toBe('guardar_costo_revision');
    expect(solicitud.args.p_revision_id).toBe(REVISION);
    expect(solicitud.args.p_item_id).toBe(ITEM);
    expect(solicitud.args.p_datos).toMatchObject({
      actualizado_en: CAS,
      costos: [
        { categoria: 'material', monto: 40, nota: 'Acero' },
        { categoria: 'gastos_directos', monto: 20 },
      ],
    });
  });

  it('elimina el costeo completo del ítem con el CAS de la revisión', async () => {
    const resultado = await eliminarCostoRevisionAccion({
      revisionId: REVISION,
      itemId: ITEM,
      actualizadoEn: CAS,
    });

    expect(resultado.exito).toBe(true);
    const solicitud = ejecutarMock.mock.calls[0]![0] as { rpc: string; args: Record<string, unknown> };
    expect(solicitud.rpc).toBe('eliminar_costo_revision');
    expect(solicitud.args.p_item_id).toBe(ITEM);
    expect(solicitud.args.p_datos).toMatchObject({ actualizado_en: CAS });
  });

  it('rechaza montos negativos antes de llamar a la RPC', async () => {
    const resultado = await guardarCostoRevisionAccion({
      revisionId: REVISION,
      itemId: ITEM,
      actualizadoEn: CAS,
      costos: [{ categoria: 'material', monto: -1 }],
    });

    expect(resultado.exito).toBe(false);
    expect(ejecutarMock).not.toHaveBeenCalled();
  });
});
