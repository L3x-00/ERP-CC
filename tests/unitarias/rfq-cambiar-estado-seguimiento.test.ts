import { beforeEach, describe, expect, it, vi } from 'vitest';

const { obtenerUsuarioMock, canMock, registrarLogMock, filaMock, rpcMock } = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  filaMock: vi.fn(),
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
  nuevoCorrelationId: () => 'corr-1',
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: () => {
      const cadena = { eq: () => cadena, maybeSingle: () => filaMock() };
      return { select: () => cadena };
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
  }),
}));

import { cambiarEstadoRfqAccion } from '@/modulos/rfq/acciones/cambiar-estado-rfq';

const RFQ_ID = '22222222-2222-4222-8222-222222222222';
const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const ACTUALIZADO = '2026-10-21T10:00:00+00:00';

function enDias(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
}

const NUEVA = { codigo: 'SEND_QUOTE', fecha: enDias(7), responsableId: USUARIO_ID };

function filaVigente(fecha: string | null = enDias(5)) {
  return {
    data: {
      proxima_accion_codigo: 'FOLLOW_UP',
      proxima_accion_texto: null,
      fecha_proxima_accion: fecha,
      responsable_proxima_accion_id: USUARIO_ID,
      actualizado_en: ACTUALIZADO,
    },
  };
}

const BASE = { rfqId: RFQ_ID, accion: 'poner_en_espera_cliente', actualizadoEn: ACTUALIZADO };

describe('cambiarEstadoRfqAccion — seguimiento (obs. cliente 2026-10-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerUsuarioMock.mockResolvedValue({ id: USUARIO_ID, rol: 'vendedor', activo: true });
    canMock.mockResolvedValue(true);
    rpcMock.mockResolvedValue({ data: 'WAITING_CUSTOMER', error: null });
    filaMock.mockResolvedValue(filaVigente());
  });

  it('dejar la acción como está reenvía la guardada, sin resultado ni log de seguimiento', async () => {
    const respuesta = await cambiarEstadoRfqAccion({ ...BASE, mantenerProximaAccion: true });

    expect(respuesta.exito).toBe(true);
    const args = rpcMock.mock.calls[0]?.[1] as { p_args: { proxima_accion: Record<string, unknown> } };
    expect(args.p_args.proxima_accion).toEqual({
      codigo: 'FOLLOW_UP',
      texto: null,
      fecha: enDias(5),
      responsable_id: USUARIO_ID,
    });
    const acciones = registrarLogMock.mock.calls.map((llamada) => llamada[1]);
    expect(acciones).toEqual(['cambiar_estado_rfq']);
  });

  it('no deja conservar una acción vencida ni inexistente', async () => {
    filaMock.mockResolvedValue(filaVigente(enDias(-2)));
    const vencida = await cambiarEstadoRfqAccion({ ...BASE, mantenerProximaAccion: true });
    expect(vencida).toEqual({
      exito: false,
      error: 'La acción de seguimiento ya venció; indica cómo terminó y define la siguiente',
    });

    filaMock.mockResolvedValue({
      data: {
        proxima_accion_codigo: null,
        proxima_accion_texto: null,
        fecha_proxima_accion: null,
        responsable_proxima_accion_id: null,
        actualizado_en: ACTUALIZADO,
      },
    });
    const inexistente = await cambiarEstadoRfqAccion({ ...BASE, mantenerProximaAccion: true });
    expect(inexistente.exito).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('sustituir la acción vigente sin resultado se rechaza antes de tocar nada', async () => {
    const respuesta = await cambiarEstadoRfqAccion({ ...BASE, proximaAccion: NUEVA });

    expect(respuesta).toEqual({
      exito: false,
      error: 'Indica cómo terminó la acción de seguimiento actual',
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('sustituirla con resultado guarda el estado y deja el resultado en Actividad', async () => {
    const respuesta = await cambiarEstadoRfqAccion({
      ...BASE,
      proximaAccion: NUEVA,
      resultadoProximaAccion: 'sin_respuesta',
    });

    expect(respuesta.exito).toBe(true);
    const llamadas = registrarLogMock.mock.calls;
    expect(llamadas.map((llamada) => llamada[1])).toEqual([
      'seguimiento_sin_respuesta',
      'cambiar_estado_rfq',
    ]);
    expect(llamadas[0]?.[4]).toEqual({
      accionAnterior: 'FOLLOW_UP',
      fechaAnterior: enDias(5),
      accionNueva: 'SEND_QUOTE',
      fechaNueva: NUEVA.fecha,
    });
    // Ambos comparten correlación: se leen como una sola acción de negocio.
    expect(llamadas.every((llamada) => llamada[5] === 'corr-1')).toBe(true);
  });

  it('sin acción vigente no pide resultado ni registra uno', async () => {
    filaMock.mockResolvedValue({
      data: {
        proxima_accion_codigo: null,
        proxima_accion_texto: null,
        fecha_proxima_accion: null,
        responsable_proxima_accion_id: null,
        actualizado_en: ACTUALIZADO,
      },
    });
    const respuesta = await cambiarEstadoRfqAccion({ ...BASE, proximaAccion: NUEVA });

    expect(respuesta.exito).toBe(true);
    expect(registrarLogMock.mock.calls.map((llamada) => llamada[1])).toEqual(['cambiar_estado_rfq']);
  });

  it('si el RFQ cambió desde que se abrió el diálogo pide recargar', async () => {
    filaMock.mockResolvedValue({
      data: { ...filaVigente().data, actualizado_en: '2026-10-21T11:00:00+00:00' },
    });
    const respuesta = await cambiarEstadoRfqAccion({ ...BASE, mantenerProximaAccion: true });

    expect(respuesta).toEqual({ exito: false, error: 'El RFQ cambió; recarga antes de reintentar' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('cerrar sigue pidiendo motivo y no consulta seguimiento', async () => {
    const respuesta = await cambiarEstadoRfqAccion({ ...BASE, accion: 'cerrar', motivo: 'Cliente desistió' });

    expect(respuesta.exito).toBe(true);
    expect(filaMock).not.toHaveBeenCalled();
  });
});
