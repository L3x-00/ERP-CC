import { redirect } from 'next/navigation';

/** La ruta histórica de compras vive ahora dentro del módulo de Egresos. */
export default function PaginaCompras() {
  redirect('/egresos?seccion=compras');
}
