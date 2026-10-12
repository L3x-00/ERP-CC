// Obs. cliente 2026-10-12: la edición del cliente también actualiza (o crea) el
// contacto principal y sincroniza la columna legada `clientes.contacto`.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usuarioMock, canMock, logMock, tablas, capturas } = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  canMock: vi.fn(),
  logMock: vi.fn(),
  tablas: { actual: {} as Record<string, unknown> },
  capturas: {
    updateContacto: undefined as unknown,
    insertContacto: undefined as unknown,
    parcheClientes: undefined as unknown,
  },
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

import { actualizarClienteAccion } from '@/modulos/clientes/acciones/actualizar-cliente';

const CLIENTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const USUARIO = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'admin@orca.test',
  nombreCompleto: 'Admin',
  rol: 'admin' as const,
  activo: true,
  creadoEn: '2026-08-12T10:00:00.000Z',
  actualizadoEn: '2026-08-12T10:00:00.000Z',
  permisos: [],
};

/** Builder de una operación terminal (update/insert) con `eq` encadenable. */
function resultadoSimple(resultado: unknown) {
  const builder: Record<string, unknown> = {};
  builder.eq = () => builder;
  builder.select = () => builder;
  builder.single = async () => resultado;
  builder.maybeSingle = async () => resultado;
  builder.then = (
    ok: (valor: unknown) => unknown,
    err?: (error: unknown) => unknown,
  ) => Promise.resolve(resultado).then(ok, err);
  return builder;
}

function cadenaContactos(opciones: {
  principal?: { id: string } | null;
  errorConsulta?: unknown;
  errorUpdate?: unknown;
  errorInsert?: unknown;
}) {
  const builder: Record<string, unknown> = {};
  const mismo = () => builder;
  builder.select = mismo;
  builder.eq = mismo;
  builder.maybeSingle = async () => ({
    data: opciones.principal ?? null,
    error: opciones.errorConsulta ?? null,
  });
  builder.update = (fila: unknown) => {
    capturas.updateContacto = fila;
    return resultadoSimple({ error: opciones.errorUpdate ?? null });
  };
  builder.insert = (fila: unknown) => {
    capturas.insertContacto = fila;
    return resultadoSimple({ error: opciones.errorInsert ?? null });
  };
  return builder;
}

function cadenaClientes(error: unknown = null) {
  const builder: Record<string, unknown> = {};
  builder.update = (fila: unknown) => {
    capturas.parcheClientes = fila;
    return resultadoSimple({ error });
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue(USUARIO);
  canMock.mockResolvedValue(true);
  logMock.mockResolvedValue(undefined);
  tablas.actual = {};
  capturas.updateContacto = undefined;
  capturas.insertContacto = undefined;
  capturas.parcheClientes = undefined;
});

describe('actualizarClienteAccion — contacto principal (obs. cliente)', () => {
  it('actualiza el principal existente y sincroniza la columna legada', async () => {
    tablas.actual = {
      contactos_cliente: cadenaContactos({ principal: { id: 'ct-1' } }),
      clientes: cadenaClientes(),
    };

    const respuesta = await actualizarClienteAccion({
      id: CLIENTE_ID,
      razonSocial: 'ACME Manufactura SA',
      contactoPrincipal: {
        nombre: '  Laura Compras  ',
        puesto: 'Compras',
        correo: 'LAURA@ACME.MX',
        telefono: ' 555-1234 ',
      },
    });

    expect(respuesta).toEqual({ exito: true, datos: { id: CLIENTE_ID } });
    expect(capturas.updateContacto).toEqual({
      nombre: 'Laura Compras',
      puesto: 'Compras',
      correo: 'laura@acme.mx',
      telefono: '555-1234',
    });
    expect(capturas.parcheClientes).toMatchObject({
      razon_social: 'ACME Manufactura SA',
      contacto: 'Laura Compras',
    });
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'actualizar',
      'clientes',
      CLIENTE_ID,
      expect.objectContaining({ contactoPrincipal: 'actualizado' }),
      'correlacion-prueba',
    );
  });

  it('crea el principal cuando el cliente no tiene uno activo', async () => {
    tablas.actual = {
      contactos_cliente: cadenaContactos({ principal: null }),
      clientes: cadenaClientes(),
    };

    const respuesta = await actualizarClienteAccion({
      id: CLIENTE_ID,
      contactoPrincipal: { nombre: 'Laura Compras' },
    });

    expect(respuesta.exito).toBe(true);
    expect(capturas.insertContacto).toMatchObject({
      cliente_id: CLIENTE_ID,
      nombre: 'Laura Compras',
      es_principal: true,
      activo: true,
      creado_por: USUARIO.id,
    });
    expect(capturas.parcheClientes).toMatchObject({ contacto: 'Laura Compras' });
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'actualizar',
      'clientes',
      CLIENTE_ID,
      expect.objectContaining({ contactoPrincipal: 'creado' }),
      'correlacion-prueba',
    );
  });

  it('sin otros cambios, el contacto solo se guarda igual', async () => {
    tablas.actual = {
      contactos_cliente: cadenaContactos({ principal: { id: 'ct-1' } }),
      clientes: cadenaClientes(),
    };

    const respuesta = await actualizarClienteAccion({
      id: CLIENTE_ID,
      contactoPrincipal: { nombre: 'Laura Compras' },
    });

    expect(respuesta.exito).toBe(true);
    expect(capturas.parcheClientes).toEqual({ contacto: 'Laura Compras' });
  });

  it('sin cambios de cliente ni contacto responde «Sin cambios»', async () => {
    tablas.actual = {};

    const respuesta = await actualizarClienteAccion({ id: CLIENTE_ID });

    expect(respuesta.exito).toBe(false);
    if (!respuesta.exito) expect(respuesta.error).toBe('Sin cambios');
    expect(capturas.parcheClientes).toBeUndefined();
  });

  it('si el contacto falla, no se toca el cliente', async () => {
    tablas.actual = {
      contactos_cliente: cadenaContactos({
        principal: { id: 'ct-1' },
        errorUpdate: { message: 'boom' },
      }),
      clientes: cadenaClientes(),
    };

    const respuesta = await actualizarClienteAccion({
      id: CLIENTE_ID,
      contactoPrincipal: { nombre: 'Laura Compras' },
    });

    expect(respuesta.exito).toBe(false);
    if (!respuesta.exito) expect(respuesta.error).toContain('contacto principal');
    expect(capturas.parcheClientes).toBeUndefined();
  });
});
