// Obs. cliente 2026-10-13: un solo tarifario. El grupo de equipo toma su tarifa
// de una estación de Configuración → Tarifas / TC cuando no tiene una propia;
// este espejo TS debe coincidir con `public.resolver_tarifa_hora`.
import { describe, expect, it } from 'vitest';

import { filaAGrupoEquipo } from '@/modulos/catalogos/tipos/indice';
import {
  ESTACIONES_TARIFA,
  ETIQUETA_ESTACION_TARIFA,
  esEstacionTarifa,
  tarifaEfectivaDeGrupo,
  tarifaHoraDeEstacion,
  tarifasPorEstacion,
} from '@/modulos/catalogos/utilidades/tarifa-estacion';
import { esquemaGuardarGrupoEquipo } from '@/modulos/catalogos/validaciones/indice';
import { CATALOGO_TARIFAS_DEFECTO } from '@/modulos/cotizador/servicios/catalogo-tarifas';

describe('tarifaHoraDeEstacion', () => {
  it('toma de Tarifas / TC la tarifa de cada estación (valores por defecto del cotizador)', () => {
    expect(tarifasPorEstacion()).toEqual({
      laser: 650,
      router: 550,
      doblado: 600,
      soldadura: 450,
      mano_obra: 350,
      acabado: 300,
    });
  });

  it('usa los valores guardados en el catálogo, no los de fábrica', () => {
    const catalogo = {
      ...CATALOGO_TARIFAS_DEFECTO,
      laser: { ...CATALOGO_TARIFAS_DEFECTO.laser, maquinaHora: 777.25 },
      fabricacion: { ...CATALOGO_TARIFAS_DEFECTO.fabricacion, acabadoHora: 310 },
    };

    expect(tarifaHoraDeEstacion('laser', catalogo)).toBe(777.25);
    expect(tarifaHoraDeEstacion('acabado', catalogo)).toBe(310);
    expect(tarifaHoraDeEstacion('router', catalogo)).toBe(550);
  });

  it('todas las estaciones tienen etiqueta legible y se reconocen como válidas', () => {
    for (const estacion of ESTACIONES_TARIFA) {
      expect(ETIQUETA_ESTACION_TARIFA[estacion].length).toBeGreaterThan(2);
      expect(esEstacionTarifa(estacion)).toBe(true);
    }
    expect(esEstacionTarifa('plasma')).toBe(false);
    expect(esEstacionTarifa(null)).toBe(false);
  });
});

describe('tarifaEfectivaDeGrupo (espejo de resolver_tarifa_hora)', () => {
  const catalogo = {
    ...CATALOGO_TARIFAS_DEFECTO,
    router: { ...CATALOGO_TARIFAS_DEFECTO.router, maquinaHora: 580 },
  };

  it('la tarifa propia del grupo gana a la estación', () => {
    expect(
      tarifaEfectivaDeGrupo({ tarifaHora: 900, tarifaMoneda: 'USD', estacionTarifa: 'router' }, catalogo),
    ).toEqual({ tarifa: 900, moneda: 'USD', fuente: 'GRUPO', estacion: 'router' });
  });

  it('sin tarifa propia usa la estación vinculada, siempre en MXN', () => {
    expect(
      tarifaEfectivaDeGrupo({ tarifaHora: null, tarifaMoneda: 'USD', estacionTarifa: 'router' }, catalogo),
    ).toEqual({ tarifa: 580, moneda: 'MXN', fuente: 'ESTACION', estacion: 'router' });
  });

  it('una tarifa propia en cero es explícita y no cae a la estación', () => {
    expect(
      tarifaEfectivaDeGrupo({ tarifaHora: 0, tarifaMoneda: 'MXN', estacionTarifa: 'router' }, catalogo)
        ?.fuente,
    ).toBe('GRUPO');
  });

  it('sin tarifa ni estación no hay tarifa (el costeo se bloquea)', () => {
    expect(
      tarifaEfectivaDeGrupo({ tarifaHora: null, tarifaMoneda: 'MXN', estacionTarifa: null }, catalogo),
    ).toBeNull();
  });
});

describe('grupo de equipo: vínculo con la estación', () => {
  const FILA = {
    id: 'g1',
    codigo: 'LASER_FIBRA',
    nombre: 'Láser Fibra',
    activo: true,
    orden: 0,
    creado_en: '2026-10-13T00:00:00.000Z',
    tarifa_hora: null,
    tarifa_moneda: 'MXN',
  };

  it('el mapper conserva una estación válida y descarta una desconocida', () => {
    expect(filaAGrupoEquipo({ ...FILA, estacion_tarifa: 'laser' }).estacionTarifa).toBe('laser');
    expect(filaAGrupoEquipo({ ...FILA, estacion_tarifa: 'plasma' }).estacionTarifa).toBeNull();
    expect(filaAGrupoEquipo({ ...FILA, estacion_tarifa: null }).estacionTarifa).toBeNull();
  });

  it('el esquema acepta una estación conocida o null y rechaza otra', () => {
    const base = { codigo: 'LASER', nombre: 'Láser', activo: true, orden: 0 };

    expect(esquemaGuardarGrupoEquipo.safeParse({ ...base, estacionTarifa: 'doblado' }).success).toBe(
      true,
    );
    expect(esquemaGuardarGrupoEquipo.safeParse({ ...base, estacionTarifa: null }).success).toBe(true);
    expect(esquemaGuardarGrupoEquipo.safeParse({ ...base, estacionTarifa: 'plasma' }).success).toBe(
      false,
    );
    // Sin la clave no se toca el vínculo vigente.
    const sinClave = esquemaGuardarGrupoEquipo.safeParse(base);
    expect(sinClave.success && sinClave.data.estacionTarifa).toBeUndefined();
  });
});
