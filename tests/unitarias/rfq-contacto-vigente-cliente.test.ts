import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import {
  asegurarContactoCliente,
  datosContactoCreable,
  resolverContactoVigenteCliente,
  retirarContactoRecienCreado,
} from '@/modulos/rfq/servicios/contacto-vigente-cliente';

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

type Resultado = { data: unknown; error: unknown };

type Registro = {
  inserciones: unknown[];
  ordenes: unknown[][];
  filtros: unknown[][];
  borrados: unknown[][];
};

function cadena(resultado: Resultado, registro: Registro, resultadoSingle?: Resultado) {
  const builder: Record<string, unknown> = {};
  let borrando = false;
  builder.select = () => builder;
  builder.eq = (...args: unknown[]) => {
    (borrando ? registro.borrados : registro.filtros).push(args);
    return borrando ? Promise.resolve(resultado) : builder;
  };
  builder.order = (...args: unknown[]) => {
    registro.ordenes.push(args);
    return builder;
  };
  builder.delete = () => {
    borrando = true;
    return builder;
  };
  builder.maybeSingle = () => Promise.resolve(resultadoSingle ?? resultado);
  builder.single = () => Promise.resolve(resultadoSingle ?? resultado);
  builder.insert = (fila: unknown) => {
    registro.inserciones.push(fila);
    return builder;
  };
  builder.then = (
    onFulfilled: (valor: Resultado) => unknown,
    onRejected?: (error: unknown) => unknown,
  ) => Promise.resolve(resultado).then(onFulfilled, onRejected);
  return builder;
}

function nuevoRegistro(): Registro {
  return { inserciones: [], ordenes: [], filtros: [], borrados: [] };
}

function adminCon(tablas: Record<string, unknown>): SupabaseClient<Database> {
  return { from: (tabla: string) => tablas[tabla] } as unknown as SupabaseClient<Database>;
}

const SIN_CONTACTOS: Resultado = { data: [], error: null };
const CONTACTO_NUEVO: Resultado = { data: { id: 'c-nuevo' }, error: null };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('datosContactoCreable — sin inventar datos', () => {
  const CLIENTE_COMPLETO = {
    contacto: ' Ana Pérez ',
    correo: 'ana@metanor.mx',
    telefono: '664 000 0000',
  };

  it('usa el contacto propio del cliente', () => {
    expect(datosContactoCreable(CLIENTE_COMPLETO)).toEqual({
      nombre: 'Ana Pérez',
      correo: 'ana@metanor.mx',
      telefono: '664 000 0000',
    });
  });

  it('cliente con nombre: sus datos mandan y lo capturado completa lo que falta', () => {
    expect(
      datosContactoCreable(
        { contacto: 'Ana Pérez', correo: null, telefono: '664 000 0000' },
        { nombre: 'Otra Persona', correo: 'otra@x.com', telefono: '664 999 9999' },
      ),
    ).toEqual({ nombre: 'Ana Pérez', correo: 'otra@x.com', telefono: '664 000 0000' });
  });

  it('cliente solo con teléfono: reutiliza el nombre ya capturado en el RFQ', () => {
    expect(
      datosContactoCreable(
        { contacto: null, correo: null, telefono: '664 000 0000' },
        { nombre: ' Luis Mora ', correo: null, telefono: null },
      ),
    ).toEqual({ nombre: 'Luis Mora', correo: null, telefono: '664 000 0000' });
  });

  it('cliente solo con correo: reutiliza el nombre ya capturado en el RFQ', () => {
    expect(
      datosContactoCreable(
        { contacto: '  ', correo: 'compras@metanor.mx', telefono: null },
        { nombre: 'Luis Mora' },
      ),
    ).toEqual({ nombre: 'Luis Mora', correo: 'compras@metanor.mx', telefono: null });
  });

  it('con el nombre capturado mandan el correo y teléfono capturados junto a él', () => {
    expect(
      datosContactoCreable(
        { contacto: null, correo: 'general@metanor.mx', telefono: '664 000 0000' },
        { nombre: 'Luis Mora', correo: 'luis@metanor.mx', telefono: '664 111 2222' },
      ),
    ).toEqual({ nombre: 'Luis Mora', correo: 'luis@metanor.mx', telefono: '664 111 2222' });
  });

  it('sin nombre válido en ninguna fuente no hay contacto que crear', () => {
    const sinNombre = { contacto: null, correo: 'compras@metanor.mx', telefono: '664 000 0000' };
    expect(datosContactoCreable(sinNombre)).toBeNull();
    expect(datosContactoCreable(sinNombre, { nombre: null })).toBeNull();
    expect(datosContactoCreable(sinNombre, { nombre: 'L' })).toBeNull();
    expect(datosContactoCreable(sinNombre, { nombre: '--' })).toBeNull();
    expect(datosContactoCreable(sinNombre, { nombre: '12345' })).toBeNull();
    expect(datosContactoCreable(sinNombre, { nombre: 'x'.repeat(121) })).toBeNull();
    expect(datosContactoCreable(null)).toBeNull();
  });

  it('descarta correo o teléfono que la tabla rechazaría en vez de fallar', () => {
    expect(
      datosContactoCreable({ contacto: 'Ana Pérez', correo: 'no-es-correo', telefono: '12' }),
    ).toEqual({ nombre: 'Ana Pérez', correo: null, telefono: null });
  });
});

describe('resolverContactoVigenteCliente', () => {
  it('contacto existente: liga el principal vigente sin crear nada ni exigir permiso de creación', async () => {
    const contactos = nuevoRegistro();
    const admin = adminCon({
      contactos_cliente: cadena(
        { data: [{ id: 'c-principal' }, { id: 'c-2' }], error: null },
        contactos,
      ),
      clientes: cadena({ data: null, error: null }, nuevoRegistro()),
    });

    const resultado = await resolverContactoVigenteCliente(admin, {
      clienteId: CLIENTE_ID,
      actorId: ACTOR_ID,
      puedeCrear: false,
    });

    expect(resultado).toEqual({ estado: 'vinculable', id: 'c-principal', creado: false });
    expect(contactos.inserciones).toHaveLength(0);
    // Solo vigentes del cliente y con el principal primero.
    expect(contactos.filtros).toEqual(
      expect.arrayContaining([
        ['cliente_id', CLIENTE_ID],
        ['activo', true],
      ]),
    );
    expect(contactos.ordenes[0]).toEqual(['es_principal', { ascending: false }]);
  });

  it('principal del cliente: sin contactos registrados crea uno con sus datos propios', async () => {
    const contactos = nuevoRegistro();
    const admin = adminCon({
      contactos_cliente: cadena(SIN_CONTACTOS, contactos, CONTACTO_NUEVO),
      clientes: cadena(
        {
          data: { contacto: ' Ana Pérez ', correo: 'ana@metanor.mx', telefono: '664 000 0000' },
          error: null,
        },
        nuevoRegistro(),
      ),
    });

    const resultado = await resolverContactoVigenteCliente(admin, {
      clienteId: CLIENTE_ID,
      actorId: ACTOR_ID,
      puedeCrear: true,
    });

    expect(resultado).toEqual({ estado: 'vinculable', id: 'c-nuevo', creado: true });
    expect(contactos.inserciones).toEqual([
      {
        cliente_id: CLIENTE_ID,
        nombre: 'Ana Pérez',
        correo: 'ana@metanor.mx',
        telefono: '664 000 0000',
        es_principal: false,
        creado_por: ACTOR_ID,
      },
    ]);
  });

  it('cliente solo con teléfono: crea el contacto con el nombre ya capturado en el RFQ', async () => {
    const contactos = nuevoRegistro();
    const admin = adminCon({
      contactos_cliente: cadena(SIN_CONTACTOS, contactos, CONTACTO_NUEVO),
      clientes: cadena(
        { data: { contacto: null, correo: null, telefono: '664 000 0000' }, error: null },
        nuevoRegistro(),
      ),
    });

    const resultado = await resolverContactoVigenteCliente(admin, {
      clienteId: CLIENTE_ID,
      actorId: ACTOR_ID,
      puedeCrear: true,
      capturado: { nombre: 'Luis Mora', correo: null, telefono: null },
    });

    expect(resultado).toEqual({ estado: 'vinculable', id: 'c-nuevo', creado: true });
    expect(contactos.inserciones[0]).toEqual(
      expect.objectContaining({ nombre: 'Luis Mora', correo: null, telefono: '664 000 0000' }),
    );
  });

  it('sin permiso de creación no escribe: reporta que habría que crear el contacto', async () => {
    const contactos = nuevoRegistro();
    const admin = adminCon({
      contactos_cliente: cadena(SIN_CONTACTOS, contactos, CONTACTO_NUEVO),
      clientes: cadena(
        { data: { contacto: 'Ana Pérez', correo: null, telefono: null }, error: null },
        nuevoRegistro(),
      ),
    });

    expect(
      await resolverContactoVigenteCliente(admin, {
        clienteId: CLIENTE_ID,
        actorId: ACTOR_ID,
        puedeCrear: false,
      }),
    ).toEqual({ estado: 'sin_permiso' });
    expect(contactos.inserciones).toHaveLength(0);
  });

  it('sin datos: no inventa un contacto cuando no hay nombre válido en el cliente ni en el RFQ', async () => {
    const contactos = nuevoRegistro();
    const admin = adminCon({
      contactos_cliente: cadena(SIN_CONTACTOS, contactos),
      clientes: cadena(
        { data: { contacto: '  ', correo: 'compras@metanor.mx', telefono: null }, error: null },
        nuevoRegistro(),
      ),
    });

    expect(
      await resolverContactoVigenteCliente(admin, {
        clienteId: CLIENTE_ID,
        actorId: ACTOR_ID,
        puedeCrear: true,
        capturado: { nombre: 'x', correo: null, telefono: null },
      }),
    ).toEqual({ estado: 'sin_datos' });
    expect(contactos.inserciones).toHaveLength(0);
  });

  it('cliente inexistente: sin datos', async () => {
    const admin = adminCon({
      contactos_cliente: cadena(SIN_CONTACTOS, nuevoRegistro()),
      clientes: cadena({ data: null, error: null }, nuevoRegistro()),
    });

    expect(
      await resolverContactoVigenteCliente(admin, {
        clienteId: CLIENTE_ID,
        actorId: ACTOR_ID,
        puedeCrear: true,
      }),
    ).toEqual({ estado: 'sin_datos' });
  });

  it('un fallo de lectura o de inserción no lanza: devuelve error', async () => {
    const lecturaContactos = adminCon({
      contactos_cliente: cadena({ data: null, error: { message: 'boom' } }, nuevoRegistro()),
      clientes: cadena({ data: null, error: null }, nuevoRegistro()),
    });
    const lecturaCliente = adminCon({
      contactos_cliente: cadena(SIN_CONTACTOS, nuevoRegistro()),
      clientes: cadena({ data: null, error: { message: 'boom' } }, nuevoRegistro()),
    });
    const inserccion = adminCon({
      contactos_cliente: cadena(SIN_CONTACTOS, nuevoRegistro(), {
        data: null,
        error: { message: 'check violation' },
      }),
      clientes: cadena(
        { data: { contacto: 'Ana Pérez', correo: null, telefono: null }, error: null },
        nuevoRegistro(),
      ),
    });

    for (const admin of [lecturaContactos, lecturaCliente, inserccion]) {
      expect(
        await resolverContactoVigenteCliente(admin, {
          clienteId: CLIENTE_ID,
          actorId: ACTOR_ID,
          puedeCrear: true,
        }),
      ).toEqual({ estado: 'error' });
    }
  });
});

describe('retirarContactoRecienCreado', () => {
  it('borra solo el contacto indicado', async () => {
    const contactos = nuevoRegistro();
    const admin = adminCon({ contactos_cliente: cadena({ data: null, error: null }, contactos) });

    await retirarContactoRecienCreado(admin, 'c-nuevo');

    expect(contactos.borrados).toEqual([['id', 'c-nuevo']]);
  });

  it('si la FK impide el borrado (ya está ligado) solo lo registra', async () => {
    const admin = adminCon({
      contactos_cliente: cadena({ data: null, error: { message: 'fk' } }, nuevoRegistro()),
    });

    await expect(retirarContactoRecienCreado(admin, 'c-nuevo')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('asegurarContactoCliente', () => {
  it('reutiliza un contacto vigente con los mismos datos (sin distinguir mayúsculas)', async () => {
    const contactos = nuevoRegistro();
    const admin = adminCon({
      contactos_cliente: cadena(
        {
          data: [{ id: 'c-1', nombre: 'Ana Pérez', correo: 'ANA@x.com', telefono: null }],
          error: null,
        },
        contactos,
      ),
    });

    expect(
      await asegurarContactoCliente(admin, {
        clienteId: CLIENTE_ID,
        nombre: ' ana pérez ',
        correo: 'ana@x.com',
        telefono: null,
        actorId: ACTOR_ID,
      }),
    ).toEqual({ exito: true, id: 'c-1', creado: false });
    expect(contactos.inserciones).toHaveLength(0);
  });

  it('crea el contacto cuando no hay coincidencia', async () => {
    const contactos = nuevoRegistro();
    const admin = adminCon({
      contactos_cliente: cadena(SIN_CONTACTOS, contactos, CONTACTO_NUEVO),
    });

    expect(
      await asegurarContactoCliente(admin, {
        clienteId: CLIENTE_ID,
        nombre: 'Luis',
        correo: null,
        telefono: '664 123 4567',
        actorId: ACTOR_ID,
      }),
    ).toEqual({ exito: true, id: 'c-nuevo', creado: true });
    expect(contactos.inserciones[0]).toEqual({
      cliente_id: CLIENTE_ID,
      nombre: 'Luis',
      correo: null,
      telefono: '664 123 4567',
      es_principal: false,
      creado_por: ACTOR_ID,
    });
  });
});
