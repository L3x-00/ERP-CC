import { describe, expect, it, vi } from 'vitest';

import { obtenerTotalesCorridasOrdenServicio } from '@/modulos/produccion/servicios/totales-corrida-servicio';

vi.mock('@/modulos/gastos/servicios/indice', () => ({
  obtenerRentabilidadOrdenServicio: vi.fn(async () => ({ costoTotalMxn: 900 })),
}));

const ORDEN = '11111111-1111-4111-8111-111111111111';
const C1 = '22222222-2222-4222-8222-222222222222';
const C2 = '33333333-3333-4333-8333-333333333333';

function consulta(datos: unknown[]) {
  const objeto = {
    select: () => objeto,
    eq: () => objeto,
    order: () => objeto,
    in: () => objeto,
    then: (resolver: (valor: unknown) => unknown, rechazar?: (error: unknown) => unknown) =>
      Promise.resolve({ data: datos, error: null }).then(resolver, rechazar),
  };
  return objeto;
}

function admin(datosPorTabla: Record<string, unknown[]>) {
  return {
    from: (tabla: string) => consulta(datosPorTabla[tabla] ?? []),
  } as never;
}

const DATOS = {
  corridas: [
    { id: C1, codigo: 'LAS01', estado: 'COMPLETADA' },
    { id: C2, codigo: 'DOB01', estado: 'EN_PROCESO' },
  ],
  sesiones_trabajo: [
    { corrida_id: C1, horas_netas: 1.5, piezas_producidas: 10, costo_hora_interno: 100, sesion_invalida: false },
    { corrida_id: C1, horas_netas: 2, piezas_producidas: 99, costo_hora_interno: 100, sesion_invalida: true },
  ],
  registros_consumo_material: [
    { corrida_id: C1, cantidad_usada: 3, cantidad_scrap: 1, costo_unitario_momento: 50 },
  ],
};

describe('totales de corrida (C4)', () => {
  it('agrega tiempo y material por corrida y excluye sesiones inválidas', async () => {
    const resultado = await obtenerTotalesCorridasOrdenServicio(admin(DATOS), {
      ordenId: ORDEN,
      incluirCostos: false,
    });

    expect(resultado.corridas).toHaveLength(2);
    const primera = resultado.corridas[0]!;
    expect(primera.horasTotales).toBe(1.5);
    expect(primera.piezasProducidas).toBe(10);
    expect(primera.cantidadMaterial).toBe(4);
    expect(primera.costoTotalMxn).toBeNull();
    expect(resultado.costoTotalOrdenMxn).toBeNull();
    expect(resultado.corridas[1]!.horasTotales).toBe(0);
  });

  it('calcula costo de material y tiempo solo cuando se permite ver costos', async () => {
    const resultado = await obtenerTotalesCorridasOrdenServicio(admin(DATOS), {
      ordenId: ORDEN,
      incluirCostos: true,
    });

    const primera = resultado.corridas[0]!;
    expect(primera.costoMaterialMxn).toBe(200);
    expect(primera.costoTiempoMxn).toBe(150);
    expect(primera.costoTotalMxn).toBe(350);
    expect(resultado.costoTotalOrdenMxn).toBe(900);
  });
});
