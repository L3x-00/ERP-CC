
'use client';

import { cerrarSesionAccion } from '@/modulos/autenticacion/acciones/cerrar-sesion';

/** Props del indicador de sesión. */
type PropsIndicadorSesion = {
  nombreUsuario: string;
  esOperador?: boolean;
};

/**
 * Indicador de sesión para usuarios del ERP.
 *
 * La terminal de piso utiliza su propio menú de operador,
 * por lo que no debe duplicar aquí la identidad ni el botón Salir.
 */
export function IndicadorSesion({
  nombreUsuario,
  esOperador = false,
}: PropsIndicadorSesion) {
  if (esOperador) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="text-sm font-medium">{nombreUsuario}</span>

      <button
        type="button"
        onClick={() => void cerrarSesionAccion()}
        className="rounded-base border border-borde-fuerte px-3 py-1.5 text-sm font-medium transition-colors hover:bg-superficie-2"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
