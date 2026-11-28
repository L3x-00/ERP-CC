'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ContextoTutorial } from './contexto-tutorial-configuracion';
import { GuiaConfiguracion } from './guia-configuracion';
import { PASOS_TUTORIAL_CONFIGURACION } from './pasos-tutorial-configuracion';

/**
 * Estado del tutorial solo en memoria: al recargar la página vuelve al inicio.
 * Permite que el usuario salte entre Configuración, Planeación, Inventario y RFQ
 * sin perder el paso en el que va.
 */
export function ProveedorTutorialConfiguracion({ children }: { children: ReactNode }) {
  const [activo, setActivo] = useState(false);
  const [paso, setPaso] = useState(0);

  const activar = useCallback(() => {
    setPaso(0);
    setActivo(true);
  }, []);

  const salir = useCallback(() => {
    setActivo(false);
  }, []);

  const reiniciar = useCallback(() => {
    setPaso(0);
    setActivo(true);
  }, []);

  const siguiente = useCallback(() => {
    setPaso((actual) => Math.min(actual + 1, PASOS_TUTORIAL_CONFIGURACION.length - 1));
  }, []);

  const irAPaso = useCallback((indice: number) => {
    if (indice >= 0 && indice < PASOS_TUTORIAL_CONFIGURACION.length) setPaso(indice);
  }, []);

  const pasoActual = PASOS_TUTORIAL_CONFIGURACION[paso];
  const valor = useMemo(
    () => ({
      activo,
      paso,
      seccionSolicitada: activo ? pasoActual?.seccion : undefined,
      subseccionSolicitada: activo ? pasoActual?.subseccion : undefined,
      activar,
      salir,
      reiniciar,
      siguiente,
      irAPaso,
    }),
    [activo, paso, pasoActual, activar, salir, reiniciar, siguiente, irAPaso],
  );

  return (
    <ContextoTutorial.Provider value={valor}>
      {children}
      <GuiaConfiguracion />
    </ContextoTutorial.Provider>
  );
}
