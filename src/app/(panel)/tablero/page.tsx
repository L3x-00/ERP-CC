import { redirect } from 'next/navigation';

/** Compatibilidad para enlaces históricos: el tablero real vive en /dashboard. */
export default function PaginaTablero() {
  redirect('/dashboard');
}
