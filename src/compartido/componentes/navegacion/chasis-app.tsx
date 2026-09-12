'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { BarraLateral, type UsuarioChasis } from './barra-lateral';
import { EncabezadoApp } from './encabezado-app';
import { MODULOS_NAVEGACION, type ModuloNavegacion } from './modulos-navegacion';

type PropsChasis = {
  usuario: UsuarioChasis & { id: string };
  /** Módulos ya filtrados por permisos en el servidor. */
  modulos?: readonly ModuloNavegacion[];
  children: ReactNode;
};

/**
 * Chasis compartido del panel: sidebar + encabezado + contenido. Unifica los
 * layouts `(panel)` y `(privado)` y da navegación real entre módulos.
 */
export function ChasisApp({ usuario, modulos = MODULOS_NAVEGACION, children }: PropsChasis) {
  const pathname = usePathname();
  const [abiertoMovil, setAbiertoMovil] = useState(false);

  const moduloActivo =
    modulos.find((modulo) => pathname === modulo.href || pathname.startsWith(`${modulo.href}/`)) ??
    null;

  return (
    <div className="flex min-h-screen bg-fondo">
      <BarraLateral
        usuario={usuario}
        modulos={modulos}
        abiertoMovil={abiertoMovil}
        onCerrarMovil={() => setAbiertoMovil(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <EncabezadoApp
          titulo={moduloActivo?.etiqueta ?? 'ORCA MFG ERP'}
          grupo={moduloActivo?.grupo}
          usuarioId={usuario.id}
          nombreUsuario={usuario.nombreCompleto}
          onAbrirMenu={() => setAbiertoMovil(true)}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
