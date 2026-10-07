import { describe, expect, it } from 'vitest';

import type { EntregaCola } from '@/modulos/entregas/servicios/obtener-entregas';
import {
  etiquetaEstadoEntrega,
  filtrarEntregasCola,
} from '@/modulos/entregas/utilidades/indice';

function fila(extra: {
  id: string;
  folioSii?: string | null;
  esParcial?: boolean;
  ordenFolio?: string;
  clienteNombre?: string | null;
  recibidoPor?: string;
}): EntregaCola {
  return {
    entrega: {
      id: extra.id,
      folio: `NE-00${extra.id}`,
      folioSii: extra.folioSii ?? null,
      ordenId: `orden-${extra.id}`,
      esParcial: extra.esParcial ?? true,
      recibidoPor: extra.recibidoPor ?? 'Recepción',
      recibidoPorId: null,
      entregadoPorId: null,
      solicitudId: null,
      firmaClienteUrl: null,
      fechaEntrega: '2026-10-06T10:00:00.000Z',
      creadoPor: 'usuario-1',
      creadoEn: '2026-10-06T10:00:00.000Z',
      actualizadoEn: '2026-10-06T10:00:00.000Z',
      renglones: [],
    },
    ordenFolio: extra.ordenFolio ?? 'OP-000001',
    ordenFolioSii: 'O-2610_01',
    esInterna: false,
    clienteNombre: extra.clienteNombre ?? 'Cliente Uno',
    totalPiezas: 3,
  };
}

describe('cola de entregas (SII-B7.3)', () => {
  it('etiqueta el estado parcial/total de la nota', () => {
    expect(etiquetaEstadoEntrega(true)).toBe('Parcial');
    expect(etiquetaEstadoEntrega(false)).toBe('Total');
  });

  it('filtra por estado parcial o completa', () => {
    const cola = [
      fila({ id: 'a', esParcial: true }),
      fila({ id: 'b', esParcial: false }),
    ];
    expect(filtrarEntregasCola(cola, { estado: 'todas', texto: '' })).toHaveLength(2);
    expect(filtrarEntregasCola(cola, { estado: 'parcial', texto: '' }).map((f) => f.entrega.id)).toEqual(['a']);
    expect(filtrarEntregasCola(cola, { estado: 'completa', texto: '' }).map((f) => f.entrega.id)).toEqual(['b']);
  });

  it('busca por folio SII, folio de orden, cliente y quién recibe', () => {
    const cola = [
      fila({ id: 'a', folioSii: 'NE-2610_03-01', clienteNombre: 'Aceros del Norte', recibidoPor: 'Laura' }),
      fila({ id: 'b', folioSii: 'NE-2610_04-01', clienteNombre: 'Metalúrgica Sur', recibidoPor: 'Pedro' }),
    ];
    expect(filtrarEntregasCola(cola, { estado: 'todas', texto: '2610_04' }).map((f) => f.entrega.id)).toEqual(['b']);
    expect(filtrarEntregasCola(cola, { estado: 'todas', texto: 'aceros' }).map((f) => f.entrega.id)).toEqual(['a']);
    expect(filtrarEntregasCola(cola, { estado: 'todas', texto: 'pedro' }).map((f) => f.entrega.id)).toEqual(['b']);
    expect(filtrarEntregasCola(cola, { estado: 'todas', texto: 'NE-00b' }).map((f) => f.entrega.id)).toEqual(['b']);
  });
});
