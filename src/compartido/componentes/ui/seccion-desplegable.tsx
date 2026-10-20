'use client';

import { useId, useState, type ReactNode } from 'react';

export interface PropsSeccionDesplegable {
  titulo: string;
  descripcion?: ReactNode;
  children?: ReactNode;
  /** Estado inicial cuando el componente no está controlado. */
  abiertoInicial?: boolean;
  /** Estado controlado; si se omite, el componente maneja su propio estado. */
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
  /** Etiqueta accesible del botón; por defecto usa el título. */
  etiquetaBoton?: string;
  className?: string;
  claseBoton?: string;
  claseContenido?: string;
  dataTestId?: string;
  dataTestIdBoton?: string;
}

/**
 * Sección plegable con animación de altura basada en grid. El contenido
 * permanece montado para no perder estado de formularios ni consultas; cuando
 * está cerrado se marca `inert` para que el teclado y los lectores de pantalla
 * no entren en controles ocultos. Respeta `prefers-reduced-motion`.
 */
export function SeccionDesplegable({
  titulo,
  descripcion,
  children,
  abiertoInicial = false,
  abierto,
  onAbiertoChange,
  etiquetaBoton,
  className = '',
  claseBoton = '',
  claseContenido = '',
  dataTestId,
  dataTestIdBoton,
}: PropsSeccionDesplegable) {
  const [abiertoInterno, setAbiertoInterno] = useState(abiertoInicial);
  const controlado = abierto !== undefined;
  const estaAbierto = controlado ? abierto : abiertoInterno;
  const idContenido = useId();
  const idBoton = useId();

  function alternar(): void {
    const siguiente = !estaAbierto;
    if (!controlado) setAbiertoInterno(siguiente);
    onAbiertoChange?.(siguiente);
  }

  return (
    <section
      className={`rounded-base border border-borde bg-superficie ${className}`}
      aria-labelledby={idBoton}
      data-testid={dataTestId}
    >
      <button
        id={idBoton}
        type="button"
        aria-expanded={estaAbierto}
        aria-controls={idContenido}
        aria-label={etiquetaBoton ?? `${estaAbierto ? 'Ocultar' : 'Mostrar'} ${titulo}`}
        onClick={alternar}
        data-testid={dataTestIdBoton}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-base px-4 py-2.5 text-left transition-colors hover:bg-superficie-2 focus-visible:ring-2 focus-visible:ring-acento/40 focus-visible:outline-none ${claseBoton}`}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium text-texto-primario">{titulo}</span>
          {descripcion ? (
            <span className="text-xs font-normal text-texto-secundario">{descripcion}</span>
          ) : null}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-4 shrink-0 text-texto-secundario transition-transform duration-200 motion-reduce:transition-none ${
            estaAbierto ? 'rotate-180' : ''
          }`}
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      <div
        id={idContenido}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          estaAbierto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        inert={!estaAbierto ? true : undefined}
      >
        {/* `overflow-clip`, no `hidden`: mientras la altura se anima, un contenedor `hidden` es
            desplazable (scrollIntoView, foco) y, al crecer, su scroll interno se reajusta y mueve
            los controles bajo el puntero entre pulsar y soltar, con lo que el clic se pierde. */}
        <div className={`min-h-0 overflow-clip ${claseContenido}`}>
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </section>
  );
}
