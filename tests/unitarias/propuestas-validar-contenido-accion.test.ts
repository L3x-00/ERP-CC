// Obs. cliente 2026-10-13: validar exige ítem, ruteo costeado y archivo. La
// regla se evalúa en el servidor (antes de la RPC) con la misma función que usa
// la ficha; una propuesta incompleta no ejecuta la RPC ni deja seguimientos.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, bloqueoMock, registrarLogMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  bloqueoMock: vi.fn(),
  registrarLogMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: async () => ({ id: 'usuario-1', activo: true }),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({ can: async () => true }));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  nuevoCorrelationId: () => 'correlacion-1',
  registrarLog: (...argumentos: unknown[]) => registrarLogMock(...argumentos),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: (...argumentos: unknown[]) => rpcMock(...argumentos) }),
}));
vi.mock('@/modulos/propuestas/servicios/faltantes-validacion', () => ({
  mensajeBloqueoValidacion: (...argumentos: unknown[]) => bloqueoMock(...argumentos),
}));

import { costearRuteoRevisionAccion } from '@/modulos/propuestas/acciones/costear-ruteo-revision';
import { validarRevisionAccion } from '@/modulos/propuestas/acciones/validar-revision';

const REV_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ENTRADA = { revisionId: REV_ID, actualizadoEn: '2026-10-13T00:00:00+00:00' };

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: { revisionId: REV_ID, estado: 'READY_TO_SEND' }, error: null });
  bloqueoMock.mockResolvedValue(null);
});

describe('validarRevisionAccion — contenido completo antes de la RPC', () => {
  it('una propuesta incompleta devuelve el mensaje, no llama a la RPC y deja bitácora', async () => {
    bloqueoMock.mockResolvedValue('La propuesta está incompleta. Falta: al menos un archivo.');

    const respuesta = await validarRevisionAccion(ENTRADA);

    expect(respuesta).toEqual({
      exito: false,
      error: 'La propuesta está incompleta. Falta: al menos un archivo.',
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(bloqueoMock).toHaveBeenCalledWith(expect.anything(), REV_ID);
    expect(registrarLogMock).toHaveBeenCalledWith(
      expect.anything(),
      'validar_revision_rechazado',
      'propuestas',
      REV_ID,
      { codigo: 'contenido_incompleto' },
      'correlacion-1',
    );
  });

  it('una propuesta completa sigue a la RPC de validar', async () => {
    const respuesta = await validarRevisionAccion(ENTRADA);

    expect(respuesta).toEqual({
      exito: true,
      datos: { revisionId: REV_ID, estado: 'READY_TO_SEND' },
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'validar_revision',
      expect.objectContaining({ p_revision_id: REV_ID, p_actor: 'usuario-1' }),
    );
  });
});

// Defecto incidental: la RPC `costear_ruteo_revision` nombra su parámetro
// `p_actor_id` (no `p_actor`); con el nombre equivocado PostgREST responde que la
// función no existe y «Costear ruteo» fallaba siempre.
describe('costearRuteoRevisionAccion — firma real de la RPC', () => {
  it('manda el actor como p_actor_id y no como p_actor', async () => {
    rpcMock.mockResolvedValue({ data: { renglones: 2, costoRuteo: 300, moneda: 'MXN' }, error: null });

    const respuesta = await costearRuteoRevisionAccion({ revisionId: REV_ID });

    expect(respuesta).toEqual({ exito: true, datos: { renglones: 2, costoRuteo: 300 } });
    expect(rpcMock).toHaveBeenCalledWith('costear_ruteo_revision', {
      p_revision_id: REV_ID,
      p_actor_id: 'usuario-1',
      p_correlation_id: 'correlacion-1',
    });
  });

  it('las demás RPC de propuestas siguen recibiendo p_actor', async () => {
    await validarRevisionAccion(ENTRADA);

    expect(rpcMock).toHaveBeenCalledWith(
      'validar_revision',
      expect.objectContaining({ p_actor: 'usuario-1' }),
    );
    expect(rpcMock.mock.calls[0]?.[1]).not.toHaveProperty('p_actor_id');
  });
});
