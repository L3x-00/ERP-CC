import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usuarioMock, canMock, logMock, tablas } = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  canMock: vi.fn(),
  logMock: vi.fn(),
  tablas: { actual: {} as Record<string, unknown> },
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => logMock(...args),
  nuevoCorrelationId: () => 'correlacion-prueba',
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: (tabla: string) => tablas.actual[tabla],
  }),
}));

import {
  asegurarContactoRfqAccion,
  obtenerContactoPrincipalRfqAccion,
} from '@/modulos/rfq/acciones/contactos-rfq';

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';

const USUARIO = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'vendedor@orca.test',
  nombreCompleto: 'Vendedor',
  rol: 'vendedor' as const,
  activo: true,
  creadoEn: '2026-08-12T10:00:00.000Z',
  actualizadoEn: '2026-08-12T10:00:00.000Z',
  permisos: [],
};

type ResultadoConsulta = { data: unknown; error: unknown };

function cadena(
  resultado: ResultadoConsulta,
  opciones: { capturas?: unknown[]; resultadoSingle?: ResultadoConsulta } = {},
) {
  const builder: Record<string, unknown> = {};
  const mismo = () => builder;
  builder.select = mismo;
  builder.eq = mismo;
  builder.order = mismo;
  builder.limit = mismo;
  builder.in = mismo;
  builder.maybeSingle = () => Promise.resolve(opciones.resultadoSingle ?? resultado);
  builder.single = () => Promise.resolve(opciones.resultadoSingle ?? resultado);
  builder.insert = (fila: unknown) => {
    opciones.capturas?.push(fila);
    return builder;
  };
  builder.then = (
    onFulfilled: (valor: ResultadoConsulta) => unknown,
    onRejected?: (error: unknown) => unknown,
  ) => Promise.resolve(resultado).then(onFulfilled, onRejected);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue(USUARIO);
  canMock.mockResolvedValue(true);
  logMock.mockResolvedValue(undefined);
  tablas.actual = {};
});

describe('obtenerContactoPrincipalRfqAccion', () => {
  it('devuelve los datos de contacto del cliente', async () => {
    tablas.actual = {
      clientes: cadena({
        data: { contacto: 'Ana Pérez', correo: 'ana@x.com', telefono: null },
        error: null,
      }),
    };
    expect(await obtenerContactoPrincipalRfqAccion({ clienteId: CLIENTE_ID })).toEqual({
      exito: true,
      datos: { nombre: 'Ana Pérez', correo: 'ana@x.com', telefono: null },
    });
  });

  it('devuelve null cuando el cliente no tiene datos y exige permiso', async () => {
    tablas.actual = {
      clientes: cadena({ data: { contacto: '', correo: null, telefono: ' ' }, error: null }),
    };
    expect(await obtenerContactoPrincipalRfqAccion({ clienteId: CLIENTE_ID })).toEqual({
      exito: true,
      datos: null,
    });

    canMock.mockResolvedValueOnce(false);
    const sinPermiso = await obtenerContactoPrincipalRfqAccion({ clienteId: CLIENTE_ID });
    expect(sinPermiso.exito).toBe(false);
  });
});

describe('asegurarContactoRfqAccion', () => {
  it('reutiliza un contacto vigente con los mismos datos', async () => {
    const capturas: unknown[] = [];
    tablas.actual = {
      clientes: cadena({ data: { id: CLIENTE_ID }, error: null }),
      contactos_cliente: cadena(
        {
          data: [{ id: 'c-1', nombre: 'Ana Pérez', correo: 'ana@x.com', telefono: null }],
          error: null,
        },
        { capturas },
      ),
    };

    expect(
      await asegurarContactoRfqAccion({
        clienteId: CLIENTE_ID,
        nombre: ' ana pérez ',
        correo: 'ana@x.com',
      }),
    ).toEqual({ exito: true, datos: { id: 'c-1' } });
    expect(capturas).toHaveLength(0);
  });

  it('crea el contacto del cliente cuando no existe y lo audita', async () => {
    const capturas: unknown[] = [];
    tablas.actual = {
      clientes: cadena({ data: { id: CLIENTE_ID }, error: null }),
      contactos_cliente: cadena(
        { data: [], error: null },
        { capturas, resultadoSingle: { data: { id: 'c-nuevo' }, error: null } },
      ),
    };

    expect(
      await asegurarContactoRfqAccion({
        clienteId: CLIENTE_ID,
        nombre: 'Luis',
        telefono: '664 123 4567',
      }),
    ).toEqual({ exito: true, datos: { id: 'c-nuevo' } });
    expect(capturas).toContainEqual(
      expect.objectContaining({ cliente_id: CLIENTE_ID, nombre: 'Luis', telefono: '664 123 4567' }),
    );
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'crear',
      'clientes',
      CLIENTE_ID,
      expect.objectContaining({ contactoId: 'c-nuevo' }),
    );
  });

  it('rechaza un cliente inexistente y entradas inválidas', async () => {
    tablas.actual = { clientes: cadena({ data: null, error: null }) };
    const inexistente = await asegurarContactoRfqAccion({
      clienteId: CLIENTE_ID,
      nombre: 'Luis',
    });
    expect(inexistente).toEqual({ exito: false, error: 'El cliente no existe' });

    const invalido = await asegurarContactoRfqAccion({ clienteId: CLIENTE_ID, nombre: ' ' });
    expect(invalido.exito).toBe(false);
  });
});
