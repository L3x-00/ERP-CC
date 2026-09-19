import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';

const {
  obtenerUsuarioMock,
  canMock,
  registrarLogMock,
  insertMock,
  singleMock,
  updateMock,
  eqMock,
  generarFolioMock,
  obtenerClienteParaRfqMock,
  obtenerOportunidadMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  insertMock: vi.fn(),
  singleMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  generarFolioMock: vi.fn(),
  obtenerClienteParaRfqMock: vi.fn(),
  obtenerOportunidadMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: async () => ({ marca: 'servidor' }),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: () => ({
      insert: (valores: unknown) => {
        insertMock(valores);
        return { select: () => ({ single: () => singleMock() }) };
      },
      update: (valores: unknown) => {
        updateMock(valores);
        return { eq: (columna: string, valor: string) => eqMock(columna, valor) };
      },
    }),
  }),
}));
vi.mock('@/modulos/pipeline/servicios/generar-folio-op', () => ({
  generarFolioOp: () => generarFolioMock(),
}));
vi.mock('@/modulos/pipeline/servicios/obtener-cliente-para-rfq', () => ({
  obtenerClienteParaRfq: (...args: unknown[]) => obtenerClienteParaRfqMock(...args),
}));
vi.mock('@/modulos/pipeline/servicios/obtener-oportunidad-por-id', () => ({
  obtenerOportunidadPorId: (...args: unknown[]) => obtenerOportunidadMock(...args),
}));

import { crearProspectoAccion } from '@/modulos/pipeline/acciones/crear-prospecto';
import { asignarClienteOportunidadAccion } from '@/modulos/pipeline/acciones/asignar-cliente-oportunidad';

const OPORTUNIDAD_ID = '11111111-1111-4111-8111-111111111111';
const CLIENTE_ID = '33333333-3333-4333-8333-333333333333';
const VENDEDOR_ID = '22222222-2222-4222-8222-222222222222';

const VENDEDOR = {
  id: VENDEDOR_ID,
  email: 'v@cc.mx',
  nombreCompleto: 'Vendedor Uno',
  rol: 'vendedor' as const,
  activo: true,
  creadoEn: '2026-01-01T00:00:00Z',
  actualizadoEn: '2026-01-01T00:00:00Z',
  permisos: ['ver_clientes'],
};

const OPORTUNIDAD: Oportunidad = {
  id: OPORTUNIDAD_ID,
  folioOp: 'OP-000001',
  folioCnc: null,
  etapa: 'cotizado',
  nombreContacto: 'Ana Pérez',
  empresa: 'Metanor',
  correo: null,
  telefono: null,
  clienteId: null,
  vendedorId: VENDEDOR_ID,
  moneda: 'MXN',
  condicionesPago: null,
  prioridad: 'normal',
  ivaPorcentaje: 16,
  etiquetas: [],
  esOrdenInterna: false,
  poCliente: null,
  fechaRequerida: null,
  horasEstimadas: null,
  notas: null,
  motivoPerdida: null,
  notasPerdida: null,
  fechaUltimoContacto: null,
  fechaEnvioCotizacion: null,
  creadoEn: '2026-09-01T10:00:00Z',
  actualizadoEn: '2026-09-01T10:00:00Z',
};

const ALTA_BASE = { nombreContacto: 'Ana Pérez', empresa: 'Metanor' };

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(VENDEDOR);
  canMock.mockResolvedValue(false);
  generarFolioMock.mockResolvedValue('OP-000001');
  singleMock.mockResolvedValue({ data: { id: OPORTUNIDAD_ID }, error: null });
  eqMock.mockResolvedValue({ error: null });
  obtenerOportunidadMock.mockResolvedValue({ oportunidad: OPORTUNIDAD, lineas: [] });
  obtenerClienteParaRfqMock.mockResolvedValue({ id: CLIENTE_ID, condicionesPago: '30_dias' });
});

describe('crearProspectoAccion con cliente del catálogo (RFQ-02/03)', () => {
  it('liga el cliente y hereda sus condiciones de pago', async () => {
    const respuesta = await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });

    expect(respuesta.exito).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: CLIENTE_ID, condiciones_pago: '30_dias' }),
    );
  });

  it('no pisa las condiciones capturadas a mano', async () => {
    await crearProspectoAccion({
      ...ALTA_BASE,
      clienteId: CLIENTE_ID,
      condicionesPago: 'contado',
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: CLIENTE_ID, condiciones_pago: 'contado' }),
    );
  });

  it('sin cliente: la RFQ se crea igual, sin ligar nada', async () => {
    const respuesta = await crearProspectoAccion(ALTA_BASE);

    expect(respuesta.exito).toBe(true);
    expect(obtenerClienteParaRfqMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: null, condiciones_pago: null }),
    );
  });

  it('cliente que RLS oculta: rechaza sin insertar', async () => {
    obtenerClienteParaRfqMock.mockResolvedValue(null);

    const respuesta = await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });

    expect(respuesta).toEqual({ exito: false, error: 'Cliente no válido' });
    expect(insertMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });
});

describe('asignarClienteOportunidadAccion', () => {
  it('liga el cliente y hereda condiciones cuando se pide', async () => {
    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: true,
    });

    expect(respuesta).toEqual({
      exito: true,
      datos: { clienteId: CLIENTE_ID, condicionesPago: '30_dias' },
    });
    expect(updateMock).toHaveBeenCalledWith({
      cliente_id: CLIENTE_ID,
      condiciones_pago: '30_dias',
    });
    expect(registrarLogMock).toHaveBeenCalledTimes(1);
  });

  it('sin herencia conserva las condiciones negociadas de la oportunidad', async () => {
    obtenerOportunidadMock.mockResolvedValue({
      oportunidad: { ...OPORTUNIDAD, condicionesPago: 'contado' },
      lineas: [],
    });

    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: false,
    });

    expect(respuesta.exito).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({
      cliente_id: CLIENTE_ID,
      condiciones_pago: 'contado',
    });
  });

  it('desliga con clienteId null sin consultar el catálogo', async () => {
    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: null,
      heredarCondiciones: true,
    });

    expect(respuesta.exito).toBe(true);
    expect(obtenerClienteParaRfqMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({ cliente_id: null, condiciones_pago: null });
  });

  it('cliente que RLS oculta: rechaza sin escribir', async () => {
    obtenerClienteParaRfqMock.mockResolvedValue(null);

    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: true,
    });

    expect(respuesta).toEqual({ exito: false, error: 'Cliente no válido' });
    expect(updateMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('oportunidad ajena sin alcance de equipo: no revela que existe', async () => {
    obtenerOportunidadMock.mockResolvedValue({
      oportunidad: { ...OPORTUNIDAD, vendedorId: 'otro-vendedor' },
      lineas: [],
    });

    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: true,
    });

    expect(respuesta).toEqual({ exito: false, error: 'No encontrada' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('oportunidad ganada: no se reescribe el histórico', async () => {
    obtenerOportunidadMock.mockResolvedValue({
      oportunidad: { ...OPORTUNIDAD, etapa: 'ganada' },
      lineas: [],
    });

    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: true,
    });

    expect(respuesta.exito).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('sin sesión: rechaza antes de tocar la base de datos', async () => {
    obtenerUsuarioMock.mockResolvedValue(null);

    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: true,
    });

    expect(respuesta).toEqual({ exito: false, error: 'No autorizado' });
    expect(obtenerOportunidadMock).not.toHaveBeenCalled();
  });
});
