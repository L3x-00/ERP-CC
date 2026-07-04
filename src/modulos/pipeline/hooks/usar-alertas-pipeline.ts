'use client';

import { useMemo } from 'react';
import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';
import {
  calcularAlertas,
  type AlertaPipeline,
} from '@/modulos/pipeline/servicios/calcular-alertas';

// Hook puro (sin fetch): memoiza las alertas por oportunidad para no recalcular
// en cada render del tablero. Nombre interno con prefijo `use` por la regla
// `react-hooks/rules-of-hooks`; se exporta con alias en español.
function useAlertasPipeline(
  oportunidades: Oportunidad[],
): Record<string, AlertaPipeline[]> {
  return useMemo(
    () =>
      Object.fromEntries(oportunidades.map((o) => [o.id, calcularAlertas(o)])),
    [oportunidades],
  );
}

export { useAlertasPipeline as usarAlertasPipeline };
