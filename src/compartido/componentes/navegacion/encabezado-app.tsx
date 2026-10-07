'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/compartido/utilidades/cn';
import { AvatarIniciales } from '@/compartido/componentes/diseno/avatar';
import { CentroNotificacionesHeader } from '@/modulos/comentarios/componentes/indice';
import { cerrarSesionAccion } from '@/modulos/autenticacion/acciones/cerrar-sesion';
import { Icono } from './iconos';

const ETIQUETA_ROL: Record<string, string> = {
  admin: 'Administrador',
  vendedor: 'Ventas',
  gerente: 'Gerencia',
  contador: 'Contabilidad',
  operador: 'Operador',
};

type PropsEncabezado = {
  titulo: string;
  grupo?: string;
  usuarioId: string;
  nombreUsuario: string;
  rolUsuario: string;
  onAbrirMenu: () => void;
};

/**
 * Usuario de la sesión junto a la campana: botón desplegable con las opciones
 * de cuenta (cerrar sesión). En pantallas pequeñas se muestra solo el avatar.
 */
function MenuUsuario({ nombre, rol }: { nombre: string; rol: string }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const manejarTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') setAbierto(false);
    };
    const manejarClic = (evento: MouseEvent): void => {
      if (!contenedorRef.current?.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener('keydown', manejarTecla);
    document.addEventListener('mousedown', manejarClic);
    return () => {
      document.removeEventListener('keydown', manejarTecla);
      document.removeEventListener('mousedown', manejarClic);
    };
  }, [abierto]);

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        data-testid="menu-usuario"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Menú de usuario: ${nombre}`}
        onClick={() => setAbierto((actual) => !actual)}
        className="flex min-h-10 items-center gap-2 rounded-base border border-borde-fuerte py-1 pl-1 pr-2 transition-colors hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
      >
        <AvatarIniciales nombre={nombre} tamano="sm" />
        <span className="hidden max-w-40 truncate text-sm font-medium text-texto-secundario lg:inline-block">
          {nombre}
        </span>
        <Icono
          nombre="chevron"
          className={cn('h-4 w-4 shrink-0 text-texto-tenue transition-transform', abierto && 'rotate-180')}
        />
      </button>
      {abierto ? (
        <div
          role="menu"
          aria-label="Opciones de usuario"
          className="absolute right-0 top-full z-50 mt-1 w-60 rounded-md border border-borde bg-superficie p-1 shadow-lg"
        >
          <div className="border-b border-borde px-3 py-2">
            <p className="truncate text-sm font-semibold text-texto-primario">{nombre}</p>
            <p className="truncate text-xs text-texto-secundario">{ETIQUETA_ROL[rol] ?? rol}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              void cerrarSesionAccion();
            }}
            className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-texto-secundario transition-colors hover:bg-peligro-suave hover:text-peligro-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
          >
            <Icono nombre="cerrar" className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Barra superior sticky: menú móvil, breadcrumb del módulo y acciones globales. */
export function EncabezadoApp({
  titulo,
  grupo,
  usuarioId,
  nombreUsuario,
  rolUsuario,
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
        <MenuUsuario nombre={nombreUsuario} rol={rolUsuario} />
      </div>
    </header>
  );
}
