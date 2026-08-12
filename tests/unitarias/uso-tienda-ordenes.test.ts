import { beforeEach, describe, expect, it } from 'vitest';
import { usarTiendaOrdenes } from '@/estado/uso-tienda-ordenes';
import type { EstadoOrden } from '@/modulos/ordenes/tipos/ordenes';

const estadoInicial = usarTiendaOrdenes.getState();

beforeEach(() => {
  usarTiendaOrdenes.setState(
    {
      ordenActivaId: estadoInicial.ordenActivaId,
      filtroMaquina: estadoInicial.filtroMaquina,
      filtrosEstado: [],
      versionActualizacion: estadoInicial.versionActualizacion,
    },
    false,
  );
});

describe('usarTiendaOrdenes', () => {
  it('arranca sin orden activa, sin filtros y con versión 0', () => {
    const estado = usarTiendaOrdenes.getState();
    expect(estado.ordenActivaId).toBeNull();
    expect(estado.filtroMaquina).toBeNull();
    expect(estado.filtrosEstado).toEqual([]);
    expect(estado.versionActualizacion).toBe(0);
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
      usarTiendaOrdenes.getState().alternarFiltroEstado('en_proceso');
      usarTiendaOrdenes.getState().establecerFiltroMaquina('CNC-02');

      const estado = usarTiendaOrdenes.getState();
      expect(estado.ordenActivaId).toBe('orden-1');
      expect(estado.filtrosEstado).toEqual(['en_proceso']);
    });
  });

  describe('alternarFiltroEstado', () => {
    it('agrega un estado ausente y lo quita al repetir', () => {
      usarTiendaOrdenes.getState().alternarFiltroEstado('programada');
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual(['programada']);

      usarTiendaOrdenes.getState().alternarFiltroEstado('programada');
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual([]);
    });

    it('acumula varios estados conservando el orden de selección', () => {
      usarTiendaOrdenes.getState().alternarFiltroEstado('programada');
      usarTiendaOrdenes.getState().alternarFiltroEstado('en_proceso');
      usarTiendaOrdenes.getState().alternarFiltroEstado('pausada');
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual([
        'programada',
        'en_proceso',
        'pausada',
      ]);
    });

    it('quita solo el estado alternado', () => {
      usarTiendaOrdenes.getState().establecerFiltrosEstado(['programada', 'en_proceso', 'pausada']);
      usarTiendaOrdenes.getState().alternarFiltroEstado('en_proceso');
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual(['programada', 'pausada']);
    });

    it('produce un arreglo nuevo (no muta el anterior)', () => {
      const antes = usarTiendaOrdenes.getState().filtrosEstado;
      usarTiendaOrdenes.getState().alternarFiltroEstado('completada');
      const despues = usarTiendaOrdenes.getState().filtrosEstado;
      expect(despues).not.toBe(antes);
      expect(antes).toEqual([]);
    });
  });

  describe('establecerFiltrosEstado', () => {
    it('reemplaza la lista completa', () => {
      usarTiendaOrdenes.getState().alternarFiltroEstado('borrador');
      usarTiendaOrdenes.getState().establecerFiltrosEstado(['cancelada', 'completada']);
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual(['cancelada', 'completada']);
    });

    it('copia el arreglo recibido: mutarlo fuera no afecta la tienda', () => {
      const externos: EstadoOrden[] = ['programada'];
      usarTiendaOrdenes.getState().establecerFiltrosEstado(externos);
      externos.push('cancelada');
      expect(usarTiendaOrdenes.getState().filtrosEstado).toEqual(['programada']);
    });
  });

  describe('limpiarFiltros', () => {
    it('limpia máquina y estados sin perder la orden activa', () => {
      usarTiendaOrdenes.getState().seleccionarOrden('orden-9');
      usarTiendaOrdenes.getState().establecerFiltroMaquina('CNC-03');
      usarTiendaOrdenes.getState().establecerFiltrosEstado(['en_proceso', 'pausada']);

      usarTiendaOrdenes.getState().limpiarFiltros();

      const estado = usarTiendaOrdenes.getState();
      expect(estado.filtroMaquina).toBeNull();
      expect(estado.filtrosEstado).toEqual([]);
      expect(estado.ordenActivaId).toBe('orden-9');
    });

    it('no incrementa la versión de actualización', () => {
      const antes = usarTiendaOrdenes.getState().versionActualizacion;
      usarTiendaOrdenes.getState().limpiarFiltros();
      expect(usarTiendaOrdenes.getState().versionActualizacion).toBe(antes);
    });
  });

  describe('refrescarOrdenes', () => {
    it('incrementa la versión en cada llamada', () => {
      const antes = usarTiendaOrdenes.getState().versionActualizacion;
      usarTiendaOrdenes.getState().refrescarOrdenes();
      expect(usarTiendaOrdenes.getState().versionActualizacion).toBe(antes + 1);

      usarTiendaOrdenes.getState().refrescarOrdenes();
      usarTiendaOrdenes.getState().refrescarOrdenes();
      expect(usarTiendaOrdenes.getState().versionActualizacion).toBe(antes + 3);
    });

    it('no altera orden activa ni filtros', () => {
      usarTiendaOrdenes.getState().seleccionarOrden('orden-7');
      usarTiendaOrdenes.getState().establecerFiltroMaquina('CNC-04');
      usarTiendaOrdenes.getState().establecerFiltrosEstado(['en_proceso']);

      usarTiendaOrdenes.getState().refrescarOrdenes();

      const estado = usarTiendaOrdenes.getState();
      expect(estado.ordenActivaId).toBe('orden-7');
      expect(estado.filtroMaquina).toBe('CNC-04');
      expect(estado.filtrosEstado).toEqual(['en_proceso']);
    });

    it('notifica a los suscriptores', () => {
      let notificaciones = 0;
      const desuscribir = usarTiendaOrdenes.subscribe(() => {
        notificaciones += 1;
      });
      usarTiendaOrdenes.getState().refrescarOrdenes();
      desuscribir();
      expect(notificaciones).toBe(1);
    });
  });
});
