import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';

const {
  registrarLogMock,
  correlationIdMock,
  usuarioMock,
  canMock,
  guardarCanalServicioMock,
  clienteAdminMock,
} = vi.hoisted(() => ({
  registrarLogMock: vi.fn(),
  correlationIdMock: vi.fn(),
  usuarioMock: vi.fn(),
  canMock: vi.fn(),
  guardarCanalServicioMock: vi.fn(),
  clienteAdminMock: vi.fn(),
}));

vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: registrarLogMock,
  nuevoCorrelationId: correlationIdMock,
}));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: usuarioMock,
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({ can: canMock }));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: clienteAdminMock }));
vi.mock('@/modulos/catalogos/servicios/indice', () => ({
  guardarCanalServicio: guardarCanalServicioMock,
}));

import { guardarCanalAccion } from '@/modulos/catalogos/acciones/guardar-canal';

const CANAL_UUID = '00000000-0000-4000-8000-0000000c0b01';
const CORRELATION = '00000000-0000-4000-8000-0000000c0a15';

const USUARIO: UsuarioAutenticado = {
  id: '00000000-0000-4000-8000-0000000c0a99',
  email: 'catalogos@orca.local',
  nombreCompleto: 'Gestora de catálogos',
  rol: 'admin',
  activo: true,
  permisos: ['catalogo_editar'],
  creadoEn: '2026-10-08T00:00:00.000Z',
  actualizadoEn: '2026-10-08T00:00:00.000Z',
};

const CANAL = {
  id: CANAL_UUID,
  codigo: 'WHATSAPP',
  nombre: 'WhatsApp',
  esOtro: false,
  activo: true,
  orden: 10,
  creadoEn: '2026-10-08T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  correlationIdMock.mockReturnValue(CORRELATION);
  registrarLogMock.mockResolvedValue(undefined);
  usuarioMock.mockResolvedValue(USUARIO);
  canMock.mockResolvedValue(true);
  clienteAdminMock.mockReturnValue({});
  guardarCanalServicioMock.mockResolvedValue(CANAL);
});

describe('guardarCanalAccion (DC-02)', () => {
  it('rechaza datos inválidos sin tocar el servicio', async () => {
    const respuesta = await guardarCanalAccion({ codigo: 'con espacio', nombre: 'Correo' });
    expect(respuesta.exito).toBe(false);
    expect(guardarCanalServicioMock).not.toHaveBeenCalled();
    expect(usuarioMock).not.toHaveBeenCalled();
  });

  it('exige sesión activa', async () => {
    usuarioMock.mockResolvedValue(null);
    const respuesta = await guardarCanalAccion({ codigo: 'CORREO', nombre: 'Correo' });
    expect(respuesta).toEqual({ exito: false, error: 'No autorizado' });
    expect(guardarCanalServicioMock).not.toHaveBeenCalled();
  });

  it('exige el permiso catalogo_editar', async () => {
    canMock.mockResolvedValue(false);
    const respuesta = await guardarCanalAccion({ codigo: 'CORREO', nombre: 'Correo' });
    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para editar catálogos' });
    expect(canMock).toHaveBeenCalledWith(USUARIO, 'catalogo_editar');
    expect(guardarCanalServicioMock).not.toHaveBeenCalled();
  });

  it('da de alta un canal y audita la creación', async () => {
    const respuesta = await guardarCanalAccion({ codigo: 'whatsapp', nombre: 'WhatsApp', orden: 10 });

    expect(respuesta).toEqual({ exito: true, datos: CANAL });
    expect(guardarCanalServicioMock).toHaveBeenCalledWith({}, {
      codigo: 'WHATSAPP',
      nombre: 'WhatsApp',
      esOtro: false,
      activo: true,
      orden: 10,
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'crear_canal_catalogo',
      'catalogos',
      'WHATSAPP',
      { codigo: 'WHATSAPP', esOtro: false },
      CORRELATION,
    );
  });

  it('audita la edición con el id del canal', async () => {
    await guardarCanalAccion({
      id: CANAL_UUID,
      codigo: 'OTRO',
      nombre: 'Otro',
      esOtro: true,
      activo: true,
      orden: 60,
    });

    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'actualizar_canal_catalogo',
      'catalogos',
      CANAL_UUID,
      { codigo: 'OTRO', esOtro: true },
      CORRELATION,
    );
  });

  it('explica el conflicto de "Otro" sin exponer el detalle interno', async () => {
    guardarCanalServicioMock.mockRejectedValue({
      code: '23505',
      message: 'duplicate key value violates unique constraint "ux_catalogo_canales_otro"',
      details: 'Key (es_otro)=(t) already exists.',
    });

    const respuesta = await guardarCanalAccion({ codigo: 'VISITA', nombre: 'Visita', esOtro: true });

    expect(respuesta.exito).toBe(false);
    if (!respuesta.exito) {
      expect(respuesta.error).toBe('Solo un canal puede ser “Otro”: desmarca el canal que lo tiene antes de asignarlo aquí');
      expect(respuesta.error).not.toContain('ux_catalogo_canales_otro');
      expect(respuesta.error).not.toContain('es_otro');
    }
    expect(registrarLogMock).toHaveBeenCalledWith(
      USUARIO,
      'crear_canal_catalogo_rechazada',
      'catalogos',
      'VISITA',
      { codigo: '23505' },
      CORRELATION,
    );
  });

  it('conserva el mensaje de código duplicado para otros conflictos', async () => {
    guardarCanalServicioMock.mockRejectedValue({
      code: '23505',
      message: 'duplicate key value violates unique constraint "catalogo_canales_codigo_key"',
    });

    const respuesta = await guardarCanalAccion({ codigo: 'CORREO', nombre: 'Correo' });
    expect(respuesta).toEqual({
      exito: false,
      error: 'Ya existe un registro con ese código o combinación',
    });
  });

  it('explica que el código de un canal existente es inmutable', async () => {
    guardarCanalServicioMock.mockRejectedValue({
      code: '23514',
      message: 'codigo_canal_inmutable',
    });

    const respuesta = await guardarCanalAccion({
      id: CANAL_UUID,
      codigo: 'NUEVO_CODIGO',
      nombre: 'WhatsApp',
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'El código del canal es estable; crea otro canal si necesitas un código distinto',
    });
  });
});
