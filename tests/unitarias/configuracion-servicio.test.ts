import { describe, expect, it } from 'vitest';
import {
  combinarConfiguracion,
  type ClienteConfiguracion,
} from '@/modulos/configuracion/servicios/indice';
import type { FilaConfiguracionSistema } from '@/modulos/configuracion/tipos/indice';

function fila(parcial: Partial<FilaConfiguracionSistema> = {}): FilaConfiguracionSistema {
  return {
    id: 'main',
    empresa_json: {},
    tarifas_json: {},
    plantillas_doc_json: {},
    tipo_cambio_usd: 19.5,
    iva_porcentaje_default: 16,
    actualizado_por: null,
    actualizado_en: '2026-09-09T00:00:00.000Z',
    ...parcial,
  };
}

describe('servicio central de configuración', () => {
  it('devuelve fallbacks completos cuando la fila aún no existe', () => {
    const resultado = combinarConfiguracion(null);
    expect(resultado.id).toBe('main');
    expect(resultado.empresa.nombre).toBe('CC Manufacturing Group');
    expect(resultado.tarifas.segundosPorPierce).toBeGreaterThan(0);
    expect(resultado.plantillasDoc.T1.colorAcento).toMatch(/^#/);
    expect(resultado.tipoCambioUsd).toBe(20);
  });

  it('fusiona bloques parciales sin perder los valores faltantes', () => {
    const resultado = combinarConfiguracion(fila({
      empresa_json: { nombre: 'Empresa ficticia' },
      tarifas_json: { costoHoraDefault: 900 },
      plantillas_doc_json: { T1: { colorAcento: '#16A34A' } },
    }));
    expect(resultado.empresa.nombre).toBe('Empresa ficticia');
    expect(resultado.empresa.razonSocial).toContain('CC Manufacturing');
    expect(resultado.tarifas.costoHoraDefault).toBe(900);
    expect(resultado.tarifas.margenUtilidadDefault).toBe(30);
    expect(resultado.plantillasDoc.T1.colorAcento).toBe('#16A34A');
    expect(resultado.plantillasDoc.T1.textoPiePagina).toContain('CC Manufacturing');
  });

  it('descarta valores numéricos no finitos o incompatibles', () => {
    const resultado = combinarConfiguracion(fila({
      tipo_cambio_usd: Number.NaN,
      iva_porcentaje_default: -1,
      tarifas_json: { costoHoraDefault: Number.POSITIVE_INFINITY },
    }));
    expect(resultado.tipoCambioUsd).toBe(20);
    expect(resultado.ivaPorcentajeDefault).toBe(16);
    expect(resultado.tarifas.costoHoraDefault).toBe(650);
  });

  it('acepta una plantilla raíz histórica y la expone como T1', () => {
    const resultado = combinarConfiguracion(fila({
      plantillas_doc_json: {
        colorAcento: '#DC2626',
        terminosCondiciones: 'Condiciones ficticias',
      },
    }));
    expect(resultado.plantillasDoc.T1.colorAcento).toBe('#DC2626');
    expect(resultado.plantillasDoc.T1.terminosCondiciones).toBe('Condiciones ficticias');
  });

  it('mantiene la frontera tipada del cliente Supabase', () => {
    const cliente: ClienteConfiguracion | null = null;
    expect(cliente).toBeNull();
  });
});
