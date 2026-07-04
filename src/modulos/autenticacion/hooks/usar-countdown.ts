'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook de cuenta regresiva en segundos.
 * Decrementa cada segundo con setInterval (limpiado al desmontar) y dispara
 * `alTerminar` exactamente una vez al llegar a 0. El callback se guarda en un
 * ref para no reiniciar el intervalo cuando cambia su identidad entre renders.
 *
 * @param segundosIniciales - Segundos desde los que inicia (y a los que reinicia) la cuenta.
 * @param alTerminar - Callback opcional disparado una sola vez cuando la cuenta llega a 0.
 * @returns Objeto con `segundosRestantes` y `reiniciar()` para volver al valor inicial.
 */
// Nombre interno con prefijo `use` para que `react-hooks/rules-of-hooks`
// (que detecta hooks por el patrón `/^use[A-Z0-9]/`) reconozca esta función.
// Se exporta con el nombre en español exigido por el contrato mediante alias.
function useCountdown(
  segundosIniciales: number,
  alTerminar?: () => void,
): {
  segundosRestantes: number;
  reiniciar: () => void;
} {
  const [segundosRestantes, setSegundosRestantes] = useState(segundosIniciales);
  const alTerminarRef = useRef(alTerminar);
  const yaTerminoRef = useRef(false);

  // Mantener siempre la última versión del callback sin reiniciar el intervalo.
  useEffect(() => {
    alTerminarRef.current = alTerminar;
  }, [alTerminar]);

  useEffect(() => {
    const intervalo = setInterval(() => {
      setSegundosRestantes((previos) => (previos <= 0 ? 0 : previos - 1));
    }, 1000);

    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (segundosRestantes === 0 && !yaTerminoRef.current) {
      yaTerminoRef.current = true;
      alTerminarRef.current?.();
    }
  }, [segundosRestantes]);

  const reiniciar = useCallback(() => {
    yaTerminoRef.current = false;
    setSegundosRestantes(segundosIniciales);
  }, [segundosIniciales]);

  return { segundosRestantes, reiniciar };
}

export { useCountdown as usarCountdown };
