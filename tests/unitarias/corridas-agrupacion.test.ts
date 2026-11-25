import { describe, expect, it } from 'vitest';
import type {
  MaterialProceso,
  ProcesoEspacioOperador,
} from '@/modulos/produccion/tipos/espacio-operador';
import {
  motivoNoAgrupable,
  sugerenciasDeAgrupacion,
} from '@/modulos/produccion/utilidades/agrupacion-corridas';

const ORDEN = '11111111-1111-4111-8111-111111111111';
const MATERIAL = '22222222-2222-4222-8222-222222222222';

function materialDe(id = MATERIAL, codigo = 'LAM-CR-14', espesorMm: number | null = 1.4): MaterialProceso {
  return { id, codigo, nombre: codigo, unidadBase: 'm2', anchoMm: null, largoMm: null, espesorMm };
}

function proceso(
  parcial: Partial<ProcesoEspacioOperador> & { id: string; codigoPieza: string },
): ProcesoEspacioOperador {
  return {
    ordenId: ORDEN,
    material: materialDe(),
    secuencia: 1,
    procesoNombre: 'Corte Láser',
    descripcion: 'Pieza',
    pendientePiezas: 10,
    procesoCompleto: false,
    sesionActiva: null,
    reclamo: null,
    ...parcial,
  } as ProcesoEspacioOperador;
}

describe('sugerencias de agrupación de corridas', () => {
  it('sugiere unir dos ítems con el mismo material, calibre y proceso inicial', () => {
    const sugerencias = sugerenciasDeAgrupacion([
      proceso({ id: 'p1', codigoPieza: 'IT01', descripcion: 'Pieza A' }),
      proceso({ id: 'p2', codigoPieza: 'IT02', descripcion: 'Pieza B' }),
    ]);

    expect(sugerencias).toHaveLength(1);
    expect(sugerencias[0]!.procesos.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(sugerencias[0]!.mensaje).toContain('IT01 (Pieza A)');
    expect(sugerencias[0]!.mensaje).toContain('IT02 (Pieza B)');
    expect(sugerencias[0]!.mensaje).toContain('Corte Láser');
    expect(sugerencias[0]!.mensaje).toContain('LAM-CR-14');
    expect(sugerencias[0]!.mensaje).toContain('Puede iniciarlos en una misma corrida');
  });

  it('no sugiere unir si cambia el material, el calibre, el proceso, la orden o la secuencia', () => {
    const base = proceso({ id: 'p1', codigoPieza: 'IT01' });
    const variantes = [
      proceso({ id: 'p2', codigoPieza: 'IT02', material: materialDe('otro', 'LAM-GALV-18') }),
      proceso({ id: 'p3', codigoPieza: 'IT03', material: materialDe(MATERIAL, 'LAM-CR-14', 2) }),
      proceso({ id: 'p4', codigoPieza: 'IT04', procesoNombre: 'Doblado' }),
      proceso({ id: 'p5', codigoPieza: 'IT05', ordenId: 'otra-orden' }),
      proceso({ id: 'p6', codigoPieza: 'IT06', secuencia: 2 }),
    ];
    for (const variante of variantes) {
      expect(sugerenciasDeAgrupacion([base, variante])).toHaveLength(0);
    }
  });

  it('no sugiere unir ítems reclamados, con sesión activa o sin piezas pendientes', () => {
    const base = proceso({ id: 'p1', codigoPieza: 'IT01' });
    const reclamado = proceso({ id: 'p2', codigoPieza: 'IT02', reclamo: { id: 'r' } as never });
    const enSesion = proceso({ id: 'p3', codigoPieza: 'IT03', sesionActiva: { id: 's' } as never });
    const terminado = proceso({ id: 'p4', codigoPieza: 'IT04', pendientePiezas: 0, procesoCompleto: true });
    expect(sugerenciasDeAgrupacion([base, reclamado])).toHaveLength(0);
    expect(sugerenciasDeAgrupacion([base, enSesion])).toHaveLength(0);
    expect(sugerenciasDeAgrupacion([base, terminado])).toHaveLength(0);
  });

  it('explica por qué un ítem sin calibre no entra en la sugerencia', () => {
    const sinCalibre = proceso({ id: 'p1', codigoPieza: 'IT01', material: materialDe(MATERIAL, 'LAM-CR-14', null) });
    expect(motivoNoAgrupable(sinCalibre)).toContain('calibre');
  });

  it('enumera los tres ítems cuando hay más de dos candidatos', () => {
    const sugerencias = sugerenciasDeAgrupacion([
      proceso({ id: 'p1', codigoPieza: 'IT01' }),
      proceso({ id: 'p2', codigoPieza: 'IT02' }),
      proceso({ id: 'p3', codigoPieza: 'IT03' }),
    ]);
    expect(sugerencias).toHaveLength(1);
    expect(sugerencias[0]!.mensaje).toContain('IT01');
    expect(sugerencias[0]!.mensaje).toContain('IT02');
    expect(sugerencias[0]!.mensaje).toContain('IT03');
  });
});
