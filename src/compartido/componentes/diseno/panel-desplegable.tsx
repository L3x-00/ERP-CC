'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { cn } from '@/compartido/utilidades/cn';
import { Icono } from '@/compartido/componentes/navegacion/iconos';

type NivelTitulo = 'h2' | 'h3' | 'h4';

/** Duración de la animación: debe coincidir con `duration-300` de abajo. */
const MS_ANIMACION = 300;

/**
 * Panel desplegable con animación suave de altura y opacidad. El encabezado es
 * un botón (con título, descripción y un resumen opcional visibles también
 * cerrado) y el contenido nace colapsado salvo `abiertoInicial`.
 *
 * `accion` se renderiza fuera del botón para no anidar controles: permite, por
 * ejemplo, ofrecer «Limpiar filtros» sin abrir el panel. `icono` acompaña al
 * título como ancla visual.
 *
 * El contenido queda SIEMPRE montado: así los formularios controlados no pierden
 * lo capturado al plegar. Cerrado se marca `inert` (sin foco ni lectura por
 * lectores de pantalla). Como el navegador no puede enfocar un campo inválido
 * dentro de un panel cerrado y bloquearía el envío sin avisar, el panel se
 * abre solo y muestra el error. Respeta `prefers-reduced-motion`.
 */
export function PanelDesplegable({
  titulo,
  descripcion,
  resumen,
  icono,
  accion,
  nivelTitulo = 'h3',
  abiertoInicial = false,
  className,
  children,
  ...atributos
}: {
  titulo: string;
  descripcion?: string;
  /** Dato clave visible con el panel cerrado (p. ej. la tarifa vigente). */
  resumen?: ReactNode;
  /** Icono decorativo junto al título. */
  icono?: ReactNode;
  /** Acción secundaria fuera del botón de despliegue. */
  accion?: ReactNode;
  nivelTitulo?: NivelTitulo;
  abiertoInicial?: boolean;
  className?: string;
  children: ReactNode;
  'data-testid'?: string;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const idContenido = useId();
  const idEncabezado = useId();
  const Titulo = nivelTitulo;

  function alRecibirCampoInvalido(evento: FormEvent<HTMLDivElement>): void {
    if (abierto) return;
    const campo = evento.target;
    setAbierto(true);
    if (campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement) {
      window.setTimeout(() => campo.reportValidity(), MS_ANIMACION + 20);
    }
  }

  return (
    <section
      {...atributos}
      data-estado={abierto ? 'abierto' : 'cerrado'}
      className={cn(
        'min-w-0 rounded-xl bg-superficie transition-[box-shadow,background-color] duration-300 ease-suave motion-reduce:transition-none',
        abierto ? 'shadow-md ring-1 ring-acento/20' : 'shadow-suave',
        className,
      )}
    >
      <div className="flex items-center gap-1 pr-2">
        <Titulo className="m-0 min-w-0 flex-1">
          <button
            type="button"
            id={idEncabezado}
            aria-expanded={abierto}
            aria-controls={idContenido}
            onClick={() => setAbierto((valor) => !valor)}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-200 hover:bg-superficie-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
          >
            {icono ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-acento-suave text-acento-texto">
                {icono}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-texto-primario">{titulo}</span>
              {descripcion ? (
                <span className="mt-0.5 block text-xs font-normal text-texto-secundario">{descripcion}</span>
              ) : null}
              {resumen ? (
                <span className="mt-1 block text-xs font-normal text-texto-secundario">{resumen}</span>
              ) : null}
            </span>
            <Icono
              nombre="chevron"
              className={cn(
                'h-4 w-4 shrink-0 text-texto-tenue transition-transform duration-300 ease-suave motion-reduce:transition-none',
                abierto && 'rotate-180',
              )}
            />
          </button>
        </Titulo>
        {accion ? <div className="shrink-0">{accion}</div> : null}
      </div>
      <div
        id={idContenido}
        role="region"
        aria-labelledby={idEncabezado}
        inert={!abierto}
        onInvalidCapture={alRecibirCampoInvalido}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-suave motion-reduce:transition-none',
          abierto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-clip">
          <div className="px-4 pb-4 pt-1">{children}</div>
        </div>
      </div>
    </section>
  );
}
