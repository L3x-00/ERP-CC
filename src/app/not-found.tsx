import Link from 'next/link';

/**
 * Página 404: ruta no encontrada.
 */
export default function PaginaNoEncontrada() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-6xl font-bold text-primario">404</p>
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <p className="max-w-md text-sm opacity-70">
        La ruta que buscas no existe o fue movida.
      </p>
      <Link
        href="/"
        className="rounded-md bg-primario px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
