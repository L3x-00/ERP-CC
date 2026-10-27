import { describe, expect, it } from 'vitest';
import {
  consumoMaterialVisibleDesdeRegistro,
  resumirConsumosMateriales,
} from '@/modulos/produccion/utilidades/consumo-material-operador';

describe('consumo material visible para operador', () => {
  it('omite el costo histórico antes de enviar el consumo al cliente', () => {
    const visible = consumoMaterialVisibleDesdeRegistro({
      id: 'consumo-1',
      partidaId: 'partida-1',
      materialId: 'material-1',
      cantidadUsada: 2,
      cantidadScrap: 0.5,
      costoUnitarioMomento: 123.45,
      creadoEn: '2026-10-27T12:00:00.000Z',
    });

    expect(visible).toEqual({
      id: 'consumo-1',
      partidaId: 'partida-1',
      materialId: 'material-1',
      cantidadUsada: 2,
      cantidadScrap: 0.5,
      creadoEn: '2026-10-27T12:00:00.000Z',
    });
    expect(visible).not.toHaveProperty('costoUnitarioMomento');
  });

  it('agrupa registros válidos por partida y material sin duplicarlos', () => {
    const registros = [{
      id: 'consumo-1', partidaId: 'partida-1', materialId: 'material-1',
      cantidadUsada: 2, cantidadScrap: 0.5, creadoEn: '2026-10-27T12:00:00.000Z',
    }, {
      id: 'consumo-2', partidaId: 'partida-1', materialId: 'material-1',
      cantidadUsada: 1, cantidadScrap: 0, creadoEn: '2026-10-27T13:00:00.000Z',
    }, {
      id: 'consumo-1', partidaId: 'partida-1', materialId: 'material-1',
      cantidadUsada: 2, cantidadScrap: 0.5, creadoEn: '2026-10-27T12:00:00.000Z',
    }];

    expect(resumirConsumosMateriales(registros)).toEqual([{
      partidaId: 'partida-1',
      materialId: 'material-1',
      cantidadUsada: 3,
      cantidadScrap: 0.5,
      cantidadTotal: 3.5,
      registros: 2,
    }]);
  });
});
