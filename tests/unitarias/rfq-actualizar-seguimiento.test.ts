import { beforeEach, describe, expect, it, vi } from 'vitest';

const { obtenerUsuarioMock, canMock, registrarLogMock, filaPipelineMock, actualizarMock, rpcMock } =
  vi.hoisted(() => ({
    obtenerUsuarioMock: vi.fn(),
    canMock: vi.fn(),
    registrarLogMock: vi.fn(),
    filaPipelineMock: vi.fn(),
    actualizarMock: vi.fn(),
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
  nuevoCorrelationId: () => 'corr-resumen',
}));

function cadenaSelect(resultado: () => unknown) {
  const cadena = {
    eq: () => cadena,
    maybeSingle: () => resultado(),
  };
  return cadena;
}

vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: (tabla: string) => {
      if (tabla === 'pipeline') {
        return {
          select: () => cadenaSelect(() => filaPipelineMock()),
          update: (valores: unknown) => {
            actualizarMock(valores);
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: () => ({
                      data: { actualizado_en: '2026-10-21T11:00:00+00:00' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          },
        };
      }
      if (tabla === 'catalogo_proximas_acciones') {
        return { select: () => cadenaSelect(() => ({ data: { codigo: 'SEND_QUOTE' }, error: null })) };
      }
      throw new Error(`Tabla no esperada en la prueba: ${tabla}`);
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
  }),
}));

import { actualizarDatosRfqAccion } from '@/modulos/rfq/acciones/actualizar-datos-rfq';

const RFQ_ID = '22222222-2222-4222-8222-222222222222';
const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const ACTUALIZADO = '2026-10-21T10:00:00+00:00';

function enDias(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
}

function filaVigente(campos: Record<string, unknown> = {}) {
  return {
    data: {
      id: RFQ_ID,
      estado_rfq: 'INCOMPLETE',
      cliente_id: null,
      canal: null,
      actualizado_en: ACTUALIZADO,
      proxima_accion_codigo: 'FOLLOW_UP',
      proxima_accion_texto: null,
      fecha_proxima_accion: enDias(5),
      ...campos,
    },
  };
}

const BASE = {
  rfqId: RFQ_ID,
  actualizadoEn: ACTUALIZADO,
  canal: null,
  canalDetalle: null,
  fechaSolicitud: null,
  descripcionGeneral: 'Corte de lámina',
  contactoId: null,
  responsableId: null,
  proximaAccionCodigo: 'SEND_QUOTE',
  proximaAccionTexto: null,
  fechaProximaAccion: enDias(7),
  responsableProximaAccionId: null,
};

describe('actualizarDatosRfqAccion — seguimiento al editar el Resumen (obs. 2026-10-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerUsuarioMock.mockResolvedValue({ id: USUARIO_ID, rol: 'vendedor', activo: true });
    canMock.mockResolvedValue(true);
    filaPipelineMock.mockResolvedValue(filaVigente());
    rpcMock.mockResolvedValue({ error: null });
  });

  it('sustituir la acción vigente sin resultado se rechaza antes de actualizar', async () => {
    const respuesta = await actualizarDatosRfqAccion(BASE);

    expect(respuesta).toEqual({
      exito: false,
      error: 'Indica cómo terminó la acción de seguimiento actual',
    });
    expect(actualizarMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('sustituirla con resultado guarda el Resumen y deja el resultado en Actividad', async () => {
    const respuesta = await actualizarDatosRfqAccion({ ...BASE, resultadoProximaAccion: 'sin_respuesta' });

    expect(respuesta).toEqual({
      exito: true,
      datos: { actualizadoEn: '2026-10-21T11:00:00+00:00' },
    });
    expect(actualizarMock).toHaveBeenCalledWith(
      expect.objectContaining({ proxima_accion_codigo: 'SEND_QUOTE' }),
    );
    const llamadas = registrarLogMock.mock.calls;
    expect(llamadas.map((llamada) => llamada[1])).toEqual([
      'seguimiento_sin_respuesta',
      'actualizar_datos_rfq',
    ]);
    expect(llamadas[0]?.[4]).toEqual({
      accionAnterior: 'FOLLOW_UP',
      fechaAnterior: enDias(5),
      accionNueva: 'SEND_QUOTE',
      fechaNueva: BASE.fechaProximaAccion,
    });
    expect(llamadas.every((llamada) => llamada[5] === 'corr-resumen')).toBe(true);
  });

  it('mover fecha o responsable conserva la acción y no pide resultado', async () => {
    const respuesta = await actualizarDatosRfqAccion({
      ...BASE,
      proximaAccionCodigo: 'FOLLOW_UP',
      fechaProximaAccion: enDias(9),
    });

    expect(respuesta.exito).toBe(true);
    expect(actualizarMock).toHaveBeenCalledWith(
      expect.objectContaining({ fecha_proxima_accion: enDias(9) }),
    );
    expect(registrarLogMock.mock.calls.map((llamada) => llamada[1])).toEqual([
      'actualizar_datos_rfq',
    ]);
  });

  it('sin acción vigente no pide resultado ni registra uno', async () => {
    filaPipelineMock.mockResolvedValue(
      filaVigente({
        proxima_accion_codigo: null,
        proxima_accion_texto: null,
        fecha_proxima_accion: null,
      }),
    );
    const respuesta = await actualizarDatosRfqAccion(BASE);

    expect(respuesta.exito).toBe(true);
    expect(registrarLogMock.mock.calls.map((llamada) => llamada[1])).toEqual([
      'actualizar_datos_rfq',
    ]);
  });

  it('retirar la acción vigente también exige su resultado', async () => {
    const respuesta = await actualizarDatosRfqAccion({
      ...BASE,
      proximaAccionCodigo: null,
      fechaProximaAccion: null,
    });

    expect(respuesta.exito).toBe(false);
    expect(actualizarMock).not.toHaveBeenCalled();
  });

  it('cambiar el detalle de «Otro» cuenta como sustitución', async () => {
    filaPipelineMock.mockResolvedValue(
      filaVigente({ proxima_accion_codigo: 'OTHER', proxima_accion_texto: 'Visita a planta' }),
    );
    const respuesta = await actualizarDatosRfqAccion({
      ...BASE,
      proximaAccionCodigo: 'OTHER',
      proximaAccionTexto: 'Llamada al comprador',
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'Indica cómo terminó la acción de seguimiento actual',
    });
  });
});
