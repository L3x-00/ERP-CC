'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/compartido/utilidades/cn';
import { AvatarIniciales } from '@/compartido/componentes/diseno/avatar';
import { usarTiendaUI } from '@/estado/tienda-ui';
import { cerrarSesionAccion } from '@/modulos/autenticacion/acciones/cerrar-sesion';
import { Icono } from './iconos';
import { ORDEN_GRUPOS, type ModuloNavegacion } from './modulos-navegacion';

export type UsuarioChasis = {
  nombreCompleto: string;
  rol: string;
};

const ETIQUETA_ROL: Record<string, string> = {
  admin: 'Administrador',
  vendedor: 'Ventas',
  gerente: 'Gerencia',
  contador: 'Contabilidad',
  operador: 'Operador',
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
    <nav className="scroll-sutil flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3" aria-label="Navegación principal">
      {ORDEN_GRUPOS.map((grupo) => {
        const items = modulos.filter((modulo) => modulo.grupo === grupo);
        if (items.length === 0) return null;
        return (
          <div key={grupo} className="flex flex-col gap-1">
            {!contraida ? (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-texto-tenue">
                {grupo}
              </p>
            ) : (
              <div className="mx-2 border-t border-borde" aria-hidden="true" />
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
                    'flex min-h-11 items-center gap-3 rounded-md border-l-[3px] px-3 text-sm font-medium transition-colors',
                    activo
                      ? 'border-acento bg-acento-suave text-acento'
                      : 'border-transparent text-texto-secundario hover:bg-superficie-2 hover:text-texto-primario',
                    contraida && 'justify-center px-0',
                  )}
                >
                  <Icono nombre={modulo.icono} className="h-5 w-5 shrink-0" />
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

function PieUsuario({
  usuario,
  contraida,
  alNavegar,
}: {
  usuario: UsuarioChasis;
  contraida: boolean;
  alNavegar?: () => void;
}) {
  return (
    <div className="border-t border-borde p-2">
      <div className={cn('flex items-center gap-2 rounded-md p-2', contraida && 'justify-center')}>
        <AvatarIniciales nombre={usuario.nombreCompleto} tamano="sm" />
        {!contraida ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-texto-primario">
              {usuario.nombreCompleto}
            </p>
            <p className="truncate text-xs text-texto-secundario">
              {ETIQUETA_ROL[usuario.rol] ?? usuario.rol}
            </p>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          alNavegar?.();
          void cerrarSesionAccion();
        }}
        className={cn(
          'mt-1 flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-texto-secundario transition-colors hover:bg-peligro-suave hover:text-peligro-texto',
          contraida && 'justify-center px-0',
        )}
      >
        <Icono nombre="cerrar" className="h-4 w-4" />
        {!contraida ? 'Cerrar sesión' : null}
      </button>
    </div>
  );
}

type PropsBarraLateral = {
  usuario: UsuarioChasis;
  modulos: readonly ModuloNavegacion[];
  abiertoMovil: boolean;
  onCerrarMovil: () => void;
};

/**
 * Navegación principal: 240px expandida / 64px colapsada en escritorio y
 * drawer deslizante en mobile. Consume `barraLateralContraida` de Zustand.
 */
export function BarraLateral({ usuario, modulos, abiertoMovil, onCerrarMovil }: PropsBarraLateral) {
  const contraida = usarTiendaUI((estado) => estado.barraLateralContraida);
  const contraerBarra = usarTiendaUI((estado) => estado.contraerBarra);
  const expandirBarra = usarTiendaUI((estado) => estado.expandirBarra);

  return (
    <>
      <aside
        data-contraida={contraida ? 'true' : 'false'}
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-borde bg-superficie transition-[width] duration-200 md:flex',
          contraida ? 'w-16' : 'w-60',
        )}
        aria-label="Navegación principal"
      >
        <div className={cn('flex h-14 items-center gap-2 border-b border-borde px-3', contraida && 'justify-center px-0')}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-acento text-sm font-black text-white">
            O
          </span>
          {!contraida ? (
            <span className="truncate text-sm font-bold tracking-tight text-texto-primario">
              ORCA MFG ERP
            </span>
          ) : null}
        </div>

        <ContenidoNavegacion modulos={modulos} contraida={contraida} />
        <PieUsuario usuario={usuario} contraida={contraida} />

        <button
          type="button"
          onClick={() => (contraida ? expandirBarra() : contraerBarra())}
          aria-label={contraida ? 'Expandir navegación' : 'Contraer navegación'}
          className="flex min-h-10 items-center justify-center border-t border-borde text-texto-secundario transition-colors hover:bg-superficie-2 hover:text-texto-primario"
        >
          <Icono nombre="contraer" className={cn('h-4 w-4 transition-transform', !contraida && 'rotate-180')} />
        </button>
      </aside>

      {abiertoMovil ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={onCerrarMovil}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <div className="deslizar-izquierda relative flex h-full w-64 flex-col border-r border-borde bg-superficie shadow-lg">
            <div className="flex h-14 items-center justify-between border-b border-borde px-3">
              <span className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-acento text-sm font-black text-white">
                  O
                </span>
                <span className="text-sm font-bold text-texto-primario">ORCA MFG ERP</span>
              </span>
              <button
                type="button"
                onClick={onCerrarMovil}
                aria-label="Cerrar menú"
                className="rounded-md p-2 text-texto-secundario hover:bg-superficie-2"
              >
                <Icono nombre="cerrar" />
              </button>
            </div>
            <ContenidoNavegacion modulos={modulos} contraida={false} alNavegar={onCerrarMovil} />
            <PieUsuario usuario={usuario} contraida={false} alNavegar={onCerrarMovil} />
          </div>
        </div>
      ) : null}
    </>
  );
}
