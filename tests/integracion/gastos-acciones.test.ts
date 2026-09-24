import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  obtenerUsuarioMock,
  canMock,
  registrarLogMock,
  registrarGastoMock,
  cambiarEstadoMock,
  obtenerRentabilidadMock,
  configuracionMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  registrarGastoMock: vi.fn(),
  cambiarEstadoMock: vi.fn(),
  obtenerRentabilidadMock: vi.fn(),
  configuracionMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => canMock(...argumentos),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...argumentos: unknown[]) => registrarLogMock(...argumentos),
}));
/**
 * `registrarGastoAccion` valida la categoría contra `obtenerConfiguracionGeneral()`,
 * que abre su propio cliente admin por defecto. El doble debe responder a esa
 * lectura (`from('configuracion_sistema')…maybeSingle()`): con solo `rpc` la
 * acción moría en `cliente.from is not a function` y devolvía el error genérico.
 * Se responde `data: null` para que corra el fallback real de `combinarConfiguracion`,
 * que entrega el catálogo de categorías por defecto sin tocar la base.
 */
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    rpc: vi.fn(),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => configuracionMock(),
        }),
      }),
    }),
  }),
}));
vi.mock('@/modulos/gastos/servicios/indice', async () => {
  const real = await vi.importActual<typeof import('@/modulos/gastos/servicios/indice')>('@/modulos/gastos/servicios/indice');
  return {
    ...real,
    registrarGastoServicio: (...argumentos: unknown[]) => registrarGastoMock(...argumentos),
    cambiarEstadoGastoServicio: (...argumentos: unknown[]) => cambiarEstadoMock(...argumentos),
    obtenerRentabilidadOrdenServicio: (...argumentos: unknown[]) => obtenerRentabilidadMock(...argumentos),
    mensajeErrorGastos: () => 'No se pudo procesar el gasto',
  };
});

import { cambiarEstadoGastoAccion } from '@/modulos/gastos/acciones/cambiar-estado-gasto';
import { obtenerRentabilidadOrdenAccion } from '@/modulos/gastos/acciones/obtener-rentabilidad-orden';
import { registrarGastoAccion } from '@/modulos/gastos/acciones/registrar-gasto';
import { guardarGastoA19Accion } from '@/modulos/gastos/acciones/guardar-gasto-a19';
import { obtenerUrlComprobanteGastoAccion } from '@/modulos/gastos/acciones/obtener-url-comprobante';
import { prepararSubidaComprobanteGastoAccion } from '@/modulos/gastos/acciones/preparar-subida-comprobante';

const USUARIO_BASE = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'usuario@orca.test',
  nombreCompleto: 'Usuario de prueba',
  rol: 'vendedor' as const,
  activo: true,
  creadoEn: '2026-09-09T00:00:00.000Z',
  actualizadoEn: '2026-09-09T00:00:00.000Z',
  permisos: [] as string[],
};
const OPERADOR = { ...USUARIO_BASE, rol: 'operador' as const, id: '10000000-0000-4000-8000-000000000002' };
const CONTADOR = { ...USUARIO_BASE, rol: 'contador' as const, id: '10000000-0000-4000-8000-000000000003', permisos: ['registrar_gastos', 'ver_finanzas'] };
const GASTO = {
  id: '20000000-0000-4000-8000-000000000001',
  folio: 'GTO-001001',
  ordenId: null,
  proveedorId: null,
  categoria: 'servicios_generales' as const,
  descripcion: 'Servicio de prueba',
  montoSubtotal: 100,
  montoIva: 16,
  montoTotal: 116,
  moneda: 'MXN' as const,
  tipoCambio: 1,
  estadoPago: 'pendiente' as const,
  fechaGasto: '2026-09-09',
  fechaVencimiento: null,
  comprobanteUrl: null,
  folioComprobante: null,
  metodoPago: 'transferencia' as const,
  datosOcrJson: null,
  notas: null,
  creadoPor: CONTADOR.id,
  creadoEn: '2026-09-09T00:00:00.000Z',
  actualizadoEn: '2026-09-09T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(USUARIO_BASE);
  canMock.mockResolvedValue(false);
  registrarLogMock.mockResolvedValue(undefined);
  registrarGastoMock.mockResolvedValue(GASTO);
  cambiarEstadoMock.mockResolvedValue({ ...GASTO, estadoPago: 'pagado' });
  obtenerRentabilidadMock.mockResolvedValue({ ordenId: '11111111-1111-4111-8111-111111111111' });
  // Singleton ausente → `combinarConfiguracion` aplica el catálogo por defecto.
  configuracionMock.mockResolvedValue({ data: null, error: null });
});

const entrada = {
  tipoGasto: 'variable',
  categoria: 'servicios_generales',
  descripcion: 'Servicio de prueba',
  montoSubtotal: 100,
  montoIva: 16,
  montoTotal: 116,
  moneda: 'MXN',
  tipoCambio: 1,
  fechaGasto: '2026-09-09',
};

describe('acciones seguras de Gastos', () => {
  it('rechaza guardado A19 y URL de comprobante a vendedor sin permiso', async () => {
    const formulario = new FormData();
    formulario.set('datos', JSON.stringify({ ...entrada, modo: 'crear' }));
    await expect(guardarGastoA19Accion(formulario)).resolves.toEqual({
      exito: false, error: 'Sin permiso para guardar gastos',
    });
    await expect(obtenerUrlComprobanteGastoAccion({ gastoId: GASTO.id })).resolves.toEqual({
      exito: false, error: 'Sin permiso para consultar comprobantes',
    });
    await expect(prepararSubidaComprobanteGastoAccion({ mime: 'image/png', tamano: 100 })).resolves.toEqual({
      exito: false, error: 'Sin permiso para subir comprobantes',
    });
    expect(registrarGastoMock).not.toHaveBeenCalled();
  });
  it.each([['operador', OPERADOR], ['vendedor', USUARIO_BASE]])('%s no puede registrar gastos', async (_rol, usuario) => {
    obtenerUsuarioMock.mockResolvedValue(usuario);
    await expect(registrarGastoAccion(entrada)).resolves.toEqual({
      exito: false,
      error: 'Sin permiso para registrar gastos',
    });
    expect(registrarGastoMock).not.toHaveBeenCalled();
  });

  it('contador registra un gasto mediante servicio y auditoría', async () => {
    obtenerUsuarioMock.mockResolvedValue(CONTADOR);
    canMock.mockResolvedValue(true);
    const respuesta = await registrarGastoAccion(entrada);
    expect(respuesta).toEqual({ exito: true, datos: GASTO });
    expect(registrarGastoMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(entrada), CONTADOR.id);
    expect(registrarLogMock).toHaveBeenCalledWith(CONTADOR, 'registrar_gasto', 'gastos', GASTO.id, expect.anything());
  });

  it('rechaza una categoría fuera del catálogo configurado', async () => {
    obtenerUsuarioMock.mockResolvedValue(CONTADOR);
    canMock.mockResolvedValue(true);
    // Catálogo configurado que NO incluye `servicios_generales`: la acción debe
    // frenar antes de llamar al servicio. Cubre que la lectura de configuración
    // se ejerce de verdad y no queda neutralizada por el doble.
    configuracionMock.mockResolvedValue({
      data: {
        id: 'main',
        empresa_json: {},
        tarifas_json: {},
        plantillas_doc_json: {},
        tiers_json: {},
        categorias_gasto_json: { categorias: ['nomina'] },
        tipo_cambio_usd: 18,
        iva_porcentaje_default: 16,
        actualizado_por: null,
        actualizado_en: '2026-09-09T00:00:00.000Z',
      },
      error: null,
    });
    await expect(registrarGastoAccion(entrada)).resolves.toEqual({
      exito: false,
      error: 'La categoría no está en el catálogo configurado',
    });
    expect(registrarGastoMock).not.toHaveBeenCalled();
  });

  it('usuario sin permiso no puede cambiar el estado', async () => {
    const respuesta = await cambiarEstadoGastoAccion({
      gastoId: GASTO.id,
      nuevoEstado: 'pagado',
      estadoEsperado: 'pendiente',
    });
    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para cambiar estados de gastos' });
    expect(cambiarEstadoMock).not.toHaveBeenCalled();
  });

  it('operador y vendedor no pueden consultar rentabilidad', async () => {
    for (const usuario of [OPERADOR, USUARIO_BASE]) {
      obtenerUsuarioMock.mockResolvedValue(usuario);
      canMock.mockResolvedValue(false);
      await expect(obtenerRentabilidadOrdenAccion({ ordenId: GASTO.id }))
        .resolves.toEqual({ exito: false, error: 'Sin permiso para consultar rentabilidad' });
    }
    expect(obtenerRentabilidadMock).not.toHaveBeenCalled();
  });

  it('contador cambia estado con compare-and-set y auditoría', async () => {
    obtenerUsuarioMock.mockResolvedValue(CONTADOR);
    canMock.mockResolvedValue(true);
    const respuesta = await cambiarEstadoGastoAccion({
      gastoId: GASTO.id,
      nuevoEstado: 'pagado',
      estadoEsperado: 'pendiente',
    });
    expect(respuesta.exito).toBe(true);
    expect(cambiarEstadoMock).toHaveBeenCalledWith(expect.anything(), {
      gastoId: GASTO.id,
      nuevoEstado: 'pagado',
      estadoEsperado: 'pendiente',
    }, CONTADOR.id);
    expect(registrarLogMock).toHaveBeenCalledWith(CONTADOR, 'cambiar_estado_gasto', 'gastos', GASTO.id, expect.anything());
  });
});
