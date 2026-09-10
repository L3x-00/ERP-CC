import { beforeEach, describe, expect, it } from 'vitest';
import { usarTiendaConfiguracion } from '@/estado/uso-tienda-configuracion';
import type { DatosInicialesConfiguracion } from '@/estado/uso-tienda-configuracion';

const DATOS: DatosInicialesConfiguracion = {
  configuracion: {
    id: 'main',
    empresa: { nombre: 'Empresa', razonSocial: 'Empresa S de RL', rfc: 'XAXX010101000', direccion: 'Tijuana', telefono: '', email: '', logoUrl: null },
    tarifas: { costoHoraDefault: 650, segundosPorPierce: 8, factorEficienciaLaser: 0.85, factorMermaMaterial: 0.08, margenUtilidadDefault: 30 },
    plantillasDoc: { T1: { colorAcento: '#1D4ED8', terminosCondiciones: 'Términos', textoPiePagina: 'Pie', textoEncabezado: 'ORCA' } },
    tipoCambioUsd: 20,
    ivaPorcentajeDefault: 16,
    actualizadoPor: null,
    actualizadoEn: '2026-09-09T00:00:00.000Z',
  },
  cuentasBancarias: [],
  areasTrabajo: [],
};

beforeEach(() => usarTiendaConfiguracion.getState().limpiar());

describe('usarTiendaConfiguracion', () => {
  it('mantiene un snapshot efímero y copias defensivas de catálogos', () => {
    usarTiendaConfiguracion.getState().establecerDatos(DATOS);
    expect(usarTiendaConfiguracion.getState().configuracion?.tipoCambioUsd).toBe(20);
    expect(usarTiendaConfiguracion.getState().cuentasBancarias).toEqual([]);
    expect(Object.keys(usarTiendaConfiguracion.getState())).not.toContain('serviceRole');
  });

  it('incrementa la revisión sin alterar autorización ni datos de servidor', () => {
    usarTiendaConfiguracion.getState().establecerDatos(DATOS);
    const antes = usarTiendaConfiguracion.getState().revisionConfiguracion;
    usarTiendaConfiguracion.getState().notificarActualizacion();
    expect(usarTiendaConfiguracion.getState().revisionConfiguracion).toBe(antes + 1);
    expect(usarTiendaConfiguracion.getState().configuracion?.id).toBe('main');
  });
});
