import { describe, expect, it } from 'vitest';

import { proyectarRutaFicha } from '@/modulos/ordenes/servicios/proyectar-snapshot-ficha';
import type { SnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';

function snapshot(items: SnapshotOrdenSii['items']): SnapshotOrdenSii {
  return { version: 1, orden_id: 'o-1', origen: {}, cabecera: {}, items, archivos: [] };
}

describe('proyección de la ruta de la ficha (R08)', () => {
  it('sin snapshot no hay ruta', () => {
    expect(proyectarRutaFicha(null)).toEqual([]);
  });

  it('proyecta solo proceso, secuencia y horas: ninguna tarifa, costo ni precio sobrevive', () => {
    const ruta = proyectarRutaFicha(snapshot([{
      codigo: 'IT01',
      descripcion: 'Soporte',
      precio_unitario: 4321.99,
      ruteo: [{
        secuencia: 1,
        proceso_nombre: 'Corte láser',
        setup_horas: 0.5,
        run_horas: 2,
        total_horas: 2.5,
        tarifa_hora: 876.54,
        costo_total: 2191.35,
        requiere_revision: true,
      }],
    }]));

    expect(ruta).toEqual([{
      codigoItem: 'IT01',
      descripcion: 'Soporte',
      pasos: [{ secuencia: 1, proceso: 'Corte láser', prepHoras: 0.5, operacionHoras: 2 }],
    }]);
    const serializado = JSON.stringify(ruta);
    for (const secreto of ['4321.99', '876.54', '2191.35', 'tarifa_hora', 'costo_total', 'precio_unitario']) {
      expect(serializado).not.toContain(secreto);
    }
  });

  it('ordena los ítems por ITxx y los pasos por secuencia', () => {
    const ruta = proyectarRutaFicha(snapshot([
      { codigo: 'IT10', ruteo: [{ secuencia: 1, proceso_nombre: 'Soldadura' }] },
      {
        codigo: 'IT02',
        ruteo: [
          { secuencia: 2, proceso_nombre: 'Doblez' },
          { secuencia: 1, proceso_nombre: 'Corte' },
        ],
      },
    ]));

    expect(ruta.map((item) => item.codigoItem)).toEqual(['IT02', 'IT10']);
    expect(ruta[0]?.pasos.map((paso) => paso.proceso)).toEqual(['Corte', 'Doblez']);
  });

  it('excluye las líneas de descuento', () => {
    const ruta = proyectarRutaFicha(snapshot([
      { codigo: 'IT01', ruteo: [{ secuencia: 1, proceso_nombre: 'Corte' }] },
      { codigo: 'DESC', es_descuento: true, ruteo: [{ secuencia: 1, proceso_nombre: 'No aplica' }] },
    ]));

    expect(ruta.map((item) => item.codigoItem)).toEqual(['IT01']);
  });

  it('acepta horas como texto numérico y declara null lo que no es número', () => {
    const [item] = proyectarRutaFicha(snapshot([{
      codigo: 'IT01',
      ruteo: [{ secuencia: '1', proceso_nombre: 'Corte', setup_horas: '0.25', run_horas: 'abc' }],
    }]));

    expect(item?.pasos[0]).toEqual({ secuencia: 1, proceso: 'Corte', prepHoras: 0.25, operacionHoras: null });
  });

  it('un snapshot antiguo sin ruteo cae a la lista de operaciones, sin horas', () => {
    const [item] = proyectarRutaFicha(snapshot([{
      codigo: 'IT01',
      operaciones: [{ nombre: 'Corte' }, { codigo: 'DOB' }, {}],
    }]));

    expect(item?.pasos).toEqual([
      { secuencia: 1, proceso: 'Corte', prepHoras: null, operacionHoras: null },
      { secuencia: 2, proceso: 'DOB', prepHoras: null, operacionHoras: null },
      { secuencia: 3, proceso: 'Operación', prepHoras: null, operacionHoras: null },
    ]);
  });

  it('un ítem sin ruteo ni operaciones aparece con la lista de pasos vacía', () => {
    expect(proyectarRutaFicha(snapshot([{ codigo: 'IT01' }]))).toEqual([
      { codigoItem: 'IT01', descripcion: null, pasos: [] },
    ]);
  });
});
