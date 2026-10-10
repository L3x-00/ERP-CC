import { describe, expect, it } from 'vitest';

import {
  VALOR_CONTACTO_PRINCIPAL,
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
