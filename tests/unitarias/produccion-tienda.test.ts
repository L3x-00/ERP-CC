import { beforeEach, describe, expect, it } from 'vitest';
import { usarTiendaProduccion } from '@/estado/uso-tienda-produccion';

function reiniciar(): void {
  usarTiendaProduccion.setState({
    sesionActiva: null,
    recursoId: null,
    estados: [],
    ordenSeleccionadaId: null,
  });
}

describe('usarTiendaProduccion', () => {
  beforeEach(reiniciar);

  it('guarda solo la sesión activa y filtros de interfaz', () => {
    usarTiendaProduccion.getState().establecerSesionActiva({
      id: 'sesion-1',
      ordenId: 'orden-1',
      partidaId: 'partida-1',
      programacionId: 'programacion-1',
    });
    usarTiendaProduccion.getState().establecerRecurso('recurso-1');
    usarTiendaProduccion.getState().seleccionarOrden('orden-1');

    expect(usarTiendaProduccion.getState().sesionActiva?.id).toBe('sesion-1');
    expect(usarTiendaProduccion.getState().recursoId).toBe('recurso-1');
    expect(usarTiendaProduccion.getState().ordenSeleccionadaId).toBe('orden-1');
    expect(Object.keys(usarTiendaProduccion.getState())).not.toContain('ordenes');
    expect(Object.keys(usarTiendaProduccion.getState())).not.toContain('sesiones');
  });

  it('alterna estados sin duplicarlos y copia arreglos externos', () => {
    const tienda = usarTiendaProduccion.getState();
    tienda.alternarEstado('bandeja');
    tienda.alternarEstado('lista');
    tienda.alternarEstado('bandeja');
    expect(usarTiendaProduccion.getState().estados).toEqual(['lista']);

    const estados: ('pausada' | 'entregada')[] = ['pausada'];
    tienda.establecerEstados(estados);
    estados.push('entregada');
    expect(usarTiendaProduccion.getState().estados).toEqual(['pausada']);
  });

  it('limpia filtros sin cerrar por accidente la sesión activa', () => {
    usarTiendaProduccion.getState().establecerSesionActiva({
      id: 'sesion-1', ordenId: 'orden-1', partidaId: 'partida-1', programacionId: 'programacion-1',
    });
    usarTiendaProduccion.getState().establecerRecurso('recurso-1');
    usarTiendaProduccion.getState().alternarEstado('en_proceso');
    usarTiendaProduccion.getState().limpiarFiltros();

    expect(usarTiendaProduccion.getState().sesionActiva?.id).toBe('sesion-1');
    expect(usarTiendaProduccion.getState().recursoId).toBeNull();
    expect(usarTiendaProduccion.getState().estados).toEqual([]);
  });
});
