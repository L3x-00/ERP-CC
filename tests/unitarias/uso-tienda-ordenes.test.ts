import { beforeEach, describe, expect, it } from 'vitest';
import { usarTiendaOrdenes } from '@/estado/uso-tienda-ordenes';
import type { EstadoSiiOrden } from '@/modulos/ordenes/tipos/orden-sii';

const estadoInicial = usarTiendaOrdenes.getState();

beforeEach(() => {
  usarTiendaOrdenes.setState(
    {
      ordenActivaId: estadoInicial.ordenActivaId,
      filtroMaquina: estadoInicial.filtroMaquina,
      filtrosEstado: [],
    },
    false,
  );
});

describe('usarTiendaOrdenes', () => {
  it('arranca sin orden activa y sin filtros', () => {
    const estado = usarTiendaOrdenes.getState();
    expect(estado.ordenActivaId).toBeNull();
    expect(estado.filtroMaquina).toBeNull();
    expect(estado.filtrosEstado).toEqual([]);
  });

  describe('seleccionarOrden', () => {
    it('fija la orden activa', () => {
      usarTiendaOrdenes.getState().seleccionarOrden('orden-1');
      expect(usarTiendaOrdenes.getState().ordenActivaId).toBe('orden-1');
    });

    it('reemplaza la orden activa previa', () => {
      usarTiendaOrdenes.getState().seleccionarOrden('orden-1');
      usarTiendaOrdenes.getState().seleccionarOrden('orden-2');
      expect(usarTiendaOrdenes.getState().ordenActivaId).toBe('orden-2');
    });

    it('deselecciona con null', () => {
      usarTiendaOrdenes.getState().seleccionarOrden('orden-1');
      usarTiendaOrdenes.getState().seleccionarOrden(null);
      expect(usarTiendaOrdenes.getState().ordenActivaId).toBeNull();
    });
  });

  describe('establecerFiltroMaquina', () => {
    it('fija y limpia el filtro de máquina', () => {
      usarTiendaOrdenes.getState().establecerFiltroMaquina('CNC-01');
      expect(usarTiendaOrdenes.getState().filtroMaquina).toBe('CNC-01');

      usarTiendaOrdenes.getState().establecerFiltroMaquina(null);
      expect(usarTiendaOrdenes.getState().filtroMaquina).toBeNull();
    });

    it('no toca la orden activa ni los filtros de estado', () => {
      usarTiendaOrdenes.getState().seleccionarOrden('orden-1');
      usarTiendaOrdenes.getState().alternarFiltroEstado('EN_PRODUCCION');
      usarTiendaOrdenes.getState().establecerFiltroMaquina('CNC-02');

      const estado = usarTiendaOrdenes.getState();
      expect(estado.ordenActivaId).toBe('orden-1');
      expect(estado.filtrosEstado).toEqual(['EN_PRODUCCION']);
    });
  });

  describe('alternarFiltroEstado', () => {
    it('agrega un estado ausente y lo quita al repetir', () => {
      usarTiendaOrdenes.getState().alternarFiltroEstado('PLANIFICADA');
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual(['PLANIFICADA']);

      usarTiendaOrdenes.getState().alternarFiltroEstado('PLANIFICADA');
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual([]);
    });

    it('acumula varios estados conservando el orden de selección', () => {
      usarTiendaOrdenes.getState().alternarFiltroEstado('PLANIFICADA');
      usarTiendaOrdenes.getState().alternarFiltroEstado('EN_PRODUCCION');
      usarTiendaOrdenes.getState().alternarFiltroEstado('LISTA');
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual([
        'PLANIFICADA',
        'EN_PRODUCCION',
        'LISTA',
      ]);
    });

    it('quita solo el estado alternado', () => {
      usarTiendaOrdenes.getState().establecerFiltrosEstado(['PLANIFICADA', 'EN_PRODUCCION', 'LISTA']);
      usarTiendaOrdenes.getState().alternarFiltroEstado('EN_PRODUCCION');
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual(['PLANIFICADA', 'LISTA']);
    });

    it('produce un arreglo nuevo (no muta el anterior)', () => {
      const antes = usarTiendaOrdenes.getState().filtrosEstado;
      usarTiendaOrdenes.getState().alternarFiltroEstado('PRODUCCION_COMPLETADA');
      const despues = usarTiendaOrdenes.getState().filtrosEstado;
      expect(despues).not.toBe(antes);
      expect(antes).toEqual([]);
    });
  });

  describe('establecerFiltrosEstado', () => {
    it('reemplaza la lista completa', () => {
      usarTiendaOrdenes.getState().alternarFiltroEstado('CONFIRMADA');
      usarTiendaOrdenes.getState().establecerFiltrosEstado(['CANCELADA', 'PRODUCCION_COMPLETADA']);
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual(['CANCELADA', 'PRODUCCION_COMPLETADA']);
    });

    it('copia el arreglo recibido: mutarlo fuera no afecta la tienda', () => {
      const externos: EstadoSiiOrden[] = ['PLANIFICADA'];
      usarTiendaOrdenes.getState().establecerFiltrosEstado(externos);
      externos.push('CANCELADA');
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual(['PLANIFICADA']);
    });
  });

  describe('limpiarFiltros', () => {
    it('limpia máquina y estados sin perder la orden activa', () => {
      usarTiendaOrdenes.getState().seleccionarOrden('orden-9');
      usarTiendaOrdenes.getState().establecerFiltroMaquina('CNC-03');
      usarTiendaOrdenes.getState().establecerFiltrosEstado(['EN_PRODUCCION', 'LISTA']);

      usarTiendaOrdenes.getState().limpiarFiltros();

      const estado = usarTiendaOrdenes.getState();
      expect(estado.filtroMaquina).toBeNull();
      expect(estado.filtrosEstado).toEqual([]);
      expect(estado.ordenActivaId).toBe('orden-9');
    });

});
});
