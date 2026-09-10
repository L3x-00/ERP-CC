'use client';

import type { ChangeEvent } from 'react';
import { Input, Select } from '@/compartido/componentes/ui/input';
import type { FiltroPeriodoDashboard, PeriodoTipoDashboard } from '@/modulos/dashboard/tipos/indice';

function fechaInicioDiaUTC(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

function formatearRango(periodo: PeriodoTipoDashboard): { inicio: Date; fin: Date } {
  const hoy = fechaInicioDiaUTC(new Date());
  const fin = new Date(hoy);
  if (periodo === 'hoy') fin.setUTCDate(fin.getUTCDate() + 1);
  if (periodo === 'semana_actual') {
    hoy.setUTCDate(hoy.getUTCDate() - ((hoy.getUTCDay() + 6) % 7));
    fin.setTime(hoy.getTime());
    fin.setUTCDate(fin.getUTCDate() + 7);
  }
  if (periodo === 'mes_actual') {
    hoy.setUTCDate(1);
    fin.setUTCFullYear(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1);
  }
  if (periodo === 'anio_actual') {
    hoy.setUTCMonth(0, 1);
    fin.setUTCFullYear(hoy.getUTCFullYear() + 1, 0, 1);
  }
  return { inicio: hoy, fin };
}

function emitirPeriodo(
  periodoTipo: PeriodoTipoDashboard,
  cambiar: (filtro: FiltroPeriodoDashboard) => void,
): void {
  const rango = formatearRango(periodoTipo);
  cambiar({ fechaInicio: rango.inicio.toISOString(), fechaFin: rango.fin.toISOString(), periodoTipo });
}

export interface FiltroPeriodoGlobalProps {
  filtro: FiltroPeriodoDashboard;
  onChange: (filtro: FiltroPeriodoDashboard) => void;
  disabled?: boolean;
}

/** Selector global con intervalo semiabierto; las fechas manuales se normalizan en UTC. */
export function FiltroPeriodoGlobal({ filtro, onChange, disabled = false }: FiltroPeriodoGlobalProps) {
  const fechaInicio = filtro.fechaInicio.slice(0, 10);
  // El contrato del servidor usa `fechaFin` exclusiva; el control humano
  // muestra y recibe una fecha inclusiva para no presentar el día siguiente.
  const fechaFinVisible = new Date(filtro.fechaFin);
  fechaFinVisible.setUTCDate(fechaFinVisible.getUTCDate() - 1);
  const fechaFin = fechaFinVisible.toISOString().slice(0, 10);

  const cambiarFecha = (campo: 'inicio' | 'fin', evento: ChangeEvent<HTMLInputElement>): void => {
    const valor = evento.target.value;
    if (!valor) return;
    const inicio = campo === 'inicio' ? valor : fechaInicio;
    const fin = campo === 'fin' ? valor : fechaFin;
    const inicioFecha = new Date(`${inicio}T00:00:00.000Z`);
    const finFecha = new Date(`${fin}T00:00:00.000Z`);
    finFecha.setUTCDate(finFecha.getUTCDate() + 1);
    if (inicioFecha >= finFecha) return;
    onChange({ fechaInicio: inicioFecha.toISOString(), fechaFin: finFecha.toISOString(), periodoTipo: 'personalizado' });
  };

  return (
    <section aria-label="Filtro de periodo del dashboard" className="grid gap-3 rounded-base border border-foreground/10 bg-background p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-sm font-medium" htmlFor="periodo-dashboard">
        Periodo
        <Select
          id="periodo-dashboard"
          value={filtro.periodoTipo}
          disabled={disabled}
          onChange={(evento) => {
            const periodo = evento.target.value as PeriodoTipoDashboard;
            if (periodo === 'personalizado') {
              onChange({ ...filtro, periodoTipo: periodo });
            } else {
              emitirPeriodo(periodo, onChange);
            }
          }}
        >
          <option value="hoy">Hoy</option>
          <option value="semana_actual">Esta semana</option>
          <option value="mes_actual">Este mes</option>
          <option value="anio_actual">Este año</option>
          <option value="personalizado">Personalizado</option>
        </Select>
      </label>
      {filtro.periodoTipo === 'personalizado' ? (
        <>
          <label className="grid gap-1 text-sm font-medium" htmlFor="dashboard-fecha-inicio">
            Desde
            <Input id="dashboard-fecha-inicio" type="date" value={fechaInicio} disabled={disabled} onChange={(evento) => cambiarFecha('inicio', evento)} />
          </label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="dashboard-fecha-fin">
            Hasta
            <Input id="dashboard-fecha-fin" type="date" value={fechaFin} disabled={disabled} onChange={(evento) => cambiarFecha('fin', evento)} />
          </label>
        </>
      ) : null}
      <p className="self-end text-xs text-foreground/60">Los widgets se actualizan sin recargar la página.</p>
    </section>
  );
}
