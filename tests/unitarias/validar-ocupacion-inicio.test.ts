import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/nucleo/autenticacion/obtener-operador-sesion', () => ({
  obtenerOperadorParaMutacion: vi.fn(async () => ({ id: 'operador-2', nombreCompleto: 'Luis Torres' })),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: (...args: unknown[]) => rpcMock(...args) }),
}));

import { validarOcupacionInicioAccion } from '@/modulos/produccion/acciones/espacio-operador';

const RECLAMO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: null, error: null });
});

describe('validarOcupacionInicioAccion — aviso antes del checklist', () => {
  it('consulta la RPC con el reclamo y el operador de sesión', async () => {
    const respuesta = await validarOcupacionInicioAccion({ reclamoId: RECLAMO });
    expect(respuesta).toEqual({ exito: true, datos: { ocupadoPor: null } });
    expect(rpcMock).toHaveBeenCalledWith('validar_ocupacion_inicio_reclamo', {
      p_reclamo_id: RECLAMO,
      p_operador_id: 'operador-2',
    });
  });

  it('devuelve el mensaje exacto cuando la RPC reporta ocupación', async () => {
    const mensaje = 'LASER-01 está ocupado por la orden O-1126_12';
    rpcMock.mockResolvedValue({ data: mensaje, error: null });
    const respuesta = await validarOcupacionInicioAccion({ reclamoId: RECLAMO });
    expect(respuesta).toEqual({ exito: true, datos: { ocupadoPor: mensaje } });
  });

  it('no abre el checklist si no se pudo verificar', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('falló') });
    const respuesta = await validarOcupacionInicioAccion({ reclamoId: RECLAMO });
    expect(respuesta.exito).toBe(false);
  });
});
