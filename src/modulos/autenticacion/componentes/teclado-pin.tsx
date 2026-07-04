'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { validarPinAccion } from '@/modulos/autenticacion/acciones/validar-pin';
import {
  PIN_LONGITUD_MAXIMA,
  PIN_LONGITUD_MINIMA,
} from '@/nucleo/autenticacion/constantes';

/** Dígitos del teclado en orden de despliegue (3 columnas). */
const DIGITOS: readonly string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Teclado numérico en pantalla para acceso de operadores de piso por PIN.
 * Diseño oscuro con botones grandes (touch-friendly). Muestra el PIN enmascarado
 * (●), acepta máximo 6 dígitos y deshabilita OK con menos de 4. Al confirmar
 * llama `validarPinAccion`; en éxito redirige a /produccion-piso, en error
 * muestra el mensaje y limpia el PIN.
 */
export function TecladoPin() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);

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
  }

  const claseBotonDigito =
    'h-20 rounded-xl bg-zinc-800 text-3xl font-semibold text-zinc-50 transition-colors active:bg-zinc-700 disabled:opacity-40';

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-6">
      <div
        aria-label="PIN ingresado"
        className="flex h-14 w-full items-center justify-center rounded-xl bg-zinc-900 text-3xl tracking-[0.5em] text-zinc-50"
      >
        {pin.length > 0 ? '●'.repeat(pin.length) : (
          <span className="text-base tracking-normal text-zinc-500">
            Ingresa tu PIN
          </span>
        )}
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="grid w-full grid-cols-3 gap-3">
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
          className="h-20 rounded-xl bg-zinc-800 text-xl font-semibold text-zinc-300 transition-colors active:bg-zinc-700 disabled:opacity-40"
          aria-label="Borrar último dígito"
        >
          DEL
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
          onClick={confirmar}
          className="h-20 rounded-xl bg-primario text-xl font-bold text-white transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Confirmar PIN"
        >
          {validando ? '…' : 'OK'}
        </button>
      </div>
    </div>
  );
}
