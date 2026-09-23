import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  usuario: vi.fn(),
  guardar: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => mocks.usuario(),
}));
vi.mock('@/modulos/configuracion/servicios/operadores-servicio', () => ({
  guardarOperadorServicio: (...args: unknown[]) => mocks.guardar(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => mocks.log(...args),
}));

import { guardarOperadorAccion } from '@/modulos/configuracion/acciones/guardar-operador';

const ADMIN = {
  id: '10000000-0000-4000-8000-000000000001', rol: 'admin', activo: true,
  nombreCompleto: 'Admin', email: 'admin@orca.local', permisos: [],
  creadoEn: '2026-09-23T00:00:00Z', actualizadoEn: '2026-09-23T00:00:00Z',
};
const ENTRADA = { nombre: 'Operador Uno', pin: '0042', activo: true };
const SALIDA = { id: '20000000-0000-4000-8000-000000000002', nombre: 'Operador Uno', activo: true, pinConfigurado: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.usuario.mockResolvedValue(ADMIN);
  mocks.guardar.mockResolvedValue({ operador: SALIDA, activoAnterior: null });
  mocks.log.mockResolvedValue(undefined);
});

describe('CFG-05 administración de operadores', () => {
  it.each([
    null,
    { ...ADMIN, rol: 'gerente', permisos: ['configuracion'] },
    { ...ADMIN, activo: false },
  ])('rechaza usuario ausente, gerente con configuración y admin inactivo', async (usuario) => {
    mocks.usuario.mockResolvedValue(usuario);
    const resultado = await guardarOperadorAccion(ENTRADA);
    expect(resultado.exito).toBe(false);
    expect(mocks.guardar).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it('exige PIN como texto válido y rechaza campos extra antes de llamar al servicio', async () => {
    for (const entrada of [
      { ...ENTRADA, pin: 42 },
      { ...ENTRADA, pin: '42' },
      { ...ENTRADA, pin: '0042', rol: 'admin' },
    ]) {
      expect((await guardarOperadorAccion(entrada)).exito).toBe(false);
    }
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  it('crea con PIN de ceros iniciales y no lo escribe en la bitácora', async () => {
    const resultado = await guardarOperadorAccion(ENTRADA);
    expect(resultado).toEqual({ exito: true, datos: SALIDA });
    expect(mocks.guardar).toHaveBeenCalledWith(ADMIN.id, ENTRADA);
    const registro = mocks.log.mock.calls[0];
    expect(registro[1]).toBe('crear_operador');
    expect(JSON.stringify(registro)).not.toContain('0042');
  });

  it('presenta el duplicado sin exponer el PIN ni el hash', async () => {
    mocks.guardar.mockRejectedValue(new Error('pin_duplicado'));
    const resultado = await guardarOperadorAccion(ENTRADA);
    expect(resultado).toEqual({ exito: false, error: 'Ese PIN ya pertenece a otro operador activo' });
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('0042');
  });

  it('distingue retiro y reactivación en la bitácora sin incluir PIN', async () => {
    mocks.guardar.mockResolvedValueOnce({
      operador: { ...SALIDA, activo: false }, activoAnterior: true,
    }).mockResolvedValueOnce({ operador: SALIDA, activoAnterior: false });
    await guardarOperadorAccion({ id: SALIDA.id, nombre: SALIDA.nombre, pin: null, activo: false });
    await guardarOperadorAccion({ id: SALIDA.id, nombre: SALIDA.nombre, pin: '0042', activo: true });
    expect(mocks.log.mock.calls.map((llamada) => llamada[1])).toEqual([
      'retirar_operador', 'reactivar_operador',
    ]);
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('0042');
  });
});
