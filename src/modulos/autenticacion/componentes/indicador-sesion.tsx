'use client';

import { cerrarSesionAccion } from '@/modulos/autenticacion/acciones/cerrar-sesion';
import { cerrarVistaOperadorAccion } from '@/modulos/autenticacion/acciones/cerrar-vista-operador';
import { Button } from '@/compartido/componentes/ui/button';

/** Props del indicador de sesión. */
type PropsIndicadorSesion = {
  nombreUsuario: string;
  esOperador?: boolean;
};

/**
 * Indicador de sesión activa: muestra el nombre del usuario y sus controles.
 *
 * C10: la terminal de operador no usa cuenta regresiva; la sesión de piso se
 * mantiene abierta hasta que el operador pulsa «Salir» o cierra la ventana.
 */
export function IndicadorSesion({ nombreUsuario, esOperador = false }: PropsIndicadorSesion) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="text-sm font-medium">{nombreUsuario}</span>

      {esOperador ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-texto-secundario">
            Sesión de piso activa · se cierra al salir o cerrar la ventana
          </span>
          <Button
            type="button"
            onClick={() => void cerrarVistaOperadorAccion()}
            variante="contorno"
            tamano="lg"
          >
            Salir
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void cerrarSesionAccion()}
          className="rounded-base border border-borde-fuerte px-3 py-1.5 text-sm font-medium transition-colors hover:bg-superficie-2"
        >
          Cerrar sesión
        </button>
      )}
    </div>
  );
}
