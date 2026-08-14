import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerOperadorMock,
  obtenerUsuarioMock,
  confirmarPinOperadorMock,
  estaBloqueadoMock,
  limpiarIntentosMock,
  obtenerIdentificadorMock,
  registrarIntentoMock,
  canMock,
  registrarLogMock,
  iniciarSesionMock,
  cerrarSesionMock,
  generarNotaMock,
} = vi.hoisted(() => ({
  obtenerOperadorMock: vi.fn(),
  obtenerUsuarioMock: vi.fn(),
  confirmarPinOperadorMock: vi.fn(),
  estaBloqueadoMock: vi.fn(),
  limpiarIntentosMock: vi.fn(),
  obtenerIdentificadorMock: vi.fn(),
  registrarIntentoMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  iniciarSesionMock: vi.fn(),
  cerrarSesionMock: vi.fn(),
  generarNotaMock: vi.fn(),
}));

vi.mock('@/nucleo/autenticacion/obtener-operador-sesion', () => ({
  obtenerOperadorConSesionActiva: () => obtenerOperadorMock(),
}));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/pin-operador', () => ({
  confirmarPinDeOperador: (...argumentos: unknown[]) => confirmarPinOperadorMock(...argumentos),
}));
vi.mock('@/nucleo/autenticacion/limitar-intentos', () => ({
  estaBloqueado: (...argumentos: unknown[]) => estaBloqueadoMock(...argumentos),
  limpiarIntentos: (...argumentos: unknown[]) => limpiarIntentosMock(...argumentos),
  obtenerIdentificadorSolicitante: () => obtenerIdentificadorMock(),
  registrarIntentoFallido: (...argumentos: unknown[]) => registrarIntentoMock(...argumentos),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => canMock(...argumentos),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...argumentos: unknown[]) => registrarLogMock(...argumentos),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({ rpc: vi.fn(), from: vi.fn() }),
}));
vi.mock('@/modulos/produccion/servicios/indice', () => ({
  ErrorProduccion: class ErrorProduccion extends Error {
    codigo = 'desconocido';
  },
  iniciarSesionTrabajoServicio: (...argumentos: unknown[]) => iniciarSesionMock(...argumentos),
  cerrarSesionTrabajoServicio: (...argumentos: unknown[]) => cerrarSesionMock(...argumentos),
  generarNotaEntregaServicio: (...argumentos: unknown[]) => generarNotaMock(...argumentos),
  mensajeErrorSesion: () => 'No se pudo registrar la sesión de producción',
  mensajeErrorEntrega: () => 'No se pudo generar la nota de entrega',
}));

import {
  cerrarSesionOperadorAccion,
  generarNotaEntregaAccion,
  iniciarSesionOperadorAccion,
} from '@/modulos/produccion/acciones/indice';

const OPERADOR = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'operador@orca.test',
  nombreCompleto: 'Operador E2E',
  rol: 'operador' as const,
  activo: true,
  creadoEn: '2026-08-14T15:00:00.000Z',
  actualizadoEn: '2026-08-14T15:00:00.000Z',
  permisos: [],
};
const GERENTE = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'gerente@orca.test',
  nombreCompleto: 'Gerente E2E',
  rol: 'gerente' as const,
  activo: true,
  creadoEn: '2026-08-14T15:00:00.000Z',
  actualizadoEn: '2026-08-14T15:00:00.000Z',
  permisos: ['gestionar_produccion'],
};
const IDS = {
  ordenId: '33333333-3333-4333-8333-333333333333',
  partidaId: '44444444-4444-4444-8444-444444444444',
  programacionId: '55555555-5555-4555-8555-555555555555',
  sesionId: '66666666-6666-4666-8666-666666666666',
  notaId: '77777777-7777-4777-8777-777777777777',
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerOperadorMock.mockResolvedValue(OPERADOR);
  obtenerUsuarioMock.mockResolvedValue(GERENTE);
  confirmarPinOperadorMock.mockResolvedValue(true);
  estaBloqueadoMock.mockResolvedValue(false);
  limpiarIntentosMock.mockResolvedValue(undefined);
  obtenerIdentificadorMock.mockResolvedValue('ip-prueba');
  registrarIntentoMock.mockResolvedValue(undefined);
  canMock.mockResolvedValue(true);
  registrarLogMock.mockResolvedValue(undefined);
  iniciarSesionMock.mockResolvedValue({
    id: IDS.sesionId,
    ordenId: IDS.ordenId,
    partidaId: IDS.partidaId,
    programacionId: IDS.programacionId,
    operadorId: OPERADOR.id,
    fechaInicio: '2026-08-14T15:00:00.000Z',
    estadoSesion: 'activa',
    creadoEn: '2026-08-14T15:00:00.000Z',
    actualizadoEn: '2026-08-14T15:00:00.000Z',
  });
  cerrarSesionMock.mockResolvedValue({
    id: IDS.sesionId,
    estadoSesion: 'finalizada',
    horasBrutas: 8,
    horasNetas: 7,
    piezasProducidas: 5,
    cantidadProducidaPartida: 5,
    estadoOrden: 'completada',
    estadoPlaneacion: 'completada',
    actualizadoEn: '2026-08-14T23:00:00.000Z',
  });
  generarNotaMock.mockResolvedValue({
    id: IDS.notaId,
    folio: 'NE-001001',
    esParcial: false,
    creadoEn: '2026-08-14T23:00:00.000Z',
  });
});

describe('acciones seguras de sesiones de Producción', () => {
  it('no inicia una sesión si la cookie HMAC de operador no es válida', async () => {
    obtenerOperadorMock.mockResolvedValue(null);

    await expect(iniciarSesionOperadorAccion({
      ordenId: IDS.ordenId,
      partidaId: IDS.partidaId,
      programacionId: IDS.programacionId,
    })).resolves.toEqual({ exito: false, error: 'Sesión de operador no válida' });
    expect(iniciarSesionMock).not.toHaveBeenCalled();
  });

  it('inicia con la identidad HMAC y la audita sin aceptar operador del navegador', async () => {
    const respuesta = await iniciarSesionOperadorAccion({
      ordenId: IDS.ordenId,
      partidaId: IDS.partidaId,
      programacionId: IDS.programacionId,
    });

    expect(respuesta.exito).toBe(true);
    expect(iniciarSesionMock).toHaveBeenCalledWith(expect.anything(), {
      ordenId: IDS.ordenId,
      partidaId: IDS.partidaId,
      programacionId: IDS.programacionId,
      operadorId: OPERADOR.id,
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      OPERADOR,
      'iniciar_sesion_trabajo',
      'produccion',
      IDS.sesionId,
      expect.objectContaining({ programacionId: IDS.programacionId }),
    );
  });

  it('rechaza el cierre si el PIN no vuelve a confirmar al operador HMAC', async () => {
    confirmarPinOperadorMock.mockResolvedValue(false);

    const respuesta = await cerrarSesionOperadorAccion({
      sesionId: IDS.sesionId,
      piezasProducidas: 5,
      estadoDestino: 'finalizada',
      pinConfirmacion: '4826',
    });

    expect(respuesta).toEqual({ exito: false, error: 'Confirmación de operador no válida' });
    expect(confirmarPinOperadorMock).toHaveBeenCalledWith(OPERADOR.id, '4826');
    expect(registrarIntentoMock).toHaveBeenCalledWith('ip-prueba', 'pin');
    expect(cerrarSesionMock).not.toHaveBeenCalled();
  });

  it('cierra solo después de HMAC y PIN coincidentes, y audita el resultado', async () => {
    const respuesta = await cerrarSesionOperadorAccion({
      sesionId: IDS.sesionId,
      piezasProducidas: 5,
      estadoDestino: 'finalizada',
      pinConfirmacion: '4826',
    });

    expect(respuesta.exito).toBe(true);
    expect(limpiarIntentosMock).toHaveBeenCalledWith('ip-prueba', 'pin');
    expect(cerrarSesionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sesionId: IDS.sesionId,
      operadorId: OPERADOR.id,
      pinConfirmacion: '4826',
    }));
    expect(registrarLogMock).toHaveBeenCalledWith(
      OPERADOR,
      'cerrar_sesion_trabajo',
      'produccion',
      IDS.sesionId,
      expect.objectContaining({ horasNetas: 7 }),
    );
  });

  it('no genera una entrega para un usuario sin gestionar_produccion', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await generarNotaEntregaAccion({
      ordenId: IDS.ordenId,
      recibidoPor: 'María López',
      partidas: [{ partidaId: IDS.partidaId, cantidadEntregada: 5 }],
    });

    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para generar notas de entrega' });
    expect(generarNotaMock).not.toHaveBeenCalled();
  });

  it('genera una entrega con identidad de servidor y sin precios', async () => {
    const respuesta = await generarNotaEntregaAccion({
      ordenId: IDS.ordenId,
      recibidoPor: 'María López',
      partidas: [{ partidaId: IDS.partidaId, cantidadEntregada: 5 }],
    });

    expect(respuesta.exito).toBe(true);
    expect(generarNotaMock).toHaveBeenCalledWith(expect.anything(), {
      ordenId: IDS.ordenId,
      recibidoPor: 'María López',
      partidas: [{ partidaId: IDS.partidaId, cantidadEntregada: 5 }],
      creadoPor: GERENTE.id,
    });
    expect(JSON.stringify(generarNotaMock.mock.calls[0]?.[1])).not.toContain('precio');
  });
});
