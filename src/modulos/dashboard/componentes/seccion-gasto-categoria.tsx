import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import type { GastoPorCategoriaDashboard } from '@/modulos/dashboard/tipos/indice';

function moneda(valor: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(valor);
}

/** Etiquetas legibles de las categorías del CHECK de `gastos.categoria`. */
const ETIQUETA_CATEGORIA: Record<string, string> = {
  materia_prima: 'Materia prima',
  consumibles: 'Consumibles',
  herramentental: 'Herramental',
  maquila_externa: 'Maquila externa',
  logistica: 'Logística',
  servicios_generales: 'Servicios generales',
  nomina: 'Nómina',
  mantenimiento: 'Mantenimiento',
  otros: 'Otros',
};

export interface SeccionGastoCategoriaProps {
  distribucion: readonly GastoPorCategoriaDashboard[];
  titulo?: string;
  identificador?: string;
}

/** DAS-06: distribución del gasto del periodo por categoría, en MXN. */
export function SeccionGastoCategoria({
  distribucion,
  titulo = 'Gasto por categoría',
  identificador = 'dashboard',
}: SeccionGastoCategoriaProps) {
  if (distribucion.length === 0) return null;
  const total = distribucion.reduce((suma, fila) => suma + fila.montoMxn, 0);
  return (
    <section aria-labelledby={`titulo-gasto-categoria-${identificador}`} className="grid gap-3">
      <h2 id={`titulo-gasto-categoria-${identificador}`} className="text-xl font-semibold">{titulo}</h2>
      <Tarjeta>
        <ul className="divide-y divide-borde" aria-label="Distribución de gasto por categoría">
          {distribucion.map((fila) => {
            const porcentaje = total > 0 ? (fila.montoMxn / total) * 100 : 0;
            return (
              <li
                key={fila.categoria}
                className="flex flex-wrap items-center justify-between gap-2 px-6 py-3"
              >
                <span className="text-sm text-texto-secundario">
                  {ETIQUETA_CATEGORIA[fila.categoria] ?? fila.categoria}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-texto-secundario">{porcentaje.toFixed(1)}%</span>
                  <span className="text-sm font-semibold tabular-nums text-texto-primario">{moneda(fila.montoMxn)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Tarjeta>
    </section>
  );
}
