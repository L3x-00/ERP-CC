import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

const { registrarLogMock, correlationIdMock } = vi.hoisted(() => ({
  registrarLogMock: vi.fn(),
  correlationIdMock: vi.fn(),
}));

vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: registrarLogMock,
  nuevoCorrelationId: correlationIdMock,
}));

import { ejecutarAccionCatalogo } from '@/modulos/catalogos/acciones/utilidades-acciones';

const USUARIO: UsuarioAutenticado = {
  id: '00000000-0000-4000-8000-0000000c0a99',
  email: 'catalogos@orca.local',
  nombreCompleto: 'Gestora de catálogos',
  rol: 'admin',
  activo: true,
  permisos: ['catalogo_editar'],
  creadoEn: '2026-10-07T00:00:00.000Z',
  actualizadoEn: '2026-10-07T00:00:00.000Z',
};

describe('ejecutarAccionCatalogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    correlationIdMock.mockReturnValue('00000000-0000-4000-8000-0000000c0a15');
    registrarLogMock.mockResolvedValue(undefined);
  });

  it('registra la mutación aceptada con un correlationId nuevo', async () => {
    const resultado = await ejecutarAccionCatalogo(
      USUARIO,
      'actualizar_material_catalogo',
      'material-1',
      async () => ({ id: 'material-1' }),
      { codigo: 'ACERO' },
    );

    expect(resultado).toEqual({ exito: true, datos: { id: 'material-1' } });
    expect(correlationIdMock).toHaveBeenCalledOnce();
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'actualizar_material_catalogo',
      'catalogos',
      'material-1',
      { codigo: 'ACERO' },
      '00000000-0000-4000-8000-0000000c0a15',
    );
  });

  it('conserva el mismo correlationId al auditar un rechazo', async () => {
    const resultado = await ejecutarAccionCatalogo(
      USUARIO,
      'actualizar_material_catalogo',
      'material-1',
      async () => {
        throw { code: '23505', message: 'duplicate key' };
      },
    );

    expect(resultado).toEqual({ exito: false, error: 'Ya existe un registro con ese código o combinación' });
    expect(correlationIdMock).toHaveBeenCalledOnce();
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'actualizar_material_catalogo_rechazada',
      'catalogos',
      'material-1',
      { codigo: '23505' },
      '00000000-0000-4000-8000-0000000c0a15',
    );
  });
});
