import { describe, expect, it } from 'vitest';

import {
  VALOR_CONTACTO_PRINCIPAL,
  contactoSugeridoRfq,
  opcionesContactoRfq,
} from '@/modulos/rfq/utilidades/contacto-rfq';

describe('opcionesContactoRfq — contacto del cliente en la Solicitud', () => {
  it('sin contactos ni datos del cliente no ofrece opciones (campo libre)', () => {
    expect(opcionesContactoRfq([], null)).toEqual([]);
    expect(opcionesContactoRfq([], { nombre: null, correo: null, telefono: null })).toEqual([]);
  });

  it('ofrece el contacto propio del cliente con correo y teléfono', () => {
    const opciones = opcionesContactoRfq([], {
      nombre: 'Ana Pérez',
      correo: 'ana@metanor.mx',
      telefono: '664 000 0000',
    });
    expect(opciones).toEqual([
      {
        valor: VALOR_CONTACTO_PRINCIPAL,
        etiqueta: 'Ana Pérez · ana@metanor.mx · 664 000 0000',
      },
    ]);
  });

  it('con contactos vigentes agrega el del cliente al inicio sin duplicarlo', () => {
    const contactos = [{ id: 'c-1', nombre: 'Pedro', correo: 'pedro@x.com' }];
    const opciones = opcionesContactoRfq(contactos, {
      nombre: 'Ana Pérez',
      correo: 'ana@x.com',
      telefono: null,
    });
    expect(opciones).toHaveLength(2);
    expect(opciones[0]?.valor).toBe(VALOR_CONTACTO_PRINCIPAL);
    expect(opciones[1]).toEqual({ valor: 'c-1', etiqueta: 'Pedro · pedro@x.com' });

    const duplicado = opcionesContactoRfq(contactos, {
      nombre: ' pedro ',
      correo: 'PEDRO@x.com',
      telefono: null,
    });
    expect(duplicado).toEqual([{ valor: 'c-1', etiqueta: 'Pedro · pedro@x.com' }]);
  });

  it('ofrece un contacto del cliente aunque no tenga correo', () => {
    const opciones = opcionesContactoRfq([], {
      nombre: 'Ventas',
      correo: null,
      telefono: '664 123 4567',
    });
    expect(opciones[0]?.etiqueta).toBe('Ventas · 664 123 4567');
  });
});

describe('contactoSugeridoRfq — contacto por defecto del cliente', () => {
  const contactos = [
    { id: 'c-principal', nombre: 'Ana Pérez', correo: 'ana@x.com' },
    { id: 'c-2', nombre: 'Pedro', correo: null },
  ];

  it('con contactos vigentes sugiere el primero (el servidor lista el principal antes)', () => {
    expect(contactoSugeridoRfq(contactos, null)).toBe('c-principal');
    // Un contacto vigente real gana sobre los datos de cabecera del cliente.
    expect(
      contactoSugeridoRfq(contactos, { nombre: 'Otro', correo: null, telefono: null }),
    ).toBe('c-principal');
  });

  it('sin contactos usa los datos propios del cliente cuando traen nombre', () => {
    expect(
      contactoSugeridoRfq([], { nombre: 'Ana Pérez', correo: 'ana@x.com', telefono: null }),
    ).toBe(VALOR_CONTACTO_PRINCIPAL);
  });

  it('no inventa un contacto: sin nombre o sin datos no sugiere nada', () => {
    expect(contactoSugeridoRfq([], null)).toBe('');
    expect(contactoSugeridoRfq([], { nombre: null, correo: null, telefono: null })).toBe('');
    expect(contactoSugeridoRfq([], { nombre: '  ', correo: 'a@x.com', telefono: '664 1' })).toBe('');
    expect(contactoSugeridoRfq([], { nombre: null, correo: 'a@x.com', telefono: null })).toBe('');
  });
});
