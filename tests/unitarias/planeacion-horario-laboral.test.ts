import { describe, expect, it } from 'vitest';
import {
  HORAS_JORNADA_SABADO,
  HORAS_JORNADA_SEMANA,
  ajustarADiaLaboral,
  diaSemanaCalendario,
  errorFechaProgramacion,
  esDiaLaboral,
  horasJornadaDia,
  horasTurnoLaboral,
  siguienteDiaLaboral,
  turnoSugeridoPara,
  turnosDelDia,
  ventanaTurno,
} from '@/modulos/planeacion/utilidades/horario-laboral';

// 2026-11-16 es lunes; 21 sábado; 22 domingo.
const LUNES = '2026-11-16';
const SABADO = '2026-11-21';
const DOMINGO = '2026-11-22';

describe('horario laboral (C18)', () => {
  it('identifica el día de la semana sin depender de la zona horaria', () => {
    expect(diaSemanaCalendario(LUNES)).toBe(1);
    expect(diaSemanaCalendario(SABADO)).toBe(6);
    expect(diaSemanaCalendario(DOMINGO)).toBe(0);
    expect(diaSemanaCalendario('no-es-fecha')).toBe(-1);
  });

  it('solo el domingo queda cerrado', () => {
    expect(esDiaLaboral(LUNES)).toBe(true);
    expect(esDiaLaboral(SABADO)).toBe(true);
    expect(esDiaLaboral(DOMINGO)).toBe(false);
  });

  it('la jornada completa es 9 h de lunes a viernes, 4 h el sábado y 0 el domingo', () => {
    expect(horasJornadaDia(LUNES)).toBe(HORAS_JORNADA_SEMANA);
    expect(horasJornadaDia(SABADO)).toBe(HORAS_JORNADA_SABADO);
    expect(horasJornadaDia(DOMINGO)).toBe(0);
  });

  it('reparte la jornada en matutino y vespertino y cierra el nocturno', () => {
    expect(horasTurnoLaboral(LUNES, 'matutino')).toBe(5);
    expect(horasTurnoLaboral(LUNES, 'vespertino')).toBe(4);
    expect(horasTurnoLaboral(LUNES, 'nocturno')).toBe(0);
    expect(horasTurnoLaboral(SABADO, 'matutino')).toBe(4);
    expect(horasTurnoLaboral(SABADO, 'vespertino')).toBe(0);
    expect(horasTurnoLaboral(DOMINGO, 'matutino')).toBe(0);
  });

  it('enumera solo los turnos abiertos del día', () => {
    expect(turnosDelDia(LUNES)).toEqual(['matutino', 'vespertino']);
    expect(turnosDelDia(SABADO)).toEqual(['matutino']);
    expect(turnosDelDia(DOMINGO)).toEqual([]);
  });

  it('describe la ventana horaria y cierra el sábado por la tarde', () => {
    expect(ventanaTurno(LUNES, 'matutino')).toBe('08:00–13:00');
    expect(ventanaTurno(LUNES, 'vespertino')).toBe('13:00–17:00');
    expect(ventanaTurno(SABADO, 'matutino')).toBe('08:00–12:00');
    expect(ventanaTurno(SABADO, 'vespertino')).toBeNull();
    expect(ventanaTurno(DOMINGO, 'matutino')).toBeNull();
  });

  it('guía el error de fecha solo para domingo o fechas inválidas', () => {
    expect(errorFechaProgramacion(LUNES)).toBeNull();
    expect(errorFechaProgramacion(SABADO)).toBeNull();
    expect(errorFechaProgramacion(DOMINGO)).toContain('domingo');
    expect(errorFechaProgramacion('16/11/2026')).toContain('fecha válida');
  });

  it('sugiere un turno que soporte las horas pedidas', () => {
    expect(turnoSugeridoPara(LUNES, 4)).toBe('matutino');
    expect(turnoSugeridoPara(SABADO, 4)).toBe('matutino');
    expect(turnoSugeridoPara(DOMINGO, 4)).toBe('matutino');
  });

  it('salta el domingo al buscar el siguiente día laboral', () => {
    expect(siguienteDiaLaboral(LUNES)).toBe('2026-11-17');
    expect(siguienteDiaLaboral(SABADO)).toBe('2026-11-23');
    expect(ajustarADiaLaboral(DOMINGO)).toBe('2026-11-23');
    expect(ajustarADiaLaboral(SABADO)).toBe(SABADO);
  });
});
