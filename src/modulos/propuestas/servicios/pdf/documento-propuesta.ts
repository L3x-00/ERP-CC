import type { MonedaPropuesta } from '@/modulos/propuestas/tipos/indice';

/**
 * Documento público de una propuesta (ADR-SII-04, plan §4.7.2).
 *
 * SOLO incluye datos comerciales: cliente/contacto, ítems con cantidad y
 * precio, subtotal, IVA y total. NUNCA costo interno, margen, horas, ruteo ni
 * notas internas; la prueba de exclusión de la ola 2 lo verifica.
 */
export type ItemDocumentoPropuesta = {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  /** Importe de la línea; negativo si es un descuento. */
  importe: number;
};

export type DocumentoPropuesta = {
  titulo: string;
  folioRevision: string;
  /** Fecha del documento en ISO `YYYY-MM-DD` (determinista por revisión). */
  fecha: string;
  moneda: MonedaPropuesta;
  cliente: {
    razonSocial: string | null;
    nombreComercial: string | null;
    rfc: string | null;
    correo: string | null;
  };
  contacto: {
    nombre: string | null;
    correo: string | null;
    telefono: string | null;
  } | null;
  condicionesPago: string | null;
  items: ItemDocumentoPropuesta[];
  totales: {
    subtotal: number;
    ivaPorcentaje: number;
    iva: number;
    total: number;
  };
};

/**
 * Construye el documento público de la propuesta a partir de datos cargados.
 * Función pura: no toca I/O y descarta cualquier campo interno.
 */
export function construirDocumentoPropuesta(entrada: {
  folioRevision: string;
  fecha: string;
  moneda: MonedaPropuesta;
  cliente: {
    razonSocial: string | null;
    nombreComercial: string | null;
    rfc: string | null;
    correo: string | null;
  };
  contacto: {
    nombre: string | null;
    correo: string | null;
    telefono: string | null;
  } | null;
  condicionesPago: string | null;
  items: readonly {
    codigo: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    esDescuento: boolean;
    activo: boolean;
  }[];
  ivaPorcentaje: number;
}): DocumentoPropuesta {
  const activos = entrada.items.filter((item) => item.activo);

  const items: ItemDocumentoPropuesta[] = activos.map((item) => {
    const bruto = item.cantidad * item.precioUnitario;
    return {
      codigo: item.codigo,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      importe: item.esDescuento ? -bruto : bruto,
    };
  });

  const bruto = items.reduce((suma, item) => suma + (item.importe > 0 ? item.importe : 0), 0);
  const descuento = items.reduce((suma, item) => suma + (item.importe < 0 ? -item.importe : 0), 0);
  const redondear = (cantidad: number): number =>
    Math.round((cantidad + Number.EPSILON) * 100) / 100;
  const subtotal = redondear(bruto - descuento);
  const iva = redondear(subtotal * (entrada.ivaPorcentaje / 100));
  const total = redondear(subtotal + iva);

  return {
    titulo: 'Propuesta',
    folioRevision: entrada.folioRevision,
    fecha: entrada.fecha,
    moneda: entrada.moneda,
    cliente: {
      razonSocial: entrada.cliente.razonSocial,
      nombreComercial: entrada.cliente.nombreComercial,
      rfc: entrada.cliente.rfc,
      correo: entrada.cliente.correo,
    },
    contacto: entrada.contacto
      ? {
          nombre: entrada.contacto.nombre,
          correo: entrada.contacto.correo,
          telefono: entrada.contacto.telefono,
        }
      : null,
    condicionesPago: entrada.condicionesPago,
    items,
    totales: {
      subtotal,
      ivaPorcentaje: entrada.ivaPorcentaje,
      iva,
      total,
    },
  };
}
