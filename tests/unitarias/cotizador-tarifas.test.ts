import { describe, expect, it } from 'vitest';
import { esquemaCatalogoTarifas } from '@/modulos/cotizador/validaciones/tarifas';
import {
  CATALOGO_TARIFAS_DEFECTO,
  aplanarCatalogoTarifas,
} from '@/modulos/cotizador/servicios/catalogo-tarifas';
import { calcularCotizacionTecnica } from '@/modulos/cotizador/servicios/calcular-cotizacion-tecnica';
import type { CatalogoTarifasCotizador } from '@/modulos/cotizador/tipos/indice';

/** Construye una entrada láser mínima que toma sus tarifas del catálogo dado. */
function entradaLaserDesdeCatalogo(catalogo: CatalogoTarifasCotizador, material = 'Acero al carbono') {
  return {
    moneda: 'MXN' as const,
    cantidad: 10,
    material,
    espesorMm: 3,
    recargoPorcentaje: 0,
    descuentoPorcentaje: 0,
    laser: {
      material,
      espesorMm: 3,
      perimetroM: 12,
      velocidadMMin: 2,
      perforaciones: 8,
      preparacionHoras: 1,
      costoMaterial: 500,
      gas: 'O2' as const,
      tarifas: {
        maquinaHora: catalogo.laser.maquinaHora,
        preparacionHora: catalogo.laser.preparacionHora,
        consumoGasHora: catalogo.laser.consumoGasHora,
        gas: catalogo.laser.gas,
        segundosPerforacion: { [material]: catalogo.laser.segundosPerforacion['Acero al carbono'] },
      },
    },
  };
}

describe('catálogo central de tarifas del cotizador', () => {
  it('el catálogo por defecto es válido contra el esquema', () => {
    expect(esquemaCatalogoTarifas.safeParse(CATALOGO_TARIFAS_DEFECTO).success).toBe(true);
  });

  it('rechaza catálogos con valores no finitos, negativos o incompletos', () => {
    expect(
      esquemaCatalogoTarifas.safeParse({
        ...CATALOGO_TARIFAS_DEFECTO,
        laser: { ...CATALOGO_TARIFAS_DEFECTO.laser, maquinaHora: Number.NaN },
      }).success,
    ).toBe(false);
    expect(
      esquemaCatalogoTarifas.safeParse({
        ...CATALOGO_TARIFAS_DEFECTO,
        doblado: { ...CATALOGO_TARIFAS_DEFECTO.doblado, factorLongitudMaxima: 1.5 },
      }).success,
    ).toBe(false);
    const sinFabricacion: Record<string, unknown> = { ...CATALOGO_TARIFAS_DEFECTO };
    delete sinFabricacion.fabricacion;
    expect(esquemaCatalogoTarifas.safeParse(sinFabricacion).success).toBe(false);
  });

  it('aplana el catálogo a las claves del formulario del cotizador', () => {
    const plano = aplanarCatalogoTarifas(CATALOGO_TARIFAS_DEFECTO, 'Acero al carbono');
    expect(plano['laser.tarifas.maquinaHora']).toBe(String(CATALOGO_TARIFAS_DEFECTO.laser.maquinaHora));
    expect(plano['laser.tarifas.gas.O2']).toBe(String(CATALOGO_TARIFAS_DEFECTO.laser.gas.O2));
    expect(plano['router.tarifas.endmill']).toBe(String(CATALOGO_TARIFAS_DEFECTO.router.endmill));
    expect(plano['doblado.tarifas.piezasHora.compleja']).toBe(
      String(CATALOGO_TARIFAS_DEFECTO.doblado.piezasHora.compleja),
    );
    expect(plano['fabricacion.tarifas.acabadoHora']).toBe(String(CATALOGO_TARIFAS_DEFECTO.fabricacion.acabadoHora));
  });

  it('toma los tiempos de perforación del material y respalda en Otro', () => {
    const aluminio = aplanarCatalogoTarifas(CATALOGO_TARIFAS_DEFECTO, 'Aluminio');
    expect(aluminio['laser.pierce.hasta3Mm']).toBe(
      String(CATALOGO_TARIFAS_DEFECTO.laser.segundosPerforacion.Aluminio.hasta3Mm),
    );
    const desconocido = aplanarCatalogoTarifas(CATALOGO_TARIFAS_DEFECTO, 'Titanio');
    expect(desconocido['laser.pierce.hasta3Mm']).toBe(
      String(CATALOGO_TARIFAS_DEFECTO.laser.segundosPerforacion.Otro.hasta3Mm),
    );
  });

  it('OBS-30: cambiar una tarifa del catálogo afecta el cálculo nuevo', () => {
    const base = calcularCotizacionTecnica(entradaLaserDesdeCatalogo(CATALOGO_TARIFAS_DEFECTO));
    const catalogoCaro: CatalogoTarifasCotizador = {
      ...CATALOGO_TARIFAS_DEFECTO,
      laser: { ...CATALOGO_TARIFAS_DEFECTO.laser, maquinaHora: CATALOGO_TARIFAS_DEFECTO.laser.maquinaHora * 2 },
    };
    const caro = calcularCotizacionTecnica(entradaLaserDesdeCatalogo(catalogoCaro));
    expect(caro.costoTotal).toBeGreaterThan(base.costoTotal);
    // La instantánea conserva la tarifa con que se calculó (reproducibilidad histórica).
    expect(base.entrada.laser?.tarifas.maquinaHora).toBe(CATALOGO_TARIFAS_DEFECTO.laser.maquinaHora);
  });
});
