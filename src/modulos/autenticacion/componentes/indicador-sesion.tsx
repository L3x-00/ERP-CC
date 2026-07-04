'use client';

import { cerrarSesionAccion } from '@/modulos/autenticacion/acciones/cerrar-sesion';
import { renovarSesionAccion } from '@/modulos/autenticacion/acciones/renovar-sesion';
import { usarCountdown } from '@/modulos/autenticacion/hooks/usar-countdown';
import { TIMEOUT_SESION_OPERADOR_MINUTOS } from '@/nucleo/autenticacion/constantes';

/** Props del indicador de sesión. */
type PropsIndicadorSesion = {
  nombreUsuario: string;
  esOperador?: boolean;
};

/**
 * Formatea segundos como cadena `mm:ss` con ceros a la izquierda.
 *
 * @param segundos - Segundos totales restantes (entero no negativo).
 * @returns Cadena en formato mm:ss (ejemplo: 14:05).
 */
function formatearCountdown(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

/**
 * Cuenta regresiva de la sesión de operador (mm:ss). Al llegar a 0 cierra la
 * sesión; el botón "Renovar" extiende la cookie de sesión y reinicia la cuenta.
 */
function CountdownOperador() {
  const { segundosRestantes, reiniciar } = usarCountdown(
    TIMEOUT_SESION_OPERADOR_MINUTOS * 60,
    () => {
      void cerrarSesionAccion();
    },
  );

  async function manejarRenovar(): Promise<void> {
    try {
      const respuesta = await renovarSesionAccion();

      if (respuesta.exito) {
        reiniciar();
        return;
      }

      await cerrarSesionAccion();
    } catch {
      // La renovación falló por red: se conserva la cuenta actual.
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span
        aria-live="polite"
        className="font-mono text-sm tabular-nums"
        title="Tiempo restante de sesión"
      >
        {formatearCountdown(segundosRestantes)}
      </span>
      <button
        type="button"
        onClick={manejarRenovar}
        className="rounded-base bg-primario px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Renovar
      </button>
    </div>
  );
}

/**
 * Indicador de sesión activa: muestra el nombre del usuario y sus controles.
 * Para operadores muestra countdown mm:ss (cierra sesión al terminar) con botón
 * "Renovar"; para el resto muestra botón "Cerrar sesión".
 */
export function IndicadorSesion({ nombreUsuario, esOperador = false }: PropsIndicadorSesion) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm font-medium">{nombreUsuario}</span>

      {esOperador ? (
        <CountdownOperador />
      ) : (
        <button
          type="button"
          onClick={() => void cerrarSesionAccion()}
          className="rounded-base border border-foreground/20 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-foreground/5"
        >
          Cerrar sesión
        </button>
      )}
    </div>
  );
}
