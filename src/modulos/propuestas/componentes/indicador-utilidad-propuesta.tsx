import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { TotalesPropuesta } from '@/modulos/propuestas/tipos/indice';

/** `0.4924` → `49.24%`; `—` cuando no hay costo contra el cual calcular. */
export function formatearUtilidadPorcentaje(fraccion: number | null): string {
  return fraccion === null ? '—' : `${(fraccion * 100).toFixed(2)}%`;
}

/** Objetivo configurado sin ceros de relleno: `30` → `30 %`, `45.5` → `45.5 %`. */
export function formatearObjetivoUtilidad(porcentaje: number): string {
  return `${Number(porcentaje.toFixed(2))} %`;
}

/**
 * Indicador comercial principal de la revisión: utilidad estimada % sobre el
 * costo total estimado de fabricación (venta sin IVA − costo) / costo. Reemplaza
 * al «Margen» sobre venta; en rojo cuando queda debajo del objetivo.
 */
export function CeldaUtilidadPropuesta({ totales }: { totales: TotalesPropuesta }) {
  return (
    <div className="flex flex-col" data-testid="utilidad-sobre-costo">
      <span className="text-xs text-texto-secundario">Utilidad estimada % sobre costo</span>
      <span
        className={`font-medium tabular-nums ${totales.bajoObjetivo ? 'text-peligro-texto' : ''}`}
      >
        {formatearUtilidadPorcentaje(totales.utilidadPorcentaje)}
      </span>
    </div>
  );
}

/**
 * Detalle del indicador: costo, utilidad en importe, objetivo y precio mínimo
 * recomendado, con alerta visible (sin bloquear) si la venta queda debajo del
 * objetivo. Todo sin IVA.
 */
export function AvisoUtilidadPropuesta({ totales }: { totales: TotalesPropuesta }) {
  if (totales.precioMinimoRecomendado === null) {
    return (
      <p data-testid="aviso-utilidad-propuesta" className="text-xs text-texto-secundario">
        Sin costo estimado todavía: costea el ruteo y captura material y otros para ver la utilidad
        sobre costo y el precio mínimo recomendado.
      </p>
    );
  }

  const objetivo = formatearObjetivoUtilidad(totales.utilidadObjetivoPorcentaje);
  return (
    <div
      data-testid="aviso-utilidad-propuesta"
      data-bajo-objetivo={totales.bajoObjetivo ? 'si' : 'no'}
      className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-xs ${
        totales.bajoObjetivo
          ? 'border-peligro/40 bg-peligro-suave text-peligro-texto'
          : 'border-borde text-texto-secundario'
      }`}
    >
      {totales.bajoObjetivo && (
        <p role="alert" className="text-sm font-semibold">
          Utilidad por debajo del objetivo de {objetivo}: la venta sin IVA (
          {formatearMoneda(totales.subtotal, totales.moneda)}) queda debajo del precio mínimo
          recomendado. No bloquea la propuesta.
        </p>
      )}
      <p>
        Costo total estimado {formatearMoneda(totales.costoTotal, totales.moneda)} · Utilidad{' '}
        {formatearMoneda(totales.utilidadImporte, totales.moneda)} · Objetivo {objetivo} sobre costo
        · Precio mínimo recomendado (sin IVA){' '}
        <strong data-testid="precio-minimo-recomendado">
          {formatearMoneda(totales.precioMinimoRecomendado, totales.moneda)}
        </strong>
      </p>
    </div>
  );
}
