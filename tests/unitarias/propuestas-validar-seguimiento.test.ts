// Obs. cliente 2026-10-11: «Validar» registra la próxima acción (obligatoria)
// y luego valida, con token CAS fresco entre ambas RPC y sin duplicar el
// seguimiento en reintentos tras un bloqueo de validación.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, adminMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  adminMock: vi.fn(),
}));

vi.mock('@/modulos/propuestas/acciones/utilidades-acciones', async (importarReal) => {
  const real = await importarReal<
    typeof import('@/modulos/propuestas/acciones/utilidades-acciones')
  >();
  return { ...real, ejecutarRpcPropuesta: (...argumentos: unknown[]) => rpcMock(...argumentos) };
});

vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => adminMock(),
}));

import { validarRevisionConSeguimientoAccion } from '@/modulos/propuestas/acciones/validar-revision-con-seguimiento';

const REV_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOKEN_INICIAL = '2026-10-11T00:00:00+00:00';
const TOKEN_TRAS_REGISTRO = '2026-10-11T00:01:00+00:00';

type UltimaAccion = { codigo: string; texto_otro: string | null; fecha: string } | null;

function adminFalso(config: { estado?: string; ultima?: UltimaAccion } = {}) {
  const tokens = [TOKEN_INICIAL, TOKEN_TRAS_REGISTRO];
  let lecturasRevision = 0;
  return {
    from(tabla: string) {
      const cadena = {
        select: () => cadena,
        eq: () => cadena,
        order: () => cadena,
        limit: () => cadena,
        maybeSingle: async () => {
          if (tabla === 'propuesta_revisiones') {
            const indice = Math.min(lecturasRevision, tokens.length - 1);
            lecturasRevision += 1;
            return {
              data: { estado: config.estado ?? 'DRAFT', actualizado_en: tokens[indice] },
              error: null,
            };
          }
          if (tabla === 'propuesta_revision_acciones') {
            return { data: config.ultima ?? null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return cadena;
    },
  };
}

function entradaValida(extra: Record<string, unknown> = {}) {
  return {
    revisionId: REV_ID,
    actualizadoEn: TOKEN_INICIAL,
    codigo: 'FOLLOW_UP',
    fecha: '2026-11-15',
    ...extra,
  };
}

function llamadasRpc(): string[] {
  return rpcMock.mock.calls.map(
    (llamada) => (llamada[0] as { rpc: string }).rpc,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  adminMock.mockReturnValue(adminFalso());
  rpcMock.mockImplementation(async (solicitud: { rpc: string }) =>
    solicitud.rpc === 'registrar_seguimiento_propuesta'
      ? { exito: true, datos: { estado: 'DRAFT', accionId: 'accion-1' } }
      : { exito: true, datos: { estado: 'READY_TO_SEND' } },
  );
});

describe('esquema validar con seguimiento', () => {
  it('exige fecha de calendario y código de acción', async () => {
    const fechaInvalida = await validarRevisionConSeguimientoAccion(
      entradaValida({ fecha: '2026-02-31' }),
    );
    expect(fechaInvalida.exito).toBe(false);

    const codigoCorto = await validarRevisionConSeguimientoAccion(
      entradaValida({ codigo: 'X' }),
    );
    expect(codigoCorto.exito).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rechaza una próxima acción con fecha anterior a hoy', async () => {
    const respuesta = await validarRevisionConSeguimientoAccion(
      entradaValida({ fecha: '2000-01-01' }),
    );

    expect(respuesta).toEqual({
      exito: false,
      error: expect.stringContaining('no puede ser anterior'),
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('validarRevisionConSeguimientoAccion', () => {
  it('registra el seguimiento y luego valida con el token fresco', async () => {
    const respuesta = await validarRevisionConSeguimientoAccion(entradaValida());

    expect(respuesta).toMatchObject({
      exito: true,
      datos: { seguimientoRegistrado: true, estado: 'READY_TO_SEND' },
    });
    expect(llamadasRpc()).toEqual(['registrar_seguimiento_propuesta', 'validar_revision']);

    const registro = rpcMock.mock.calls[0][0] as {
      permiso: string;
      args: { p_datos: { actualizado_en: string; codigo: string; fecha: string } };
    };
    expect(registro.permiso).toBe('propuesta_seguimiento');
    expect(registro.args.p_datos.actualizado_en).toBe(TOKEN_INICIAL);
    expect(registro.args.p_datos.codigo).toBe('FOLLOW_UP');

    const validacion = rpcMock.mock.calls[1][0] as {
      permiso: string;
      args: { p_datos: { actualizado_en: string } };
    };
    expect(validacion.permiso).toBe('propuesta_validar');
    expect(validacion.args.p_datos.actualizado_en).toBe(TOKEN_TRAS_REGISTRO);
  });

  it('no duplica un seguimiento idéntico al último y solo valida', async () => {
    adminMock.mockReturnValue(
      adminFalso({
        ultima: { codigo: 'FOLLOW_UP', texto_otro: null, fecha: '2026-11-15' },
      }),
    );

    const respuesta = await validarRevisionConSeguimientoAccion(entradaValida());

    expect(respuesta).toMatchObject({
      exito: true,
      datos: { seguimientoRegistrado: false },
    });
    expect(llamadasRpc()).toEqual(['validar_revision']);
    const validacion = rpcMock.mock.calls[0][0] as {
      args: { p_datos: { actualizado_en: string } };
    };
    expect(validacion.args.p_datos.actualizado_en).toBe(TOKEN_INICIAL);
  });

  it('rechaza revisar algo que ya no está en borrador sin llamar a las RPC', async () => {
    adminMock.mockReturnValue(adminFalso({ estado: 'READY_TO_SEND' }));

    const respuesta = await validarRevisionConSeguimientoAccion(entradaValida());

    expect(respuesta).toEqual({
      exito: false,
      error: expect.stringContaining('borrador'),
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('exige el token vigente de la revisión (CAS)', async () => {
    const respuesta = await validarRevisionConSeguimientoAccion(
      entradaValida({ actualizadoEn: '2026-10-10T00:00:00+00:00' }),
    );

    expect(respuesta).toEqual({
      exito: false,
      error: expect.stringContaining('cambió'),
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('si el registro falla, no valida', async () => {
    rpcMock.mockResolvedValueOnce({ exito: false, error: 'El seguimiento fue rechazado' });

    const respuesta = await validarRevisionConSeguimientoAccion(entradaValida());

    expect(respuesta).toEqual({ exito: false, error: 'El seguimiento fue rechazado' });
    expect(llamadasRpc()).toEqual(['registrar_seguimiento_propuesta']);
  });

  it('si la validación falla, propaga el error (el seguimiento ya quedó registrado)', async () => {
    rpcMock
      .mockResolvedValueOnce({ exito: true, datos: { estado: 'DRAFT' } })
      .mockResolvedValueOnce({
        exito: false,
        error: 'Confirma ruteo y costeo antes de validar',
      });

    const respuesta = await validarRevisionConSeguimientoAccion(entradaValida());

    expect(respuesta).toEqual({
      exito: false,
      error: 'Confirma ruteo y costeo antes de validar',
    });
    expect(llamadasRpc()).toEqual(['registrar_seguimiento_propuesta', 'validar_revision']);
  });
});
