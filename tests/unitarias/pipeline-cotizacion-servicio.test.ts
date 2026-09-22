import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  ErrorCotizacion,
  guardarCotizacionServicio,
  mensajeErrorCotizacion,
} from '@/modulos/pipeline/servicios/cotizacion-servicio';
import type { GuardarCotizacionInput } from '@/modulos/pipeline/validaciones/esquemas-cotizacion';

const PIPELINE_ID = '11111111-1111-4111-8111-111111111111';

/** Cliente mínimo: solo `rpc`, que es lo único que usa el servicio. */
function clienteConRespuesta(respuesta: unknown) {
  const rpc = vi.fn().mockResolvedValue(respuesta);
  return { cliente: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

const ENTRADA: GuardarCotizacionInput = {
  pipelineId: PIPELINE_ID,
  lineas: [
    {
      descripcion: 'Placa base',
      cantidad: 4,
      precioUnitario: 320.5,
      material: 'Acero A36',
      espesor: '1/8"',
      area: 0.75,
      procesos: ['corte', 'doblez'],
      esExterno: false,
      esDescuento: false,
    },
    { descripcion: 'Barreno', cantidad: 8, precioUnitario: 12, procesos: [], esExterno: false, esDescuento: false },
  ],
  actualizadoEnEsperado: '2026-09-13T10:00:00.000Z',
};

describe('guardarCotizacionServicio', () => {
  it('envía las líneas en snake_case y el token esperado en una sola llamada', async () => {
    const { cliente, rpc } = clienteConRespuesta({
      data: [
        {
          pipeline_id: PIPELINE_ID,
          lineas_guardadas: 2,
          actualizado_en: '2026-09-13T11:00:00.000Z',
        },
      ],
      error: null,
    });

    const resultado = await guardarCotizacionServicio(cliente, ENTRADA);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('guardar_cotizacion_atomica', {
      p_pipeline_id: PIPELINE_ID,
      p_actualizado_en_esperado: '2026-09-13T10:00:00.000Z',
      p_lineas: [
        {
          descripcion: 'Placa base',
          cantidad: 4,
          precio_unitario: 320.5,
          material: 'Acero A36',
          espesor: '1/8"',
          area: 0.75,
          procesos: ['corte', 'doblez'],
          area_trabajo_codigo: null,
          estacion_codigo: null,
          es_externo: false,
          proveedor_externo: null,
          es_descuento: false,
        },
        {
          descripcion: 'Barreno',
          cantidad: 8,
          precio_unitario: 12,
          material: null,
          espesor: null,
          area: null,
          procesos: [],
          area_trabajo_codigo: null,
          estacion_codigo: null,
          es_externo: false,
          proveedor_externo: null,
          es_descuento: false,
        },
      ],
    });
    expect(resultado).toEqual({
      pipelineId: PIPELINE_ID,
      lineasGuardadas: 2,
      actualizadoEn: '2026-09-13T11:00:00.000Z',
    });
  });

  it('omite el token cuando la llamada no lo trae (compatibilidad)', async () => {
    const { cliente, rpc } = clienteConRespuesta({
      data: [
        {
          pipeline_id: PIPELINE_ID,
          lineas_guardadas: 1,
          actualizado_en: '2026-09-13T11:00:00.000Z',
        },
      ],
      error: null,
    });

    await guardarCotizacionServicio(cliente, {
      pipelineId: PIPELINE_ID,
      lineas: [
        { descripcion: 'Placa', cantidad: 1, precioUnitario: 10, procesos: [], esExterno: false, esDescuento: false },
      ],
    });

    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_actualizado_en_esperado');
  });

  it.each([
    ['cotizacion_conflicto', 'cotizacion_conflicto'],
    ['cotizacion_no_editable', 'cotizacion_no_editable'],
    ['cotizacion_con_orden', 'cotizacion_con_orden'],
    ['usuario_sin_acceso_oportunidad', 'usuario_sin_acceso_oportunidad'],
    ['oportunidad_inexistente', 'oportunidad_inexistente'],
    ['cotizacion_lineas_invalidas', 'cotizacion_lineas_invalidas'],
  ])('mapea el error %s de Postgres a su código de negocio', async (mensaje, codigo) => {
    const { cliente } = clienteConRespuesta({
      data: null,
      error: { message: `error: ${mensaje}` },
    });

    await expect(guardarCotizacionServicio(cliente, ENTRADA)).rejects.toMatchObject({
      name: 'ErrorCotizacion',
      codigo,
    });
  });

  it('un error no catalogado queda como desconocido', async () => {
    const { cliente } = clienteConRespuesta({
      data: null,
      error: { message: 'permission denied for table cotizacion_lineas' },
    });

    await expect(guardarCotizacionServicio(cliente, ENTRADA)).rejects.toMatchObject({
      codigo: 'desconocido',
    });
  });

  it('una respuesta vacía no se toma como guardado correcto', async () => {
    const { cliente } = clienteConRespuesta({ data: [], error: null });

    await expect(guardarCotizacionServicio(cliente, ENTRADA)).rejects.toBeInstanceOf(
      ErrorCotizacion,
    );
  });
});

describe('mensajeErrorCotizacion', () => {
  it('explica el conflicto de concurrencia sin exponer detalle interno', () => {
    const mensaje = mensajeErrorCotizacion(
      new ErrorCotizacion('cotizacion_conflicto', 'raise exception ... pipeline'),
    );

    expect(mensaje).toContain('cambió mientras editabas');
    expect(mensaje).not.toContain('pipeline');
  });

  it('cualquier error ajeno cae al mensaje genérico', () => {
    expect(mensajeErrorCotizacion(new Error('42501 permission denied'))).toBe(
      'No se pudo guardar la cotización',
    );
  });
});
