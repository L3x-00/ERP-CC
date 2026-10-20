import { beforeEach, describe, expect, it, vi } from 'vitest';

const { usuarioMock, canMock, logMock, resolverMock, retirarMock, versionMock, base } = vi.hoisted(
  () => ({
    usuarioMock: vi.fn(),
    canMock: vi.fn(),
    logMock: vi.fn(),
    resolverMock: vi.fn(),
    retirarMock: vi.fn(),
    versionMock: vi.fn(),
    base: {
      lectura: { data: null as unknown, error: null as unknown },
      escritura: { data: null as unknown, error: null as unknown },
      payload: undefined as unknown,
      filtros: [] as unknown[][],
      desde: [] as string[],
    },
  }),
);

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
vi.mock('@/modulos/rfq/servicios/registrar-version-rfq', () => ({
  registrarVersionRfq: (...args: unknown[]) => versionMock(...args),
}));
vi.mock('@/modulos/rfq/servicios/contacto-vigente-cliente', () => ({
  resolverContactoVigenteCliente: (...args: unknown[]) => resolverMock(...args),
  retirarContactoRecienCreado: (...args: unknown[]) => retirarMock(...args),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: (tabla: string) => {
      base.desde.push(tabla);
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(base.lectura) }) }),
        update: (payload: unknown) => {
          base.payload = payload;
          const cadena: Record<string, unknown> = {};
          for (const metodo of ['eq', 'is', 'in']) {
            cadena[metodo] = (...args: unknown[]) => {
              base.filtros.push([metodo, ...args]);
              return cadena;
            };
          }
          cadena.select = () => cadena;
          cadena.maybeSingle = () => Promise.resolve(base.escritura);
          return cadena;
        },
      };
    },
  }),
}));

import { vincularContactoVigenteRfqAccion } from '@/modulos/rfq/acciones/vincular-contacto-rfq';

const RFQ_ID = '11111111-1111-4111-8111-111111111111';
const CLIENTE_ID = '22222222-2222-4222-8222-222222222222';
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

const FILA_RFQ = {
  id: RFQ_ID,
  estado_rfq: 'INCOMPLETE',
  cliente_id: CLIENTE_ID,
  contacto_id: null,
  nombre_contacto: 'Luis Mora',
  correo: 'luis@metanor.mx',
  telefono: '664 111 2222',
};

function conPermisos(...permisos: string[]): void {
  canMock.mockImplementation(async (_usuario: unknown, permiso: string) => permisos.includes(permiso));
}

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.mockResolvedValue(USUARIO);
  conPermisos('rfq_editar', 'cliente_editar');
  logMock.mockResolvedValue(undefined);
  retirarMock.mockResolvedValue(undefined);
  versionMock.mockResolvedValue(undefined);
  base.lectura = { data: { ...FILA_RFQ }, error: null };
  base.escritura = { data: { id: RFQ_ID }, error: null };
  base.payload = undefined;
  base.filtros = [];
  base.desde = [];
  resolverMock.mockResolvedValue({ estado: 'vinculable', id: 'c-principal', creado: false });
});

describe('vincularContactoVigenteRfqAccion — permisos y entrada', () => {
  it('rechaza una entrada inválida sin tocar sesión ni datos', async () => {
    expect(await vincularContactoVigenteRfqAccion({ rfqId: 'no-es-uuid' })).toEqual({
      exito: false,
      error: 'Datos inválidos',
    });
    expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID, extra: 1 })).toEqual({
      exito: false,
      error: 'Datos inválidos',
    });
    expect(usuarioMock).not.toHaveBeenCalled();
    expect(base.desde).toHaveLength(0);
  });

  it('exige sesión', async () => {
    usuarioMock.mockResolvedValue(null);
    expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).toEqual({
      exito: false,
      error: 'No autorizado',
    });
    expect(base.desde).toHaveLength(0);
  });

  it('exige rfq_editar antes de leer o escribir', async () => {
    conPermisos('rfq_vista', 'cliente_editar');
    expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).toEqual({
      exito: false,
      error: 'Sin permiso para editar el RFQ',
    });
    expect(base.desde).toHaveLength(0);
    expect(resolverMock).not.toHaveBeenCalled();
  });

  it('un RFQ inexistente es un error', async () => {
    base.lectura = { data: null, error: null };
    expect((await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).exito).toBe(false);
  });
});

describe('vincularContactoVigenteRfqAccion — cuándo no escribe', () => {
  it.each(['CONVERTED', 'CLOSED', 'CANCELLED', 'ESTADO_DESCONOCIDO'])(
    'estado %s: no se toca',
    async (estado) => {
      base.lectura = { data: { ...FILA_RFQ, estado_rfq: estado }, error: null };

      expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).toEqual({
        exito: true,
        datos: { vinculado: false, motivo: 'estado_no_editable' },
      });
      expect(resolverMock).not.toHaveBeenCalled();
      expect(base.payload).toBeUndefined();
      expect(logMock).not.toHaveBeenCalled();
    },
  );

  it('sin cliente ligado no hay contacto que vincular', async () => {
    base.lectura = { data: { ...FILA_RFQ, cliente_id: null }, error: null };

    expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).toEqual({
      exito: true,
      datos: { vinculado: false, motivo: 'sin_cliente' },
    });
    expect(resolverMock).not.toHaveBeenCalled();
  });

  it('conserva la selección existente: con contacto ya ligado no consulta ni escribe', async () => {
    base.lectura = { data: { ...FILA_RFQ, contacto_id: 'c-elegido' }, error: null };

    expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).toEqual({
      exito: true,
      datos: { vinculado: false, motivo: 'ya_tiene_contacto' },
    });
    expect(resolverMock).not.toHaveBeenCalled();
    expect(base.payload).toBeUndefined();
    expect(logMock).not.toHaveBeenCalled();
  });

  it('sin datos del cliente ni nombre capturado válido: no inventa un contacto', async () => {
    resolverMock.mockResolvedValue({ estado: 'sin_datos' });

    expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).toEqual({
      exito: true,
      datos: { vinculado: false, motivo: 'sin_datos' },
    });
    expect(base.payload).toBeUndefined();
    expect(logMock).not.toHaveBeenCalled();
  });

  it('un fallo del resolutor es un error genérico y no escribe', async () => {
    resolverMock.mockResolvedValue({ estado: 'error' });

    expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).toEqual({
      exito: false,
      error: 'No se pudo vincular el contacto del cliente',
    });
    expect(base.payload).toBeUndefined();
  });
});

describe('vincularContactoVigenteRfqAccion — permiso para crear contactos', () => {
  it('sin cliente_editar solo puede ligar uno ya registrado: no concede creación', async () => {
    conPermisos('rfq_editar');
    resolverMock.mockResolvedValue({ estado: 'sin_permiso' });

    expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).toEqual({
      exito: true,
      datos: { vinculado: false, motivo: 'sin_permiso_crear_contacto' },
    });
    expect(resolverMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ puedeCrear: false }),
    );
    expect(base.payload).toBeUndefined();
    expect(logMock).not.toHaveBeenCalled();
  });

  it('sin cliente_editar igualmente liga un contacto ya registrado', async () => {
    conPermisos('rfq_editar');

    const respuesta = await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID });

    expect(respuesta).toEqual({
      exito: true,
      datos: { vinculado: true, contactoId: 'c-principal' },
    });
    expect(resolverMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ puedeCrear: false }),
    );
  });

  it('con rfq_editar y cliente_editar el resolutor puede crear, con los datos capturados del RFQ', async () => {
    await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID });

    expect(resolverMock).toHaveBeenCalledWith(expect.anything(), {
      clienteId: CLIENTE_ID,
      actorId: USUARIO.id,
      puedeCrear: true,
      capturado: { nombre: 'Luis Mora', correo: 'luis@metanor.mx', telefono: '664 111 2222' },
    });
  });
});

describe('vincularContactoVigenteRfqAccion — escritura, concurrencia y auditoría', () => {
  it('contacto existente/principal: escribe de forma condicional y audita', async () => {
    const respuesta = await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID });

    expect(respuesta).toEqual({
      exito: true,
      datos: { vinculado: true, contactoId: 'c-principal' },
    });
    expect(base.payload).toEqual({ contacto_id: 'c-principal' });
    // Solo sobre este RFQ, sin contacto, del mismo cliente y en estados editables.
    expect(base.filtros).toEqual([
      ['eq', 'id', RFQ_ID],
      ['is', 'contacto_id', null],
      ['eq', 'cliente_id', CLIENTE_ID],
      [
        'in',
        'estado_rfq',
        ['NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL', 'READY_FOR_PROPOSAL'],
      ],
    ]);
    expect(versionMock).toHaveBeenCalledWith(expect.anything(), {
      rfqId: RFQ_ID,
      causa: 'CABECERA',
      actorId: USUARIO.id,
      correlationId: 'correlacion-prueba',
    });
    expect(logMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'vincular_contacto_rfq',
      'pipeline',
      RFQ_ID,
      { clienteId: CLIENTE_ID, contactoId: 'c-principal', origen: 'registrado' },
      'correlacion-prueba',
    );
    expect(retirarMock).not.toHaveBeenCalled();
  });

  it('contacto creado: audita también la creación sobre el cliente', async () => {
    resolverMock.mockResolvedValue({ estado: 'vinculable', id: 'c-nuevo', creado: true });

    const respuesta = await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID });

    expect(respuesta).toEqual({ exito: true, datos: { vinculado: true, contactoId: 'c-nuevo' } });
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'crear',
      'clientes',
      CLIENTE_ID,
      { contactoId: 'c-nuevo', origen: 'rfq_vinculo_automatico', rfqId: RFQ_ID },
      'correlacion-prueba',
    );
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'vincular_contacto_rfq',
      'pipeline',
      RFQ_ID,
      { clienteId: CLIENTE_ID, contactoId: 'c-nuevo', origen: 'creado_desde_datos' },
      'correlacion-prueba',
    );
  });

  it('pierde la carrera (otro lo ligó o cambió el cliente/estado): no pisa ni audita', async () => {
    base.escritura = { data: null, error: null };

    expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).toEqual({
      exito: true,
      datos: { vinculado: false, motivo: 'concurrencia' },
    });
    expect(retirarMock).not.toHaveBeenCalled();
    expect(versionMock).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it('pierde la carrera tras crear un contacto: lo retira para no dejarlo huérfano', async () => {
    resolverMock.mockResolvedValue({ estado: 'vinculable', id: 'c-nuevo', creado: true });
    base.escritura = { data: null, error: null };

    expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).toEqual({
      exito: true,
      datos: { vinculado: false, motivo: 'concurrencia' },
    });
    expect(retirarMock).toHaveBeenCalledWith(expect.anything(), 'c-nuevo');
    expect(logMock).not.toHaveBeenCalled();
  });

  it('un error de escritura es un error genérico y retira el contacto recién creado', async () => {
    resolverMock.mockResolvedValue({ estado: 'vinculable', id: 'c-nuevo', creado: true });
    base.escritura = { data: null, error: { message: 'boom' } };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID })).toEqual({
      exito: false,
      error: 'No se pudo vincular el contacto del cliente',
    });
    expect(retirarMock).toHaveBeenCalledWith(expect.anything(), 'c-nuevo');
    expect(logMock).not.toHaveBeenCalled();
  });

  it('no retira un contacto que ya existía cuando el vínculo no se escribe', async () => {
    base.escritura = { data: null, error: null };

    await vincularContactoVigenteRfqAccion({ rfqId: RFQ_ID });

    expect(retirarMock).not.toHaveBeenCalled();
  });
});
