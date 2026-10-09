import { describe, expect, it } from 'vitest';

import { calcularTotalesPropuesta } from '@/modulos/propuestas/servicios/calcular-totales-propuesta';
import { traducirErrorPropuesta } from '@/modulos/propuestas/servicios/errores-propuesta';

const ITEMS = [{ cantidad: 10, precioUnitario: 100, esDescuento: false, activo: true }];

describe('costeo de ruteo sin doble conteo (C3.3)', () => {
  it('con ruteo costeado el manual de máquina no se suma (espejo del SQL)', () => {
    const totales = calcularTotalesPropuesta({
      items: ITEMS,
      costoTotal: 1049, // máquina 999 + material 50
      costoManualMaquina: 999,
      costoRuteo: 350,
      ruteoCosteado: true,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    expect(totales.costoManual).toBe(50);
    expect(totales.costoRuteo).toBe(350);
    expect(totales.costoTotal).toBe(400);
    expect(totales.margen).toBe(0.6);
  });

  it('sin ruteo costeado se conserva el costo manual completo', () => {
    const totales = calcularTotalesPropuesta({
      items: ITEMS,
      costoTotal: 1049,
      costoManualMaquina: 999,
      ivaPorcentaje: 16,
      moneda: 'MXN',
    });
    expect(totales.costoTotal).toBe(1049);
    expect(totales.costoRuteo).toBe(0);
  });

  it('los bloqueos de costeo dicen qué configurar', () => {
    expect(traducirErrorPropuesta('tarifa_no_configurada', JSON.stringify({ grupo: 'Láser' })))
      .toContain('«Láser» no tiene tarifa por hora');
    expect(traducirErrorPropuesta('tarifa_moneda_distinta')).toContain('otra moneda');
    expect(traducirErrorPropuesta('ruteo_vacio')).toContain('No hay renglones');
  });
});

describe('Orden pendiente (C4.1)', () => {
  it('traduce la causa del gate a un mensaje legible', async () => {
    const { mensajeCausaOrden } = await import('@/modulos/ordenes/utilidades/mensajes-orden');
    expect(mensajeCausaOrden('cliente_no_activo')).toContain('no está activo');
    expect(mensajeCausaOrden('credito_limite_excedido: detalle')).toContain('límite de crédito');
    expect(mensajeCausaOrden('otro_error')).toContain('reintenta');
    expect(mensajeCausaOrden(null)).toContain('aún no se ha procesado');
  });
});
