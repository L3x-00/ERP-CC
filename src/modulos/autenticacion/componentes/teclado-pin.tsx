'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/compartido/utilidades/cn';
import { validarPinAccion } from '@/modulos/autenticacion/acciones/validar-pin';
import {
  PIN_LONGITUD_MAXIMA,
  PIN_LONGITUD_MINIMA,
} from '@/nucleo/autenticacion/constantes';

/** Dígitos del teclado en orden de despliegue (3 columnas). */
const DIGITOS: readonly string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Posiciones visuales del PIN (siempre la longitud máxima permitida). */
const CASILLAS = Array.from({ length: PIN_LONGITUD_MAXIMA }, (_, indice) => indice);

/**
 * Acceso de operadores de piso por PIN.
 *
 * Acepta el PIN con el teclado numérico en pantalla o escribiéndolo con el
 * teclado físico. Solo admite dígitos y nunca más de `PIN_LONGITUD_MAXIMA`;
 * confirmar exige al menos `PIN_LONGITUD_MINIMA`. En éxito redirige a
 * /produccion-piso; en error muestra el mensaje y limpia el PIN.
 */
export function TecladoPin() {
  const router = useRouter();
  const campoPin = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);
  const [enfocado, setEnfocado] = useState(false);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    const marco = requestAnimationFrame(() => {
      setHidratado(true);
      // El PIN se puede escribir de inmediato sin tocar la pantalla.
      campoPin.current?.focus();
    });
    return () => cancelAnimationFrame(marco);
  }, []);

  function agregarDigito(digito: string): void {
    setError(null);
    setPin((previo) =>
      previo.length >= PIN_LONGITUD_MAXIMA ? previo : previo + digito,
    );
  }

  function borrarDigito(): void {
    setError(null);
    setPin((previo) => previo.slice(0, -1));
  }

  function escribirPin(valor: string): void {
    setError(null);
    setPin(valor.replace(/\D/g, '').slice(0, PIN_LONGITUD_MAXIMA));
  }

  async function confirmar(): Promise<void> {
    if (pin.length < PIN_LONGITUD_MINIMA || validando) {
      return;
    }

    setValidando(true);
    setError(null);

    try {
      const respuesta = await validarPinAccion({ pin });

      if (respuesta.exito) {
        router.push('/produccion-piso');
        router.refresh();
        return;
      }

      setError(respuesta.error);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }

    setPin('');
    setValidando(false);
    campoPin.current?.focus();
  }

  // Obs. cliente 2026-11-14: el teclado debe caber en la pantalla del operador
  // sin desplazamiento, así que los botones y el PIN se compactan sin perder el
  // tamaño táctil mínimo (44 px).
  const claseBotonDigito =
    'h-14 rounded-xl border border-white/10 bg-white/[0.07] text-2xl font-semibold text-texto-primario transition-all duration-150 ease-suave hover:bg-white/[0.12] active:scale-[0.97] active:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento disabled:opacity-40';

  return (
    <div
      data-testid="teclado-pin"
      data-hidratado={hidratado ? 'true' : 'false'}
      className="flex w-full max-w-[19rem] flex-col items-center gap-3.5"
    >
      <form
        className="w-full"
        onSubmit={(evento) => {
          evento.preventDefault();
          void confirmar();
        }}
      >
        <div className="relative mx-auto w-full max-w-[17rem]">
          <div aria-hidden="true" className="flex justify-center gap-2">
            {CASILLAS.map((casilla) => {
              const lleno = casilla < pin.length;
              const activo = enfocado && casilla === Math.min(pin.length, PIN_LONGITUD_MAXIMA - 1);
              return (
                <span
                  key={casilla}
                  className={cn(
                    'flex h-12 w-10 items-center justify-center rounded-xl border text-xl font-semibold transition-all duration-200 ease-suave',
                    'border-white/15 bg-white/[0.06] text-texto-primario',
                    lleno && 'border-acento/60 bg-acento-suave/50 text-acento-texto',
                    activo && 'ring-2 ring-acento/40',
                  )}
                >
                  {lleno ? '●' : ''}
                </span>
              );
            })}
          </div>

          <input
            ref={campoPin}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={PIN_LONGITUD_MAXIMA}
            value={pin}
            onChange={(evento) => escribirPin(evento.target.value)}
            onFocus={() => setEnfocado(true)}
            onBlur={() => setEnfocado(false)}
            aria-label="PIN de operador, de 4 a 6 dígitos"
            className="absolute inset-0 h-full w-full cursor-text rounded-xl bg-transparent text-transparent caret-transparent opacity-0 outline-none"
          />
        </div>
      </form>

      <p className="text-center text-xs text-texto-tenue">
        Escribe tu PIN o usa el teclado. De {PIN_LONGITUD_MINIMA} a {PIN_LONGITUD_MAXIMA} dígitos.
      </p>

      {error !== null && (
        <p role="alert" className="text-center text-sm font-medium text-peligro">
          {error}
        </p>
      )}

      <div className="grid w-full grid-cols-3 gap-2">
        {DIGITOS.map((digito) => (
          <button
            key={digito}
            type="button"
            disabled={validando}
            onClick={() => agregarDigito(digito)}
            className={claseBotonDigito}
          >
            {digito}
          </button>
        ))}

        <button
          type="button"
          disabled={validando || pin.length === 0}
          onClick={borrarDigito}
          className="h-14 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold uppercase tracking-wide text-texto-secundario transition-all duration-150 ease-suave hover:bg-white/[0.08] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento disabled:opacity-40"
          aria-label="Borrar último dígito"
        >
          Borrar
        </button>

        <button
          type="button"
          disabled={validando}
          onClick={() => agregarDigito('0')}
          className={claseBotonDigito}
        >
          0
        </button>

        <button
          type="button"
          disabled={validando || pin.length < PIN_LONGITUD_MINIMA}
          onClick={() => void confirmar()}
          className="h-14 rounded-xl bg-acento text-base font-bold text-white shadow-sm transition-all duration-150 ease-suave hover:bg-acento-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Confirmar PIN"
        >
          {validando ? '…' : 'OK'}
        </button>
      </div>
    </div>
  );
}
