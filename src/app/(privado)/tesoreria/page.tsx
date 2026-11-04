import { redirect } from 'next/navigation';

/** La ruta histórica de tesorería vive ahora dentro del módulo de Cobros. */
export default function PaginaTesoreria() {
  redirect('/cobros?seccion=tesoreria');
}
