'use client';

import { createContext, useContext } from 'react';

export type ContextoTutorialConfiguracion = {
  activo: boolean;
  paso: number;
  seccionSolicitada?: 'personas' | 'tarifas' | 'areas' | 'catalogos';
  subseccionSolicitada?: 'operativos' | 'usuarios';
  activar: () => void;
  salir: () => void;
  reiniciar: () => void;
  siguiente: () => void;
  irAPaso: (indice: number) => void;
};

export const ContextoTutorial = createContext<ContextoTutorialConfiguracion | null>(null);

const CONTEXTO_INERTE: ContextoTutorialConfiguracion = {
  activo: false,
  paso: 0,
  seccionSolicitada: undefined,
  subseccionSolicitada: undefined,
  activar: () => undefined,
  salir: () => undefined,
  reiniciar: () => undefined,
  siguiente: () => undefined,
  irAPaso: () => undefined,
};

export function useTutorialConfiguracion(): ContextoTutorialConfiguracion {
  return useContext(ContextoTutorial) ?? CONTEXTO_INERTE;
}
