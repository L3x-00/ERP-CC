import { beforeEach, describe, expect, it } from 'vitest';
import { usarTiendaPlaneacion } from '@/estado/uso-tienda-planeacion';

function reiniciar(): void {
  usarTiendaPlaneacion.setState({
    rango: null,
    area: null,
    recursoId: null,
    turnos: [],
    estados: [],
    programacionSeleccionadaId: null,
  });
}

describe('usarTiendaPlaneacion', () => {
  beforeEach(reiniciar);

  it('arranca sin filtros ni selección', () => {
    const estado = usarTiendaPlaneacion.getState();
    expect(estado.rango).toBeNull();
    expect(estado.area).toBeNull();
    expect(estado.recursoId).toBeNull();
    expect(estado.turnos).toEqual([]);
    expect(estado.estados).toEqual([]);
    expect(estado.programacionSeleccionadaId).toBeNull();
  });

  it('acepta un rango válido y descarta uno invertido', () => {
    usarTiendaPlaneacion.getState().establecerRango('2026-08-10', '2026-08-16');
    expect(usarTiendaPlaneacion.getState().rango).toEqual({
      fechaInicio: '2026-08-10',
      fechaFin: '2026-08-16',
    });

    usarTiendaPlaneacion.getState().establecerRango('2026-08-20', '2026-08-01');
    expect(usarTiendaPlaneacion.getState().rango).toEqual({
      fechaInicio: '2026-08-10',
      fechaFin: '2026-08-16',
    });

    usarTiendaPlaneacion.getState().establecerRango('', '2026-08-16');
    expect(usarTiendaPlaneacion.getState().rango?.fechaInicio).toBe('2026-08-10');
  });

  it('acepta un rango de un solo día y permite limpiarlo', () => {
    usarTiendaPlaneacion.getState().establecerRango('2026-08-13', '2026-08-13');
    expect(usarTiendaPlaneacion.getState().rango).toEqual({
      fechaInicio: '2026-08-13',
      fechaFin: '2026-08-13',
    });

    usarTiendaPlaneacion.getState().limpiarRango();
    expect(usarTiendaPlaneacion.getState().rango).toBeNull();
  });

  it('limpia el recurso al cambiar de área', () => {
    usarTiendaPlaneacion.getState().establecerRecurso('recurso-1');
    usarTiendaPlaneacion.getState().establecerArea('taller');

    expect(usarTiendaPlaneacion.getState().area).toBe('taller');
    expect(usarTiendaPlaneacion.getState().recursoId).toBeNull();
  });

  it('alterna turnos y estados sin duplicar', () => {
    const { alternarTurno, alternarEstado } = usarTiendaPlaneacion.getState();

    alternarTurno('matutino');
    alternarTurno('nocturno');
    alternarTurno('matutino');
    expect(usarTiendaPlaneacion.getState().turnos).toEqual(['nocturno']);

    alternarEstado('programada');
    alternarEstado('bloqueada');
    alternarEstado('programada');
    expect(usarTiendaPlaneacion.getState().estados).toEqual(['bloqueada']);
  });

  it('copia los arreglos recibidos', () => {
    const turnos: ('matutino' | 'nocturno')[] = ['matutino'];
    usarTiendaPlaneacion.getState().establecerTurnos(turnos);
    turnos.push('nocturno');

    expect(usarTiendaPlaneacion.getState().turnos).toEqual(['matutino']);
  });

  it('conserva la selección al limpiar filtros', () => {
    usarTiendaPlaneacion.getState().seleccionarProgramacion('prog-1');
    usarTiendaPlaneacion.getState().establecerRango('2026-08-10', '2026-08-16');
    usarTiendaPlaneacion.getState().establecerArea('acabados');
    usarTiendaPlaneacion.getState().alternarEstado('en_proceso');

    usarTiendaPlaneacion.getState().limpiarFiltros();

    const estado = usarTiendaPlaneacion.getState();
    expect(estado.rango).toBeNull();
    expect(estado.area).toBeNull();
    expect(estado.estados).toEqual([]);
    expect(estado.programacionSeleccionadaId).toBe('prog-1');
  });

  it('no expone ninguna copia de programaciones', () => {
    const claves = Object.keys(usarTiendaPlaneacion.getState());
    expect(claves).not.toContain('programaciones');
    expect(claves).not.toContain('cargaCapacidad');
  });
});
