import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  canMock,
  registrarLogMock,
  actualizarConfiguracionMock,
  guardarCuentaMock,
  guardarAreaMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  actualizarConfiguracionMock: vi.fn(),
  guardarCuentaMock: vi.fn(),
  guardarAreaMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => canMock(...argumentos),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...argumentos: unknown[]) => registrarLogMock(...argumentos),
}));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: () => ({}) }));
vi.mock('@/modulos/configuracion/servicios/indice', () => ({
  actualizarConfiguracionSeccion: (...argumentos: unknown[]) => actualizarConfiguracionMock(...argumentos),
  guardarCuentaBancariaServicio: (...argumentos: unknown[]) => guardarCuentaMock(...argumentos),
  guardarAreaTrabajoServicio: (...argumentos: unknown[]) => guardarAreaMock(...argumentos),
}));

import {
  actualizarTipoCambioAccion,
  crearActualizarCuentaBancariaAccion,
  guardarAreaTrabajoAccion,
  guardarDatosEmpresaAccion,
  guardarPlantillaDocAccion,
  guardarTarifasCotizadorAccion,
} from '@/modulos/configuracion/acciones/indice';
import { CATALOGO_TARIFAS_DEFECTO } from '@/modulos/cotizador/servicios/catalogo-tarifas';

const CONFIGURACION = {
  id: 'main' as const,
  empresa: {
    nombre: 'CC Manufacturing Group', razonSocial: 'CC Manufacturing Group S de RL de CV',
    rfc: 'XAXX010101000', direccion: 'Tijuana, Baja California', telefono: '', email: '', logoUrl: null,
  },
  tarifas: { costoHoraDefault: 650, segundosPorPierce: 8, factorEficienciaLaser: 0.85, factorMermaMaterial: 0.08, margenUtilidadDefault: 30, estaciones: CATALOGO_TARIFAS_DEFECTO },
  plantillasDoc: { T1: { colorAcento: '#1D4ED8', terminosCondiciones: 'Pago contra entrega', textoPiePagina: 'Tijuana', textoEncabezado: 'ORCA MFG ERP' } },
  tipoCambioUsd: 20, ivaPorcentajeDefault: 16, actualizadoPor: null, actualizadoEn: '2026-09-09T00:00:00.000Z',
};
const BASE = {
  id: '10000000-0000-4000-8000-000000000001', email: 'usuario@orca.test', nombreCompleto: 'Usuario de prueba',
  rol: 'vendedor' as const, activo: true, creadoEn: '2026-09-09T00:00:00.000Z', actualizadoEn: '2026-09-09T00:00:00.000Z', permisos: [] as string[],
};
const CUENTA = { id: '20000000-0000-4000-8000-000000000001', banco: 'BBVA', numeroCuenta: '0123456789', clabe: null, moneda: 'MXN' as const, titular: 'CC Manufacturing Group', activa: true, creadoEn: '2026-09-09T00:00:00.000Z', actualizadoEn: '2026-09-09T00:00:00.000Z' };
const AREA = { id: '30000000-0000-4000-8000-000000000001', codigo: 'LASER_01', nombre: 'Corte láser', colorHex: '#3B82F6', costoHoraInterno: 650, tarifaHoraVenta: 1100, esExterno: false, activo: true, orden: 1, creadoEn: '2026-09-09T00:00:00.000Z', actualizadoEn: '2026-09-09T00:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(BASE);
  canMock.mockImplementation(async (usuario: { rol: string; permisos: string[] }) => usuario.rol === 'admin' || usuario.permisos.includes('configuracion'));
  registrarLogMock.mockResolvedValue(undefined);
  actualizarConfiguracionMock.mockResolvedValue(CONFIGURACION);
  guardarCuentaMock.mockResolvedValue(CUENTA);
  guardarAreaMock.mockResolvedValue(AREA);
});

describe('acciones protegidas de configuración', () => {
  it.each(['vendedor', 'contador', 'operador'] as const)('%s no puede modificar el tipo de cambio', async (rol) => {
    obtenerUsuarioMock.mockResolvedValue({ ...BASE, rol });
    await expect(actualizarTipoCambioAccion({ tipoCambioUsd: 19.75 })).resolves.toEqual({
      exito: false,
      error: 'Sin permiso para configurar el sistema',
    });
    expect(actualizarConfiguracionMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('un admin actualiza tipo de cambio y genera auditoría', async () => {
    const admin = { ...BASE, rol: 'admin' as const };
    obtenerUsuarioMock.mockResolvedValue(admin);
    const respuesta = await actualizarTipoCambioAccion({ tipoCambioUsd: 19.75 });
    expect(respuesta).toEqual({ exito: true, datos: CONFIGURACION });
    expect(actualizarConfiguracionMock).toHaveBeenCalledWith(expect.anything(), 'tipo_cambio', 19.75, admin.id);
    expect(registrarLogMock).toHaveBeenCalledWith(admin, 'actualizar_tipo_cambio', 'configuracion', 'main', expect.anything());
  });

  it('un gerente con permiso puede guardar empresa, tarifas, plantilla, cuenta y área', async () => {
    const gerente = { ...BASE, rol: 'gerente' as const, permisos: ['configuracion'] };
    obtenerUsuarioMock.mockResolvedValue(gerente);
    await expect(guardarDatosEmpresaAccion(CONFIGURACION.empresa)).resolves.toMatchObject({ exito: true });
    await expect(guardarTarifasCotizadorAccion(CONFIGURACION.tarifas)).resolves.toMatchObject({ exito: true });
    await expect(guardarPlantillaDocAccion({ clave: 'T1', ...CONFIGURACION.plantillasDoc.T1 })).resolves.toMatchObject({ exito: true });
    await expect(crearActualizarCuentaBancariaAccion({ banco: CUENTA.banco, numeroCuenta: CUENTA.numeroCuenta, clabe: null, moneda: CUENTA.moneda, titular: CUENTA.titular, activa: true })).resolves.toMatchObject({ exito: true });
    await expect(guardarAreaTrabajoAccion({ codigo: AREA.codigo, nombre: AREA.nombre, colorHex: AREA.colorHex, costoHoraInterno: AREA.costoHoraInterno, tarifaHoraVenta: AREA.tarifaHoraVenta, esExterno: false, activo: true, orden: 1 })).resolves.toMatchObject({ exito: true });
    expect(registrarLogMock).toHaveBeenCalledTimes(5);
  });
});
