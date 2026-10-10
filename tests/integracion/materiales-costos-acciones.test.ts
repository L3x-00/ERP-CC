import { beforeEach, describe, expect, it, vi } from 'vitest';

const { obtenerUsuarioMock, canMock, registrarLogMock, rpcMock } = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
  nuevoCorrelationId: () => 'correlacion-prueba',
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: (...args: unknown[]) => rpcMock(...args) }),
}));

import {
  confirmarCostoMaterialAccion,
} from '@/modulos/inventario/acciones/confirmar-costo-material-accion';
import { proponerCostoMaterialAccion } from '@/modulos/inventario/acciones/proponer-costo-material-accion';

const MATERIAL_ID = '11111111-1111-4111-8111-111111111111';
const PROPUESTA_ID = '22222222-2222-4222-8222-222222222222';

const USUARIO_GESTOR = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'gestor@orca.test',
  nombreCompleto: 'Gestor de materiales',
  rol: 'admin' as const,
  activo: true,
  creadoEn: '2026-08-12T10:00:00.000Z',
  actualizadoEn: '2026-08-12T10:00:00.000Z',
  permisos: [],
};

const ENTRADA_PROPUESTA = {
  materialId: MATERIAL_ID,
  costo: 12.5,
  moneda: 'USD' as const,
  fechaEfectiva: '2026-10-15',
  fuente: 'GASTO' as const,
  referencia: 'GAS-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO_GESTOR);
  canMock.mockResolvedValue(true);
  registrarLogMock.mockResolvedValue(undefined);
  rpcMock.mockResolvedValue({ data: PROPUESTA_ID, error: null });
});

describe('proponerCostoMaterialAccion (C6.1/DC-13)', () => {
  it('exige sesión, datos válidos y permiso antes de llamar a la RPC', async () => {
    obtenerUsuarioMock.mockResolvedValueOnce(null);
    expect(await proponerCostoMaterialAccion(ENTRADA_PROPUESTA)).toEqual({
      exito: false,
      error: 'No autorizado',
    });
    expect(rpcMock).not.toHaveBeenCalled();

    expect(await proponerCostoMaterialAccion({ ...ENTRADA_PROPUESTA, referencia: 'x' })).toEqual({
      exito: false,
      error: 'La referencia debe tener al menos 2 caracteres',
    });
    expect(rpcMock).not.toHaveBeenCalled();

    canMock.mockResolvedValueOnce(false);
    const sinPermiso = await proponerCostoMaterialAccion(ENTRADA_PROPUESTA);
    expect(sinPermiso.exito).toBe(false);
    expect(sinPermiso.exito ? '' : sinPermiso.error).toMatch(/Sin permiso/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('propone con el actor del servidor y registra la auditoría', async () => {
    const resultado = await proponerCostoMaterialAccion(ENTRADA_PROPUESTA);

    expect(resultado).toEqual({ exito: true, datos: { propuestaId: PROPUESTA_ID } });
    expect(rpcMock).toHaveBeenCalledWith('proponer_costo_material', {
      p_material_id: MATERIAL_ID,
      p_costo: 12.5,
      p_moneda: 'USD',
      p_fecha_efectiva: '2026-10-15',
      p_fuente: 'GASTO',
      p_referencia: 'GAS-01',
      p_actor_id: USUARIO_GESTOR.id,
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO_GESTOR,
      'proponer_costo_material',
      'inventario',
      MATERIAL_ID,
      expect.objectContaining({ propuestaId: PROPUESTA_ID, referencia: 'GAS-01' }),
      'correlacion-prueba',
    );
  });

  it('sanitiza el error del servidor cuando el material no existe o está inactivo', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'material_inexistente_o_inactivo' },
    });

    const resultado = await proponerCostoMaterialAccion(ENTRADA_PROPUESTA);
    expect(resultado.exito).toBe(false);
    expect(resultado.exito ? '' : resultado.error).toMatch(/no existe o está inactivo/i);
    expect(registrarLogMock).not.toHaveBeenCalled();
  });
});

describe('confirmarCostoMaterialAccion (C6.1/DC-13)', () => {
  const CONFIRMACION_MANUAL = {
    materialId: MATERIAL_ID,
    costo: 20,
    moneda: 'MXN' as const,
    fechaEfectiva: '2026-10-15',
    fuente: 'MANUAL' as const,
    referencia: null,
    propuestaId: null,
    actualizadoEn: '2026-10-10T12:00:00+00:00',
  };

  it('rechaza una compra sin propuesta antes de llamar a la RPC', async () => {
    const resultado = await confirmarCostoMaterialAccion({
      ...CONFIRMACION_MANUAL,
      fuente: 'COMPRA',
      referencia: 'OC-1',
    });
    expect(resultado.exito).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('confirma costo manual con token CAS y devuelve el costo vigente', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          material_id: MATERIAL_ID,
          costo_vigente: 20,
          moneda_costo: 'MXN',
          actualizado_en: '2026-10-11T09:00:00+00:00',
        },
      ],
      error: null,
    });

    const resultado = await confirmarCostoMaterialAccion(CONFIRMACION_MANUAL);

    expect(resultado).toEqual({
      exito: true,
      datos: {
        materialId: MATERIAL_ID,
        costoVigente: 20,
        monedaCosto: 'MXN',
        actualizadoEn: '2026-10-11T09:00:00+00:00',
      },
    });
    expect(rpcMock).toHaveBeenCalledWith('confirmar_costo_material', {
      p_material_id: MATERIAL_ID,
      p_costo: 20,
      p_moneda: 'MXN',
      p_fecha_efectiva: '2026-10-15',
      p_fuente: 'MANUAL',
      p_referencia: '',
      p_actor_id: USUARIO_GESTOR.id,
      p_actualizado_en: '2026-10-10T12:00:00+00:00',
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO_GESTOR,
      'confirmar_costo_material',
      'inventario',
      MATERIAL_ID,
      expect.objectContaining({ fuente: 'MANUAL', costo: 20 }),
      'correlacion-prueba',
    );
  });

  it('confirma una propuesta enviando su id y traduce la carrera CAS', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          material_id: MATERIAL_ID,
          costo_vigente: 12.5,
          moneda_costo: 'USD',
          actualizado_en: '2026-10-11T09:00:00+00:00',
        },
      ],
      error: null,
    });

    const resultado = await confirmarCostoMaterialAccion({
      materialId: MATERIAL_ID,
      costo: 12.5,
      moneda: 'USD',
      fechaEfectiva: '2026-10-15',
      fuente: 'GASTO',
      referencia: 'GAS-01',
      propuestaId: PROPUESTA_ID,
      actualizadoEn: '2026-10-10T12:00:00+00:00',
    });
    expect(resultado.exito).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      'confirmar_costo_material',
      expect.objectContaining({ p_propuesta_id: PROPUESTA_ID }),
    );

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'material_desactualizado' },
    });
    const carrera = await confirmarCostoMaterialAccion({
      materialId: MATERIAL_ID,
      costo: 12.5,
      moneda: 'USD',
      fechaEfectiva: '2026-10-15',
      fuente: 'GASTO',
      referencia: 'GAS-01',
      propuestaId: PROPUESTA_ID,
      actualizadoEn: '2026-10-10T12:00:00+00:00',
    });
    expect(carrera.exito).toBe(false);
    expect(carrera.exito ? '' : carrera.error).toMatch(/recarga/i);
  });
});
