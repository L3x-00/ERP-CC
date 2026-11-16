'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Icono } from './iconos';

/** `false` en el servidor, `true` tras hidratar: evita el desajuste de tema. */
const suscribirSinCambios = (): (() => void) => () => {};
const leerMontado = (): boolean => true;
const leerMontadoServidor = (): boolean => false;

/**
 * Opción del menú de usuario que alterna el tema global claro/oscuro.
 *
 * El icono y la etiqueta anuncian el tema de destino: luna para pasar a
 * oscuro y sol para volver a claro. Como el resto de opciones, cierra el menú
 * después de aplicar el cambio. next-themes persiste la elección en
 * `localStorage` y aplica la clase al `<html>`, por lo que el tema se conserva
 * entre rutas y recargas.
 *
 * `resolvedTheme` solo existe en el cliente: hasta montar, la etiqueta es
 * neutral para que el HTML del servidor y el de la hidratación coincidan
 * (React #418 en las páginas privadas, QA 2026-11-15).
 */
export function OpcionTemaMenu({ onSeleccionar }: { onSeleccionar: () => void }) {
  const { resolvedTheme, setTheme } = useTheme();
  const montado = useSyncExternalStore(
    suscribirSinCambios,
    leerMontado,
    leerMontadoServidor,
  );

  const esOscuro = montado && resolvedTheme === 'dark';
  const etiqueta = !montado
    ? 'Cambiar tema'
    : esOscuro
      ? 'Cambiar a tema claro'
      : 'Cambiar a tema oscuro';

  return (
    <button
      type="button"
      role="menuitem"
      data-testid="menu-tema"
      onClick={() => {
        setTheme(esOscuro ? 'light' : 'dark');
        onSeleccionar();
      }}
      className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-texto-secundario transition-colors hover:bg-superficie-2 hover:text-texto-primario focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
    >
      <Icono nombre={esOscuro ? 'sol' : 'luna'} className="h-4 w-4" />
      {etiqueta}
    </button>
  );
}
