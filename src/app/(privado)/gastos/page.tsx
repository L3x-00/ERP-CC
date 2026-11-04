import { redirect } from 'next/navigation';

/** La ruta histórica de gastos vive ahora dentro del módulo de Egresos. */
export default function PaginaGastos() {
  redirect('/egresos?seccion=gastos');
}
