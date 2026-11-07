import { describe, expect, it } from 'vitest';

import {
  esquemaCrearEquipo,
  esquemaGuardarGrupoEquipo,
  esquemaGuardarGrupoPlaneado,
} from '@/modulos/catalogos/validaciones/indice';
import { mensajeTarifaFaltante } from '@/modulos/propuestas/servicios/resolver-tarifa';
import { textoTarifa } from '@/modulos/configuracion/componentes/seccion-tarifas-grupos';

const BASE = { codigo: 'LASER', nombre: 'Láser fibra', activo: true, orden: 0 };

describe('tarifas por grupo de equipo y máquina (C3.2)', () => {
  it('el grupo de equipo acepta tarifa no negativa con hasta 4 decimales y moneda MXN/USD', () => {
    expect(esquemaGuardarGrupoEquipo.safeParse({ ...BASE, tarifaHora: 850.5, tarifaMoneda: 'USD' }).success).toBe(true);
    expect(esquemaGuardarGrupoEquipo.safeParse({ ...BASE, tarifaHora: 0 }).success).toBe(true);
    expect(esquemaGuardarGrupoEquipo.safeParse({ ...BASE, tarifaHora: -1 }).success).toBe(false);
    expect(esquemaGuardarGrupoEquipo.safeParse({ ...BASE, tarifaHora: 1.12345 }).success).toBe(false);
    expect(esquemaGuardarGrupoEquipo.safeParse({ ...BASE, tarifaMoneda: 'EUR' }).success).toBe(false);
  });

  it('guardar sin tarifa no la manda (conserva la vigente) y el grupo planeado no la acepta', () => {
    const analisis = esquemaGuardarGrupoEquipo.safeParse(BASE);
    expect(analisis.success && analisis.data.tarifaHora).toBeUndefined();
    expect(esquemaGuardarGrupoPlaneado.safeParse({ ...BASE, tarifaHora: 10 }).success).toBe(false);
  });

  it('el bloqueo de costeo dice qué configurar', () => {
    expect(mensajeTarifaFaltante('tarifa_no_configurada', JSON.stringify({ grupo: 'Láser C32' })))
      .toContain('«Láser C32» no tiene tarifa por hora ni una estación de Tarifas / TC vinculada');
    expect(mensajeTarifaFaltante('tarifa_sin_grupo', JSON.stringify({ recurso: 'Láser 2' })))
      .toContain('«Láser 2» no tiene grupo de equipo ni tarifa propia');
    expect(mensajeTarifaFaltante('tarifa_no_configurada', 'no-json')).toContain('Tarifas por grupo de equipo');
  });

  it('muestra "Sin tarifa" en vez de cero cuando no está configurada', () => {
    expect(textoTarifa({ tarifaHora: null, tarifaMoneda: 'MXN' })).toBe('Sin tarifa');
    expect(textoTarifa({ tarifaHora: 0, tarifaMoneda: 'USD' })).toBe('0.00 USD/h');
  });

  it('el alta guiada de un equipo exige grupo y solo pide tarifa propia al activar la excepción', () => {
    const base = {
      codigo: 'LASER-01',
      nombre: 'Láser Fibra 01',
      grupoEquipoId: '00000000-0000-4000-8000-0000000c3201',
      area: 'sheet_metal',
      activo: true,
    };
    expect(esquemaCrearEquipo.safeParse({ ...base, tarifaPropiaActiva: false }).success).toBe(true);
    expect(
      esquemaCrearEquipo.safeParse({
        ...base,
        tarifaPropiaActiva: true,
        tarifaHora: 650,
        tarifaMoneda: 'MXN',
      }).success,
    ).toBe(true);
    expect(esquemaCrearEquipo.safeParse({ ...base, tarifaPropiaActiva: true }).success).toBe(false);
    expect(
      esquemaCrearEquipo.safeParse({
        ...base,
        grupoEquipoId: undefined,
        tarifaPropiaActiva: false,
      }).success,
    ).toBe(false);
  });
});
