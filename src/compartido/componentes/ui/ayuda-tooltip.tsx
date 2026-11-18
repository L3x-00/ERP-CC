'use client';

import { useCallback, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Posicion = { x: number; y: number; abajo: boolean };

/**
 * Explicación breve que aparece al pasar el puntero —o al enfocar con el
 * teclado— cualquier cifra que lo necesite. Se renderea en un portal sobre el
 * `body` para que no se recorte dentro de tablas con scroll ni de diálogos.
 */
export function AyudaTooltip({
  texto,
  children,
  className = '',
}: {
  texto: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [posicion, setPosicion] = useState<Posicion | null>(null);

  const mostrar = useCallback((objetivo: HTMLElement) => {
    const rect = objetivo.getBoundingClientRect();
    const abajo = rect.top < 110;
    const borde = 170;
    setPosicion({
      x: Math.min(Math.max(rect.left + rect.width / 2, borde), Math.max(window.innerWidth - borde, borde)),
      y: abajo ? rect.bottom + 8 : rect.top - 8,
      abajo,
    });
  }, []);

  const ocultar = useCallback(() => setPosicion(null), []);

  return (
    <>
      <span
        className={`inline-flex cursor-help items-center rounded-sm underline decoration-dotted decoration-borde-fuerte underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-acento/40 ${className}`}
        tabIndex={0}
        aria-describedby={posicion ? id : undefined}
        onMouseEnter={(evento) => mostrar(evento.currentTarget)}
        onMouseLeave={ocultar}
        onFocus={(evento) => mostrar(evento.currentTarget)}
        onBlur={ocultar}
      >
        {children}
      </span>
      {posicion && typeof document !== 'undefined'
        ? createPortal(
            <span
              role="tooltip"
              id={id}
              data-testid="ayuda-tooltip"
              className="pointer-events-none fixed z-50 w-max max-w-72 rounded-md border border-borde bg-superficie px-3 py-2 text-left text-xs leading-relaxed text-texto-primario shadow-lg"
              style={{
                left: `${posicion.x}px`,
                top: `${posicion.y}px`,
                transform: `translateX(-50%) ${posicion.abajo ? '' : 'translateY(-100%)'}`,
              }}
            >
              {texto}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
