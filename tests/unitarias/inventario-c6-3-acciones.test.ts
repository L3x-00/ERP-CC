import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usuarioMock, adminMock, logMock, permisoMock } = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  adminMock: vi.fn(),
  logMock: vi.fn(),
  permisoMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => adminMock(),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  nuevoCorrelationId: () => 'corr-c6-3',
  registrarLog: (...args: unknown[]) => logMock(...args),
}));
vi.mock('@/modulos/inventario/servicios/permiso-inventario', () => ({
  puedeGestionarInventario: (...args: unknown[]) => permisoMock(...args),
}));

import { registrarEntradaAccion } from '@/modulos/inventario/acciones/registrar-entrada-accion';
import { registrarSalidaAccion } from '@/modulos/inventario/acciones/registrar-salida-accion';
import { crearMaterialAccion } from '@/modulos/inventario/acciones/crear-material-accion';

const USUARIO = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'gerencia@orca.test',
  nombreCompleto: 'Gerencia',
  rol: 'gerente',
  permisos: ['gestionar_inventario'],
  activo: true,
};

describe('retiro operativo del inventario legado C6.3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioMock.mockResolvedValue(USUARIO);
    permisoMock.mockResolvedValue(true);
  });

  it('rechaza una entrada válida sin abrir el cliente administrador', async () => {
    const resultado = await registrarEntradaAccion({
      materialId: '22222222-2222-4222-8222-222222222222',
      cantidadCompra: 2,
      costoUnitarioCompra: 10,
    });

    expect(resultado).toEqual({
      exito: false,
      error: 'El inventario legado está disponible solo para consulta',
    });
    expect(adminMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'operacion_inventario_retirada',
      'inventario',
      '22222222-2222-4222-8222-222222222222',
      { operacion: 'entrada' },
      'corr-c6-3',
    );
  });

  it('rechaza crear un material en el catálogo legado', async () => {
    const resultado = await crearMaterialAccion({
      codigo: 'LEG-01',
      nombre: 'Material legado',
      categoria: 'materia_prima',
      unidadCompra: 'hoja',
      unidadControl: 'm2',
      factorConversion: 2,
      costoUnitarioCompra: 10,
      stockMinimoControl: 0,
      factorMermaPorcentaje: 8,
    });

    expect(resultado).toEqual({
      exito: false,
      error: 'El inventario legado está disponible solo para consulta',
    });
    expect(adminMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'operacion_inventario_retirada',
      'inventario',
      'LEG-01',
      { operacion: 'crear_material' },
      'corr-c6-3',
    );
  });

  it('rechaza una salida válida sin abrir el cliente administrador', async () => {
    const resultado = await registrarSalidaAccion({
      materialId: '22222222-2222-4222-8222-222222222222',
      cantidadControl: 1,
    });

    expect(resultado).toEqual({
      exito: false,
      error: 'El inventario legado está disponible solo para consulta',
    });
    expect(adminMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'operacion_inventario_retirada',
      'inventario',
      '22222222-2222-4222-8222-222222222222',
      { operacion: 'salida' },
      'corr-c6-3',
    );
  });

  it('conserva el control RBAC antes de informar el retiro operativo', async () => {
    permisoMock.mockResolvedValue(false);

    const resultado = await registrarEntradaAccion({
      materialId: '22222222-2222-4222-8222-222222222222',
      cantidadCompra: 2,
      costoUnitarioCompra: 10,
    });

    expect(resultado).toEqual({ exito: false, error: 'Sin permiso para registrar entradas' });
    expect(logMock).not.toHaveBeenCalled();
    expect(adminMock).not.toHaveBeenCalled();
  });
});
