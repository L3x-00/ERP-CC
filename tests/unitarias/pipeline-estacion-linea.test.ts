import { describe, expect, it } from 'vitest';
import { filaALineaCotizacion } from '@/modulos/pipeline/tipos/indice';
import {
  esquemaGuardarCotizacion,
  esquemaLineaCotizacion,
} from '@/modulos/pipeline/validaciones/esquemas-cotizacion';

const PIPELINE_ID = '11111111-1111-4111-8111-111111111111';

const FILA = {
  id: '44444444-4444-4444-8444-444444444444',
  pipeline_id: PIPELINE_ID,
  descripcion: 'Placa base',
  cantidad: 4,
  precio_unitario: 320.5,
  material: 'Acero A36',
  espesor: '1/8"',
  area: 0.75,
  procesos: ['corte', 'doblez'],
  area_trabajo_codigo: 'CNC',
  estacion_codigo: 'CNC-01',
  es_externo: false,
  proveedor_externo: null,
  es_descuento: false,
  orden: 0,
  creado_en: '2026-09-01T10:00:00.000Z',
  calculo_tecnico: null,
};

describe('equipo/estación por línea (OBS-04)', () => {
  it('valida la estación como texto opcional y la normaliza vacía a undefined', () => {
    const conEstacion = esquemaLineaCotizacion.parse({
      descripcion: 'Pieza',
      cantidad: 1,
      precioUnitario: 10,
      estacionCodigo: 'CNC-01',
    });
    expect(conEstacion.estacionCodigo).toBe('CNC-01');

    const vacia = esquemaLineaCotizacion.parse({
      descripcion: 'Pieza',
      cantidad: 1,
      precioUnitario: 10,
      estacionCodigo: '   ',
    });
    expect(vacia.estacionCodigo).toBeUndefined();
  });

  it('rechaza estaciones fuera de longitud y en líneas de descuento', () => {
    expect(
      esquemaLineaCotizacion.safeParse({
        descripcion: 'Pieza',
        cantidad: 1,
        precioUnitario: 10,
        estacionCodigo: 'X'.repeat(61),
      }).success,
    ).toBe(false);

    expect(
      esquemaLineaCotizacion.safeParse({
        descripcion: 'Descuento',
        cantidad: 1,
        precioUnitario: 10,
        esDescuento: true,
        estacionCodigo: 'CNC-01',
      }).success,
    ).toBe(false);
  });

  it('el guardado completo conserva la estación por línea', () => {
    const guardado = esquemaGuardarCotizacion.parse({
      pipelineId: PIPELINE_ID,
      lineas: [
        { descripcion: 'Pieza', cantidad: 1, precioUnitario: 10, estacionCodigo: 'CNC-01' },
      ],
    });
    expect(guardado.lineas[0]?.estacionCodigo).toBe('CNC-01');
  });

  it('mapea la fila persistida a la línea del editor', () => {
    const linea = filaALineaCotizacion(FILA);
    expect(linea.estacionCodigo).toBe('CNC-01');

    const sinEstacion = filaALineaCotizacion({ ...FILA, estacion_codigo: null });
    expect(sinEstacion.estacionCodigo).toBeNull();
  });
});
