import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insertar: vi.fn() }));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ from: () => ({ insert: mocks.insertar }) }),
}));

import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

const usuario: UsuarioAutenticado = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'ana@orca.local',
  nombreCompleto: 'Ana Vendedora',
  rol: 'vendedor',
  activo: true,
  creadoEn: '2026-10-01T00:00:00Z',
  actualizadoEn: '2026-10-01T00:00:00Z',
  permisos: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertar.mockResolvedValue({ error: null });
});

describe('correlación de auditoría', () => {
  it('genera identificadores únicos con formato UUID', () => {
    const generados = Array.from({ length: 500 }, () => nuevoCorrelationId());
    expect(new Set(generados).size).toBe(generados.length);
    expect(generados.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)))
      .toBe(true);
  });

  it('propaga el correlationId a la fila de logs', async () => {
    const correlationId = nuevoCorrelationId();
    await registrarLog(usuario, 'crear_orden', 'ordenes', 'OP-000001', { prioridad: 'alta' }, correlationId);

    expect(mocks.insertar).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: usuario.id,
      accion: 'crear_orden',
      modulo: 'ordenes',
      recurso_id: 'OP-000001',
      correlation_id: correlationId,
    }));
  });

  it('mantiene compatibilidad sin correlationId (null en la fila)', async () => {
    await registrarLog(usuario, 'actualizar', 'clientes', 'CLI-0001');

    expect(mocks.insertar).toHaveBeenCalledWith(expect.objectContaining({
      correlation_id: null,
      detalles: null,
    }));
  });
});
