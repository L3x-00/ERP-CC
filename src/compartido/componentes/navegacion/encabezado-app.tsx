'use client';

import { cn } from '@/compartido/utilidades/cn';
import { CentroNotificacionesHeader } from '@/modulos/comentarios/componentes/indice';
import { Icono } from './iconos';

type PropsEncabezado = {
  titulo: string;
  grupo?: string;
  usuarioId: string;
  nombreUsuario: string;
  onAbrirMenu: () => void;
};

/** Barra superior sticky: menú móvil, breadcrumb del módulo y acciones globales. */
export function EncabezadoApp({
  titulo,
  grupo,
  usuarioId,
  nombreUsuario,
  onAbrirMenu,
}: PropsEncabezado) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-borde bg-superficie/95 px-3 backdrop-blur md:px-6">
      <button
        type="button"
        onClick={onAbrirMenu}
        aria-label="Abrir menú de navegación"
        className="rounded-md p-2 text-texto-secundario transition-colors hover:bg-superficie-2 hover:text-texto-primario md:hidden"
      >
        <Icono nombre="menu" />
      </button>

      <div className="flex min-w-0 items-baseline gap-2">
        {grupo ? (
          <span className="hidden text-sm text-texto-tenue sm:inline">{grupo} /</span>
        ) : null}
        <h1 className="truncate text-base font-semibold text-texto-primario">{titulo}</h1>
      </div>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        <CentroNotificacionesHeader usuarioId={usuarioId} />
        <span
          className={cn(
            'hidden max-w-40 truncate rounded-md bg-superficie-2 px-3 py-1.5 text-sm font-medium text-texto-secundario',
            'lg:inline-block',
          )}
          title={nombreUsuario}
        >
          {nombreUsuario}
        </span>
      </div>
    </header>
  );
}
