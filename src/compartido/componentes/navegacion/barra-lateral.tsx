'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/compartido/utilidades/cn';
import { usarTiendaUI } from '@/estado/tienda-ui';
import { Icono } from './iconos';
import { ORDEN_GRUPOS, type ModuloNavegacion } from './modulos-navegacion';

export type UsuarioChasis = {
  nombreCompleto: string;
  rol: string;
};

function estaActivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ContenidoNavegacion({
  modulos,
  contraida,
  alNavegar,
}: {
  modulos: readonly ModuloNavegacion[];
  contraida: boolean;
  alNavegar?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="scroll-sutil flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-3" aria-label="Navegación principal">
      {ORDEN_GRUPOS.map((grupo) => {
        const items = modulos.filter((modulo) => modulo.grupo === grupo);
        if (items.length === 0) return null;
        return (
          <div
            key={grupo}
            className={cn(
              'flex flex-col gap-0.5',
              grupo === 'Sistema' && 'sticky bottom-0 z-10 -mx-3 mt-auto bg-superficie px-3 pb-1 pt-3',
            )}
          >
            {!contraida ? (
              <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-texto-tenue">
                {grupo}
              </p>
            ) : (
              <div className="py-1" aria-hidden="true" />
            )}
            {items.map((modulo) => {
              const activo = estaActivo(pathname, modulo.href);
              return (
                <Link
                  key={modulo.href}
                  href={modulo.href}
                  onClick={alNavegar}
                  aria-current={activo ? 'page' : undefined}
                  title={contraida ? modulo.etiqueta : undefined}
                  className={cn(
                    'group flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200 ease-suave',
                    activo
                      ? 'bg-acento-suave text-acento-texto shadow-xs'
                      : 'text-texto-secundario hover:bg-superficie-2/70 hover:text-texto-primario',
                    contraida && 'justify-center px-0',
                  )}
                >
                  <Icono
                    nombre={modulo.icono}
                    className="h-5 w-5 shrink-0 transition-transform duration-200 ease-suave group-hover:scale-105"
                  />
                  {!contraida ? <span className="truncate">{modulo.etiqueta}</span> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

type PropsBarraLateral = {
  modulos: readonly ModuloNavegacion[];
  abiertoMovil: boolean;
  onCerrarMovil: () => void;
};

/**
 * Navegación principal: 240px expandida / 64px colapsada en escritorio y
 * drawer deslizante en mobile. Consume `barraLateralContraida` de Zustand.
 */
export function BarraLateral({ modulos, abiertoMovil, onCerrarMovil }: PropsBarraLateral) {
  const contraida = usarTiendaUI((estado) => estado.barraLateralContraida);
  const contraerBarra = usarTiendaUI((estado) => estado.contraerBarra);
  const expandirBarra = usarTiendaUI((estado) => estado.expandirBarra);

  return (
    <>
      <aside
        data-contraida={contraida ? 'true' : 'false'}
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col bg-superficie shadow-lateral transition-[width] duration-300 ease-suave md:flex',
          contraida ? 'w-16' : 'w-60',
        )}
        aria-label="Navegación principal"
      >
        <div className={cn('flex h-16 items-center gap-2.5 px-4', contraida && 'justify-center px-0')}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-acento text-sm font-black text-white shadow-sm">
            O
          </span>
          {!contraida ? (
            <span className="truncate text-sm font-bold tracking-tight text-texto-primario">
              CC Manufacturing Group
            </span>
          ) : null}
        </div>

        <ContenidoNavegacion modulos={modulos} contraida={contraida} />

        <div className="p-2">
          <button
            type="button"
            onClick={() => (contraida ? expandirBarra() : contraerBarra())}
            aria-label={contraida ? 'Expandir navegación' : 'Contraer navegación'}
            className="flex min-h-10 w-full items-center justify-center rounded-lg text-texto-secundario transition-colors duration-200 hover:bg-superficie-2/70 hover:text-texto-primario"
          >
            <Icono
              nombre="contraer"
              className={cn('h-4 w-4 transition-transform duration-300 ease-suave', !contraida && 'rotate-180')}
            />
          </button>
        </div>
      </aside>

      {abiertoMovil ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={onCerrarMovil}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <div className="deslizar-izquierda relative flex h-full w-64 flex-col bg-superficie shadow-elevada">
            <div className="flex h-16 items-center justify-between px-4">
              <span className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-acento text-sm font-black text-white shadow-sm">
                  O
                </span>
                <span className="text-sm font-bold text-texto-primario">CC Manufacturing Group</span>
              </span>
              <button
                type="button"
                onClick={onCerrarMovil}
                aria-label="Cerrar menú"
                className="rounded-lg p-2 text-texto-secundario transition-colors hover:bg-superficie-2"
              >
                <Icono nombre="cerrar" />
              </button>
            </div>
            <ContenidoNavegacion modulos={modulos} contraida={false} alNavegar={onCerrarMovil} />
          </div>
        </div>
      ) : null}
    </>
  );
}
