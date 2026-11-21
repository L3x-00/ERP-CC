'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  ahoraMs,
  esperarDuracionMinima,
  EVENTO_ACCESO_PERMITIDO,
  EVENTO_FIN_VALIDACION,
  EVENTO_INICIO_SESION,
} from '@/compartido/constantes/bienvenida';
import { cn } from '@/compartido/utilidades/cn';
import { validarPinAccion } from '@/modulos/autenticacion/acciones/validar-pin';
import { PIN_LONGITUD } from '@/nucleo/autenticacion/constantes';

type ResultadoPin = 'permitido' | 'denegado';

/** Dígitos del teclado en orden de despliegue (3 columnas). */
const DIGITOS: readonly string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Posiciones visuales del PIN (siempre seis). */
const CASILLAS = Array.from({ length: PIN_LONGITUD }, (_, indice) => indice);

/** Pequeña pausa para que el último dígito se pinte antes de validar. */
const RETARDO_VALIDACION_MS = 260;
const DURACION_ACCESO_PERMITIDO_MS = 1100;
const DURACION_ACCESO_DENEGADO_MS = 1300;

/**
 * Acceso de operadores de piso por PIN.
 *
 * El PIN es siempre de seis dígitos y se puede escribir con el teclado físico
 * o con el teclado numérico en pantalla. Al completar los seis dígitos se
 * valida automáticamente: el acceso correcto se anuncia en verde con un check
 * y el incorrecto en rojo con una sacudida suave y el mensaje de denegación.
 */
export function TecladoPin() {
  const router = useRouter();
  const campoPin = useRef<HTMLInputElement>(null);
  const enviandoRef = useRef(false);
  const retardoRef = useRef<number | null>(null);
  const cierreRef = useRef<number | null>(null);
  const navegacionRef = useRef<number | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoPin | null>(null);
  const [enfocado, setEnfocado] = useState(false);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    const marco = requestAnimationFrame(() => {
      setHidratado(true);
      // El PIN se puede escribir de inmediato sin tocar la pantalla.
      campoPin.current?.focus();
    });
    return () => {
      cancelAnimationFrame(marco);
      if (retardoRef.current !== null) window.clearTimeout(retardoRef.current);
      if (cierreRef.current !== null) window.clearTimeout(cierreRef.current);
      if (navegacionRef.current !== null) window.clearTimeout(navegacionRef.current);
    };
  }, []);

  function limpiarTemporizadorRetardo(): void {
    if (retardoRef.current !== null) {
      window.clearTimeout(retardoRef.current);
      retardoRef.current = null;
    }
  }

  function limpiarTemporizadorCierre(): void {
    if (cierreRef.current !== null) {
      window.clearTimeout(cierreRef.current);
      cierreRef.current = null;
    }
  }

  function programarValidacion(valor: string): void {
    limpiarTemporizadorRetardo();
    if (valor.length !== PIN_LONGITUD) return;
    retardoRef.current = window.setTimeout(() => {
      retardoRef.current = null;
      void validarPin(valor);
    }, RETARDO_VALIDACION_MS);
  }

  async function validarPin(valor: string): Promise<void> {
    if (valor.length !== PIN_LONGITUD || enviandoRef.current) return;

    limpiarTemporizadorRetardo();
    limpiarTemporizadorCierre();
    const inicio = ahoraMs();

    // Se anuncia el splash antes de cualquier setState para que el teclado no
    // llegue a pintarse en estado «validando» sin la cubierta.
    window.dispatchEvent(new Event(EVENTO_INICIO_SESION));
    enviandoRef.current = true;
    setValidando(true);
    setError(null);

    let exito = false;
    let mensaje = 'Error de conexión. Intenta de nuevo.';
    try {
      const respuesta = await validarPinAccion({ pin: valor });
      exito = respuesta.exito;
      if (!respuesta.exito) mensaje = respuesta.error;
    } catch {
      // Se conserva el mensaje de conexión por defecto.
    }

    await esperarDuracionMinima(inicio);

    if (exito) {
      // El check vive dentro del splash; este no se retira hasta que la ruta
      // /produccion-piso ya esté montada, sin mostrar el teclado intermedio.
      setResultado('permitido');
      window.dispatchEvent(new Event(EVENTO_ACCESO_PERMITIDO));
      navegacionRef.current = window.setTimeout(() => {
        navegacionRef.current = null;
        setResultado(null);
        setPin('');
        setError(null);
        setValidando(false);
        enviandoRef.current = false;
        router.push('/produccion-piso');
      }, DURACION_ACCESO_PERMITIDO_MS);
      return;
    }

    window.dispatchEvent(new Event(EVENTO_FIN_VALIDACION));
    setError(mensaje);
    setResultado('denegado');
    cierreRef.current = window.setTimeout(() => {
      cierreRef.current = null;
      setResultado(null);
      setPin('');
      setError(null);
      setValidando(false);
      enviandoRef.current = false;
      campoPin.current?.focus();
    }, DURACION_ACCESO_DENEGADO_MS);
  }

  function agregarDigito(digito: string): void {
    if (enviandoRef.current || pin.length >= PIN_LONGITUD) return;
    const siguiente = pin + digito;
    setError(null);
    setResultado(null);
    setPin(siguiente);
    programarValidacion(siguiente);
  }

  function borrarDigito(): void {
    if (enviandoRef.current) return;
    limpiarTemporizadorRetardo();
    setError(null);
    setResultado(null);
    setPin((previo) => previo.slice(0, -1));
  }

  function escribirPin(valor: string): void {
    if (enviandoRef.current) return;
    const limpio = valor.replace(/\D/g, '').slice(0, PIN_LONGITUD);
    setError(null);
    setResultado(null);
    setPin(limpio);
    programarValidacion(limpio);
  }

  const accesoPermitido = resultado === 'permitido';
  const accesoDenegado = resultado === 'denegado';
  const validandoSinResultado = validando && resultado === null;

  // Obs. cliente 2026-11-14: el teclado debe caber en la pantalla del operador
  // sin desplazamiento, así que los botones y el PIN se compactan sin perder el
  // tamaño táctil mínimo (44 px).
  const claseBotonDigito =
    'h-14 rounded-xl border border-borde bg-superficie text-2xl font-semibold text-texto-primario transition-all duration-150 ease-suave hover:bg-superficie-2 active:scale-[0.97] active:bg-acento-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento disabled:opacity-40';

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
          void validarPin(pin);
        }}
      >
        <div className="relative mx-auto w-full max-w-[17rem]">
          <div
            aria-hidden="true"
            className={cn(
              'flex justify-center gap-2 transition-transform duration-300 ease-suave',
              accesoDenegado && 'animar-sacudida-pin',
            )}
          >
            {CASILLAS.map((casilla) => {
              const lleno = casilla < pin.length;
              const activo = enfocado && casilla === Math.min(pin.length, PIN_LONGITUD - 1);
              return (
                <span
                  key={casilla}
                  className={cn(
                    'flex h-12 w-10 items-center justify-center rounded-xl border text-xl font-semibold transition-all duration-300 ease-suave',
                    'border-borde bg-superficie text-texto-primario',
                    lleno && 'border-acento/60 bg-acento-suave/50 text-acento-texto',
                    activo && !resultado && 'ring-2 ring-acento/40',
                    accesoPermitido && 'border-exito/70 bg-exito/20 text-exito-texto shadow-[0_0_18px_-4px_rgba(34,197,94,0.7)]',
                    accesoDenegado && 'border-peligro/70 bg-peligro/20 text-peligro shadow-[0_0_18px_-4px_rgba(239,68,68,0.7)]',
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
            maxLength={PIN_LONGITUD}
            value={pin}
            readOnly={validando}
            onChange={(evento) => escribirPin(evento.target.value)}
            onFocus={() => setEnfocado(true)}
            onBlur={() => setEnfocado(false)}
            aria-label="PIN de operador, 6 dígitos"
            className="absolute inset-0 h-full w-full cursor-text rounded-xl bg-transparent text-transparent caret-transparent opacity-0 outline-none"
          />
        </div>
      </form>

      <p className="text-center text-xs text-texto-tenue">
        Escribe tu PIN de {PIN_LONGITUD} dígitos o usa el teclado.
      </p>

      {validandoSinResultado && (
        <p role="status" className="text-center text-xs font-medium text-acento-texto">
          Verificando PIN…
        </p>
      )}

      {error !== null && resultado === null && (
        <p role="alert" className="text-center text-sm font-medium text-peligro">
          {error}
        </p>
      )}

      <div className="relative w-full">
        <div className={cn('grid w-full grid-cols-3 gap-2', resultado && 'opacity-45')}>
          {DIGITOS.map((digito) => (
            <button
              key={digito}
              type="button"
              disabled={validando || resultado !== null || pin.length >= PIN_LONGITUD}
              onClick={() => agregarDigito(digito)}
              className={claseBotonDigito}
            >
              {digito}
            </button>
          ))}

          <button
            type="button"
            disabled={validando || resultado !== null || pin.length === 0}
            onClick={borrarDigito}
            className="h-14 rounded-xl border border-borde bg-superficie-2 text-sm font-semibold uppercase tracking-wide text-texto-secundario transition-all duration-150 ease-suave hover:bg-borde active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento disabled:opacity-40"
            aria-label="Borrar último dígito"
          >
            Borrar
          </button>

          <button
            type="button"
            disabled={validando || resultado !== null || pin.length >= PIN_LONGITUD}
            onClick={() => agregarDigito('0')}
            className={claseBotonDigito}
          >
            0
          </button>

          <button
            type="submit"
            // Se mantiene habilitado con seis dígitos: la validación automática
            // puede haber iniciado y este botón funciona como confirmación
            // idempotente sin cerrar la animación en curso.
            disabled={pin.length !== PIN_LONGITUD}
            className="h-14 rounded-xl bg-acento text-base font-bold text-white shadow-sm transition-all duration-150 ease-suave hover:bg-acento-hover active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Confirmar PIN"
          >
            OK
          </button>
        </div>

        {resultado !== null && (
          <div
            role="status"
            aria-live="assertive"
            data-testid="resultado-pin"
            data-resultado={resultado}
            className={cn(
              'animar-resultado-pin pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl border px-4 text-center backdrop-blur-[3px]',
              accesoPermitido
                ? 'border-exito/50 bg-superficie/95 shadow-[0_0_40px_-12px_rgba(34,197,94,0.55)] dark:bg-[#0b1220]/85'
                : 'border-peligro/50 bg-superficie/95 shadow-[0_0_40px_-12px_rgba(239,68,68,0.55)] dark:bg-[#0b1220]/85',
            )}
          >
            <div className={cn('flex flex-col items-center gap-2', accesoDenegado && 'animar-sacudida-pin')}>
              <span
                className={cn(
                  'flex h-16 w-16 items-center justify-center rounded-full border-2 transition-colors duration-300',
                  accesoPermitido
                    ? 'border-exito bg-exito/20 text-exito-texto'
                    : 'border-peligro bg-peligro/20 text-peligro',
                )}
              >
                {accesoPermitido ? (
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                )}
              </span>
              <p
                className={cn(
                  'text-base font-bold tracking-tight',
                  accesoPermitido ? 'text-exito-texto' : 'text-peligro',
                )}
              >
                {accesoPermitido ? 'Acceso permitido' : 'Acceso denegado'}
              </p>
              {accesoPermitido ? (
                <p className="text-xs text-texto-secundario">Entrando al piso…</p>
              ) : error ? (
                <p className="max-w-[15rem] text-xs leading-snug text-texto-secundario">{error}</p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
