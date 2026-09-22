import { describe, expect, it } from 'vitest';
import {
  construirCeldasMes,
  diasEntre,
  esFinDeSemana,
  etiquetaDia,
  etiquetaMes,
  finMes,
  hoyIso,
  inicioMes,
  inicioSemana,
  navegarRango,
  rangoVista,
  sumarDias,
} from '@/modulos/planeacion/utilidades/fechas-planeacion';
import {
  TEXTO_POR_DEFINIR,
  calcularPendientes,
  etiquetaArea,
  etiquetaAvancePartida,
  etiquetaMaterial,
  etiquetaProcesos,
  formatearDuracionMinutos,
  textoODefecto,
} from '@/modulos/planeacion/utilidades/desglose';
import type { DesglosePartidaPlaneacion } from '@/modulos/planeacion/tipos/indice';

const desgloseBase: DesglosePartidaPlaneacion = {
  partidaId: '44444444-4444-4444-8444-444444444444',
  ordenId: '33333333-3333-4333-8333-333333333333',
  folio: 'OP-000123',
  codigoPieza: 'PZA-01',
  descripcion: 'Charola de acero',
  areaCodigo: 'corte_laser',
  areaNombre: 'Corte láser',
  procesos: ['Corte', 'Doblez'],
  esExterno: false,
  proveedorExterno: null,
  maquinaAsignada: null,
  materialNombre: 'Acero 1045',
  cantidadSolicitada: 10,
  cantidadProducida: 4,
  cantidadScrap: 0,
  unidadMedida: 'pieza',
  tiempoEstimadoMinutos: 150,
  operadorAsignadoId: null,
};

describe('fechas y vistas de Planeación', () => {
  it('calcula semana, mes y rangos por vista en UTC', () => {
    expect(inicioSemana('2026-09-21')).toBe('2026-09-21');
    expect(inicioSemana('2026-09-27')).toBe('2026-09-21');
    expect(inicioMes('2026-09-21')).toBe('2026-09-01');
    expect(finMes('2026-09-21')).toBe('2026-09-30');
    expect(rangoVista('semana', '2026-09-21')).toEqual({
      fechaInicio: '2026-09-21',
      fechaFin: '2026-09-27',
    });
    expect(rangoVista('dia', '2026-09-21')).toEqual({
      fechaInicio: '2026-09-21',
      fechaFin: '2026-09-21',
    });
    expect(rangoVista('mes', '2026-09-21')).toEqual({
      fechaInicio: '2026-09-01',
      fechaFin: '2026-09-30',
    });
  });

  it('navega el rango según la vista sin depender de la zona horaria', () => {
    expect(
      navegarRango('semana', { fechaInicio: '2026-09-21', fechaFin: '2026-09-27' }, 1),
    ).toEqual({ fechaInicio: '2026-09-28', fechaFin: '2026-10-04' });
    expect(
      navegarRango('semana', { fechaInicio: '2026-09-21', fechaFin: '2026-09-27' }, -1),
    ).toEqual({ fechaInicio: '2026-09-14', fechaFin: '2026-09-20' });
    expect(navegarRango('dia', { fechaInicio: '2026-09-30', fechaFin: '2026-09-30' }, 1)).toEqual({
      fechaInicio: '2026-10-01',
      fechaFin: '2026-10-01',
    });
    expect(
      navegarRango('mes', { fechaInicio: '2026-01-01', fechaFin: '2026-01-31' }, -1),
    ).toEqual({ fechaInicio: '2025-12-01', fechaFin: '2025-12-31' });
  });

  it('genera días y celdas de mes con relleno del rango consultado', () => {
    expect(diasEntre('2026-09-21', '2026-09-23')).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]);
    const celdas = construirCeldasMes('2026-09-01', '2026-09-30');
    expect(celdas).toHaveLength(35);
    expect(celdas[0]).toEqual({ fecha: '2026-08-31', enRango: false });
    expect(celdas.at(-1)).toEqual({ fecha: '2026-10-04', enRango: false });
    expect(celdas.filter((celda) => celda.enRango)).toHaveLength(30);
  });

  it('marca fines de semana y produce etiquetas y hoy ISO estables', () => {
    expect(esFinDeSemana('2026-09-19')).toBe(true);
    expect(esFinDeSemana('2026-09-20')).toBe(true);
    expect(esFinDeSemana('2026-09-21')).toBe(false);
    expect(etiquetaDia('2026-09-21')).toBe('lun 21 sep');
    expect(etiquetaMes('2026-09-21')).toBe('septiembre 2026');
    expect(hoyIso(new Date(2026, 8, 21))).toBe('2026-09-21');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('desglose de partida (OBS-08)', () => {
  it('declara "Por definir" sin inventar datos de negocio', () => {
    expect(textoODefecto(null)).toBe(TEXTO_POR_DEFINIR);
    expect(textoODefecto('   ')).toBe(TEXTO_POR_DEFINIR);
    expect(formatearDuracionMinutos(0)).toBe(TEXTO_POR_DEFINIR);
    expect(etiquetaMaterial({ ...desgloseBase, materialNombre: null })).toBe(TEXTO_POR_DEFINIR);
    expect(etiquetaProcesos({ ...desgloseBase, procesos: [] })).toBe(TEXTO_POR_DEFINIR);
    expect(etiquetaArea({ ...desgloseBase, areaCodigo: null, areaNombre: null })).toBe(
      TEXTO_POR_DEFINIR,
    );
  });

  it('calcula pendientes y formatea avance, material y duración', () => {
    expect(calcularPendientes(10, 4, 0)).toBe(6);
    expect(calcularPendientes(10, 12, 0)).toBe(0);
    expect(calcularPendientes(10, 4, 1)).toBe(5);
    expect(etiquetaAvancePartida(desgloseBase)).toContain('4/10 pieza');
    expect(etiquetaAvancePartida(desgloseBase)).toContain('6 pendientes');
    expect(etiquetaAvancePartida({ ...desgloseBase, cantidadScrap: 1 })).toContain('1 merma');
    expect(etiquetaMaterial(desgloseBase)).toBe('Acero 1045 · 10 pieza');
    expect(etiquetaProcesos(desgloseBase)).toBe('Corte, Doblez');
    expect(etiquetaArea(desgloseBase)).toBe('Corte láser');
    expect(formatearDuracionMinutos(150)).toBe('2 h 30 min');
    expect(formatearDuracionMinutos(45)).toBe('45 min');
    expect(formatearDuracionMinutos(120)).toBe('2 h');
  });
});
