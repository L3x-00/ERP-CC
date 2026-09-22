import { describe, expect, it } from 'vitest';
import { esquemaSnapshotTecnico } from '@/modulos/cotizador/validaciones/snapshot';
import { esquemaLineaCotizacion } from '@/modulos/pipeline/validaciones/esquemas-cotizacion';
import { filaALineaCotizacion } from '@/modulos/pipeline/tipos/indice';
const entrada = { moneda: 'MXN', cantidad: 2, recargoPorcentaje: 25, descuentoPorcentaje: 0, otros: { flete: 100, adicionales: 0 } };
describe('persistencia del cálculo técnico', () => {
  it('conserva la partida comercial al leer un cálculo inválido o desactualizado', () => {
    const fila = { id: 'qa', pipeline_id: 'qa', descripcion: 'Pieza anterior', cantidad: 2, precio_unitario: 62.5, material: null, espesor: null, area: null, procesos: [], area_trabajo_codigo: null, estacion_codigo: null, es_externo: false, proveedor_externo: null, es_descuento: false, orden: 0, creado_en: '', calculo_tecnico: { version: 1, entrada } };
    expect(filaALineaCotizacion(fila).calculoTecnico?.precioUnitario).toBe(62.5);
    expect(filaALineaCotizacion({ ...fila, calculo_tecnico: { version: 9 } }).descripcion).toBe('Pieza anterior');
    expect(filaALineaCotizacion({ ...fila, precio_unitario: 70 }).calculoTecnico).toBeUndefined();
  });
  it('recalcula los resultados enviados por el navegador', () => {
    const r = esquemaSnapshotTecnico.parse({ version: 1, entrada, precioUnitario: 1, costoTotal: 1 });
    expect(r.precioUnitario).toBe(62.5); expect(r.costoTotal).toBe(100);
  });
  it('rechaza precio o cantidad que no corresponden a las entradas', () => {
    const linea = { descripcion: 'Pieza', cantidad: 2, precioUnitario: 62.5, calculoTecnico: { version: 1, entrada } };
    expect(esquemaLineaCotizacion.safeParse(linea).success).toBe(true);
    expect(esquemaLineaCotizacion.safeParse({ ...linea, precioUnitario: 1 }).success).toBe(false);
    expect(esquemaLineaCotizacion.safeParse({ ...linea, cantidad: 3 }).success).toBe(false);
  });
  it('conserva líneas manuales y rechaza versiones o entradas irreproducibles', () => {
    expect(esquemaLineaCotizacion.parse({ descripcion: 'Anterior', cantidad: 1, precioUnitario: 10 }).calculoTecnico).toBeUndefined();
    expect(esquemaSnapshotTecnico.safeParse({ version: 2, entrada }).success).toBe(false);
    expect(esquemaSnapshotTecnico.safeParse({ version: 1, entrada: { ...entrada, cantidad: 0 } }).success).toBe(false);
  });
});
