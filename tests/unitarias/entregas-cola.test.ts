import { describe, expect, it } from 'vitest';

import { etiquetaNotaEntrega } from '@/compartido/utilidades/nota-entrega';
import type { EntregaCola } from '@/modulos/entregas/servicios/obtener-entregas';
import {
  agruparEntregasPorOrden,
  filtrarEntregasCola,
} from '@/modulos/entregas/utilidades/indice';

function fila(extra: {
  id: string;
  folioSii?: string | null;
  esParcial?: boolean;
  ordenFolio?: string;
  clienteNombre?: string | null;
  recibidoPor?: string;
  ordenId?: string;
}): EntregaCola {
  return {
    entrega: {
      id: extra.id,
      folio: `NE-00${extra.id}`,
      folioSii: extra.folioSii ?? null,
      ordenId: extra.ordenId ?? `orden-${extra.id}`,
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
      estado: 'VIGENTE',
      motivoAnulacion: null,
      anuladaEn: null,
      anuladaPor: null,
      notaSustitutaId: null,
      renglones: [],
    },
    ordenFolio: extra.ordenFolio ?? 'OP-000001',
    ordenFolioSii: 'O-2610_01',
    esInterna: false,
    clienteNombre: extra.clienteNombre ?? 'Cliente Uno',
    totalPiezas: 3,
    totalSolicitadoOrden: 5,
  };
}

describe('cola de entregas (SII-B7.3)', () => {
  it('etiqueta la nota como final/parcial con sus cantidades (M6)', () => {
    expect(etiquetaNotaEntrega({ esParcial: true, piezas: 80, totalOrden: 200 }).texto).toBe(
      'Parcial · 80 de 200',
    );
    expect(etiquetaNotaEntrega({ esParcial: false, piezas: 200, totalOrden: 200 }).texto).toBe(
      'Final · 200 de 200',
    );
    expect(etiquetaNotaEntrega({ esParcial: false }).texto).toBe('Final');
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

  it('agrupa las entregas parciales de una orden en un solo registro con historial', () => {
    const cola = [
      fila({ id: '1', ordenId: 'orden-12', folioSii: 'NE-O-2611_12-01', recibidoPor: 'Laura' }),
      fila({ id: '2', ordenId: 'orden-12', folioSii: 'NE-O-2611_12-02', recibidoPor: 'Laura' }),
      fila({ id: '3', ordenId: 'orden-13', folioSii: 'NE-O-2611_13-01', recibidoPor: 'Jorge' }),
    ];
    const grupos = agruparEntregasPorOrden(cola);

    expect(grupos).toHaveLength(2);
    expect(grupos[0].ordenId).toBe('orden-12');
    expect(grupos[0].entregas).toHaveLength(2);
    expect(grupos[0].piezas).toBe(6);
    expect(grupos[0].totalOrden).toBe(5);
    expect(grupos[1].entregas).toHaveLength(1);
  });
});
