import type { CargaCapacidadDiaria } from '@/modulos/planeacion/tipos/indice';
import { sumarDias } from '@/modulos/planeacion/utilidades/fechas-planeacion';

/**
 * Cuando una operación dura más que la jornada de una máquina, no se puede
 * programar en un solo día. Esta utilidad reparte las horas entre días hábiles
 * consecutivos con capacidad comprobada para el mismo recurso y turno.
 */
export const MAX_DIAS_PLAN_MULTIDIA = 15;

export type DiaPlanMultidia = {
  fecha: string;
  horas: number;
};

export type CriteriosPlanMultidia = {
  recursoId: string;
  turno: string;
  horasTotales: number;
  desdeFecha: string;
  incluirFinesDeSemana?: boolean;
  diasMaximos?: number;
};

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function esFinDeSemana(fecha: string): boolean {
  const dia = new Date(`${fecha}T00:00:00.000Z`).getUTCDay();
  return dia === 0 || dia === 6;
}

/**
 * Reparte `horasTotales` entre los días disponibles, empezando por `desdeFecha`.
 * Devuelve null si no alcanza el horizonte pedido; nunca inventa capacidad.
 */
export function recomendarPlanMultidia(
  cargas: readonly CargaCapacidadDiaria[],
  criterios: CriteriosPlanMultidia,
): DiaPlanMultidia[] | null {
  const total = redondear(criterios.horasTotales);
  if (!Number.isFinite(total) || total <= 0) return null;

  const limite = Math.min(
    Math.max(1, criterios.diasMaximos ?? MAX_DIAS_PLAN_MULTIDIA),
    MAX_DIAS_PLAN_MULTIDIA,
  );
  const porFecha = new Map<string, CargaCapacidadDiaria>();
  for (const carga of cargas) {
    if (carga.recursoId !== criterios.recursoId) continue;
    if (carga.turno !== criterios.turno) continue;
    if (carga.fechaProgramada < criterios.desdeFecha) continue;
    if (criterios.incluirFinesDeSemana !== true && esFinDeSemana(carga.fechaProgramada)) {
      continue;
    }
    // Una sola fila por fecha/turno: la RPC ya consolidó la capacidad efectiva.
    const anterior = porFecha.get(carga.fechaProgramada);
    if (!anterior || carga.fechaProgramada < anterior.fechaProgramada) {
      porFecha.set(carga.fechaProgramada, carga);
    }
  }

  const fechas = [...porFecha.keys()].sort();
  const plan: DiaPlanMultidia[] = [];
  let restante = total;
  for (const fecha of fechas) {
    if (plan.length >= limite || restante <= 0) break;
    const carga = porFecha.get(fecha)!;
    const disponible = Math.max(0, Math.min(
      carga.horasDisponibles,
      carga.horasCapacidad,
    ));
    if (disponible <= 0) continue;
    const horas = redondear(Math.min(restante, disponible));
    if (horas <= 0) continue;
    plan.push({ fecha, horas });
    restante = redondear(restante - horas);
  }

  if (restante > 0.001) return null;
  return plan;
}

/**
 * Valida el plan que el usuario editó antes de enviarlo. El servidor vuelve a
 * validar capacidad y pertenencia de la operación.
 */
export function validarPlanMultidia(
  dias: readonly DiaPlanMultidia[],
  horasTotales: number,
): string | null {
  if (dias.length < 2) return 'Un plan de varios días necesita al menos dos días.';
  if (dias.length > MAX_DIAS_PLAN_MULTIDIA) {
    return `El plan no puede exceder ${MAX_DIAS_PLAN_MULTIDIA} días.`;
  }
  const fechas = new Set<string>();
  for (const dia of dias) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia.fecha)) return 'Cada día necesita una fecha válida.';
    if (fechas.has(dia.fecha)) return 'No puedes repetir el mismo día en el plan.';
    fechas.add(dia.fecha);
    if (!Number.isFinite(dia.horas) || dia.horas <= 0) {
      return 'Cada día debe tener horas mayores a 0.';
    }
  }
  const suma = redondear(dias.reduce((total, dia) => total + dia.horas, 0));
  if (Math.abs(suma - redondear(horasTotales)) > 0.01) {
    return `El plan suma ${suma} h y la operación requiere ${redondear(horasTotales)} h.`;
  }
  return null;
}

/** Fechas consecutivas de un plan, útil para reordenar o depurar. */
export function ordenarPlanMultidia(dias: readonly DiaPlanMultidia[]): DiaPlanMultidia[] {
  return [...dias].sort((primera, segunda) => primera.fecha.localeCompare(segunda.fecha));
}

/** Sugiere la fecha siguiente conservando el formato ISO local. */
export function diaSiguiente(fecha: string): string {
  return sumarDias(fecha, 1);
}
