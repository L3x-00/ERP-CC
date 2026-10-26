/** Reserva estable para la carga diferida de Recharts sin desplazar la rejilla. */
export function MarcadorCargaGrafica() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex h-44 items-center justify-center rounded-lg bg-superficie-2 text-sm text-texto-secundario sm:h-48"
    >
      Cargando visualización…
    </div>
  );
}
