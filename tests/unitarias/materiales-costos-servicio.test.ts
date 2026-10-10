import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import {
  confirmarCostoMaterialServicio,
  listarHistorialCostos,
  listarMaterialesCostos,
  listarPropuestasCostoPendientes,
  mensajeErrorCosto,
  proponerCostoMaterialServicio,
  type CodigoErrorCostoMaterial,
} from '@/modulos/inventario/servicios/materiales-costos-servicio';

const MATERIAL_ID = '11111111-1111-4111-8111-111111111111';
const PROPUESTA_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

function clienteRpc(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  } as unknown as SupabaseClient<Database>;
}

type ResultadoConsulta = { data: unknown; error: unknown };

function cadena(resultado: ResultadoConsulta, espias?: string[]) {
  const builder: Record<string, unknown> = {};
  const devolver = (metodo: string) => () => {
    espias?.push(metodo);
    return builder;
  };
  builder.select = devolver('select');
  builder.order = devolver('order');
  builder.eq = devolver('eq');
  builder.in = devolver('in');
  builder.limit = devolver('limit');
  builder.then = (
    onFulfilled: (valor: ResultadoConsulta) => unknown,
    onRejected?: (error: unknown) => unknown,
  ) => Promise.resolve(resultado).then(onFulfilled, onRejected);
  return builder;
}

function clienteLectura(
  respuestas: Record<string, ResultadoConsulta>,
  metodos: string[] = [],
) {
  return {
    from: (tabla: string) =>
      cadena(respuestas[tabla] ?? { data: [], error: null }, metodos),
  } as unknown as SupabaseClient<Database>;
}

const FILA_MATERIAL = {
  id: 'm-1',
  codigo: 'ACERO',
  nombre: 'Acero',
  activo: true,
  orden: 1,
  unidad_base: 'kg',
  moneda_costo: 'USD',
  costo_vigente: 12.5,
  fecha_vigencia_costo: '2026-10-15',
  costo_confirmado_en: '2026-10-10T12:00:00+00:00',
  costo_confirmado_por: 'u-1',
  actualizado_en: '2026-10-10T12:00:00+00:00',
};

describe('materiales-costos-servicio — RPC proponer/confirmar (C6.1)', () => {
  it('proponer devuelve el id de la propuesta', async () => {
    const cliente = clienteRpc(PROPUESTA_ID);
    const id = await proponerCostoMaterialServicio(
      cliente,
      {
        materialId: MATERIAL_ID,
        costo: 12.5,
        moneda: 'USD',
        fechaEfectiva: '2026-10-15',
        fuente: 'GASTO',
        referencia: 'GAS-01',
      },
      ACTOR_ID,
    );
    expect(id).toBe(PROPUESTA_ID);
  });

  it('proponer mapea los códigos de error del servidor', async () => {
    const casos: [string, CodigoErrorCostoMaterial][] = [
      ['material_desactualizado', 'material_desactualizado'],
      ['material_inexistente_o_inactivo', 'material_inexistente_o_inactivo'],
      ['sin_permiso_materiales', 'sin_permiso_materiales'],
      ['algo_raro', 'desconocido'],
    ];
    for (const [mensaje, esperado] of casos) {
      const cliente = clienteRpc(null, { message: mensaje });
      await expect(
        proponerCostoMaterialServicio(
          cliente,
          {
            materialId: MATERIAL_ID,
            costo: 1,
            moneda: 'MXN',
            fechaEfectiva: '2026-10-15',
            fuente: 'COMPRA',
            referencia: 'OC-1',
          },
          ACTOR_ID,
        ),
      ).rejects.toMatchObject({ codigo: esperado });
    }
  });

  it('confirmar devuelve el costo vigente y mapea fila vacía a desconocido', async () => {
    const cliente = clienteRpc([
      {
        material_id: 'm-1',
        costo_vigente: 20,
        moneda_costo: 'MXN',
        actualizado_en: '2026-10-11T09:00:00+00:00',
      },
    ]);
    const confirmado = await confirmarCostoMaterialServicio(
      cliente,
      {
        materialId: MATERIAL_ID,
        costo: 20,
        moneda: 'MXN',
        fechaEfectiva: '2026-10-15',
        fuente: 'MANUAL',
        referencia: null,
        propuestaId: null,
        actualizadoEn: '2026-10-10T12:00:00+00:00',
      },
      ACTOR_ID,
    );
    expect(confirmado).toEqual({
      materialId: 'm-1',
      costoVigente: 20,
      monedaCosto: 'MXN',
      actualizadoEn: '2026-10-11T09:00:00+00:00',
    });

    const vacio = clienteRpc([]);
    await expect(
      confirmarCostoMaterialServicio(
        vacio,
        {
          materialId: MATERIAL_ID,
          costo: 20,
          moneda: 'MXN',
          fechaEfectiva: '2026-10-15',
          fuente: 'MANUAL',
          referencia: null,
          propuestaId: null,
          actualizadoEn: '2026-10-10T12:00:00+00:00',
        },
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ codigo: 'desconocido' });
  });

  it('expone mensajes saneados por código', () => {
    expect(mensajeErrorCosto('costo_requiere_confirmacion')).toMatch(/confirmación autorizada/i);
    expect(mensajeErrorCosto('material_desactualizado')).toMatch(/recarga/i);
  });
});

describe('materiales-costos-servicio — lecturas (C6.1)', () => {
  it('lista materiales con costo, confirmador y propuestas pendientes', async () => {
    const cliente = clienteLectura({
      catalogo_materiales: { data: [FILA_MATERIAL], error: null },
      propuestas_costo_material: {
        data: [{ material_id: 'm-1' }, { material_id: 'm-1' }],
        error: null,
      },
      usuarios: { data: [{ id: 'u-1', nombre_completo: 'Ana QA' }], error: null },
    });

    const materiales = await listarMaterialesCostos(cliente);
    expect(materiales).toHaveLength(1);
    expect(materiales[0]).toMatchObject({
      id: 'm-1',
      unidadBase: 'kg',
      monedaCosto: 'USD',
      costoVigente: 12.5,
      fechaVigenciaCosto: '2026-10-15',
      costoConfirmadoPorNombre: 'Ana QA',
      propuestasPendientes: 2,
    });
  });

  it('lista propuestas pendientes con material y proponente resueltos', async () => {
    const cliente = clienteLectura({
      propuestas_costo_material: {
        data: [
          {
            id: 'p-1',
            material_id: 'm-1',
            costo_propuesto: 20,
            moneda: 'MXN',
            fecha_efectiva: '2026-10-20',
            fuente: 'COMPRA',
            referencia: 'OC-1',
            propuesto_por: 'u-2',
            propuesto_en: '2026-10-11T09:00:00+00:00',
          },
        ],
        error: null,
      },
      catalogo_materiales: { data: [FILA_MATERIAL], error: null },
      usuarios: { data: [{ id: 'u-2', nombre_completo: 'Luis Compras' }], error: null },
    });

    const propuestas = await listarPropuestasCostoPendientes(cliente);
    expect(propuestas[0]).toMatchObject({
      id: 'p-1',
      materialCodigo: 'ACERO',
      materialNombre: 'Acero',
      costoPropuesto: 20,
      moneda: 'MXN',
      fuente: 'COMPRA',
      referencia: 'OC-1',
      propuestoPorNombre: 'Luis Compras',
    });
  });

  it('lista el historial y filtra por material cuando se pide', async () => {
    const metodos: string[] = [];
    const cliente = clienteLectura(
      {
        historial_costos_material: {
          data: [
            {
              id: 'h-1',
              material_id: 'm-1',
              costo_anterior: null,
              moneda_anterior: null,
              costo_nuevo: 12.5,
              moneda_nueva: 'USD',
              fecha_efectiva: '2026-10-15',
              fuente: 'MANUAL',
              referencia: null,
              actor_id: 'u-1',
              confirmado_en: '2026-10-10T12:00:00+00:00',
            },
          ],
          error: null,
        },
        catalogo_materiales: { data: [FILA_MATERIAL], error: null },
        usuarios: { data: [{ id: 'u-1', nombre_completo: 'Ana QA' }], error: null },
      },
      metodos,
    );

    const versiones = await listarHistorialCostos(cliente, { materialId: 'm-1' });
    expect(versiones[0]).toMatchObject({
      materialCodigo: 'ACERO',
      costoAnterior: null,
      costoNuevo: 12.5,
      monedaNueva: 'USD',
      fuente: 'MANUAL',
      actorNombre: 'Ana QA',
    });
    expect(metodos).toContain('eq');
  });

  it('un error de catálogo se propaga como ErrorCostoMaterial', async () => {
    const cliente = clienteLectura({
      catalogo_materiales: { data: null, error: { message: 'boom' } },
    });
    await expect(listarMaterialesCostos(cliente)).rejects.toMatchObject({
      name: 'ErrorCostoMaterial',
      codigo: 'desconocido',
    });
  });
});
