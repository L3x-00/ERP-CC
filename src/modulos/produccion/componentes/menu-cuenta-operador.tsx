
'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  UserRound,
} from 'lucide-react';

interface PropsMenuCuentaOperador {
  nombreOperador: string;
  operativo: boolean;
  onVerMiPanel: () => void;
  onSalir?: () => void;
}

export function MenuCuentaOperador({
  nombreOperador,
  operativo,
  onVerMiPanel,
  onSalir,
}: PropsMenuCuentaOperador) {
  const [abierto, setAbierto] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  const oscuro = resolvedTheme === 'dark';

  return (
    <div className="relative w-fit">
      <button
        type="button"
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={`Opciones de ${nombreOperador}`}
        onClick={() => setAbierto((valor) => !valor)}
        className="flex max-w-full items-center gap-3 rounded-xl p-1.5 pr-3 text-left transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-acento-suave text-acento-texto">
          <UserRound size={22} aria-hidden="true" />
        </span>

        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-semibold text-texto-primario">
            {nombreOperador}
          </span>

          <span className="flex items-center gap-1.5 text-xs text-texto-secundario">
            <span
              aria-hidden="true"
              className={
                operativo
                  ? 'h-2 w-2 rounded-full bg-exito'
                  : 'h-2 w-2 rounded-full bg-advertencia'
              }
            />

            {operativo ? 'Sesión de piso activa' : 'Solo lectura'}
          </span>
        </span>

        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-texto-secundario transition-transform duration-200 ${
            abierto ? 'rotate-180' : ''
          }`}
        />
      </button>

      {abierto ? (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cerrar menú de operador"
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div
            role="menu"
            aria-label="Menú del operador"
            className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-borde bg-superficie p-1.5 shadow-elevada"
          >
            <div className="mb-1 rounded-lg bg-superficie-2 px-3 py-3">
              <p className="truncate text-sm font-semibold text-texto-primario">
                {nombreOperador}
              </p>
              <p className="mt-0.5 text-xs text-texto-secundario">
                Operador de producción
              </p>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                onVerMiPanel();
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-texto-primario transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
            >
              <LayoutDashboard size={17} aria-hidden="true" />
              <span className="flex-1">Ver mi panel</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setTheme(oscuro ? 'light' : 'dark');
                setAbierto(false);
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-texto-primario transition-colors hover:bg-superficie-2 focus-visible:outline-2 focus-visible:outline-acento"
            >
              {oscuro ? (
                <Sun size={17} aria-hidden="true" />
              ) : (
                <Moon size={17} aria-hidden="true" />
              )}
              <span className="flex-1">
                Cambiar a tema {oscuro ? 'claro' : 'oscuro'}
              </span>
            </button>

            {onSalir ? (
              <>
                <div className="my-1 border-t border-borde" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAbierto(false);
                    onSalir();
                  }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-peligro-texto transition-colors hover:bg-peligro-suave focus-visible:outline-2 focus-visible:outline-acento"
                >
                  <LogOut size={17} aria-hidden="true" />
                  <span>Salir</span>
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
