'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import {
  marcarNotificacionesLeidasAccion,
  obtenerNotificacionesAccion,
} from '@/modulos/comentarios/acciones/indice';
import type { NotificacionUsuario } from '@/modulos/comentarios/tipos/indice';

const CLAVE_NOTIFICACIONES = ['notificaciones'] as const;

function fechaNotificacion(valor: string): string {
  const fecha = new Date(valor);
  return Number.isFinite(fecha.getTime())
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(fecha)
    : 'Fecha no disponible';
}

function enlaceInternoSeguro(enlace: string | null): string | null {
  if (!enlace || !/^\/(ordenes|pipeline|clientes)(?:\?|$)/u.test(enlace)) return null;
  return enlace;
}

/** Escucha cambios privados y vuelve a leer notificaciones bajo la sesión. */
function SincronizadorNotificaciones({ usuarioId }: { usuarioId: string }) {
  const clienteQuery = useQueryClient();
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCanalRef = useRef(`sincronizacion-notificaciones-${crypto.randomUUID()}`);
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;
    const invalidar = (): void => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (!desmontado) void clienteQuery.invalidateQueries({ queryKey: CLAVE_NOTIFICACIONES });
      }, 250);
    };
    const conectar = (): void => {
      if (desmontado || canalRef.current) return;
      const canal = supabase.channel(idCanalRef.current);
      canal.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notificaciones_usuario',
          filter: `usuario_id=eq.${usuarioId}`,
        },
        invalidar,
      );
      canalRef.current = canal;
      canal.subscribe((estado) => { if (!desmontado) setConectado(estado === 'SUBSCRIBED'); });
    };
    const desconectar = (): void => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
      const canal = canalRef.current;
      canalRef.current = null;
      if (canal) void supabase.removeChannel(canal);
      setConectado(false);
    };
    void supabase.auth.getSession().then(({ data }) => { if (data.session) conectar(); });
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (sesion) conectar(); else desconectar();
    });
    return () => {
      desmontado = true;
      suscripcion.subscription.unsubscribe();
      desconectar();
    };
  }, [clienteQuery, usuarioId]);

  return <span className="sr-only" data-testid="sincronizador-notificaciones" data-conectado={conectado ? 'true' : 'false'} aria-live="polite">{conectado ? 'Notificaciones sincronizadas' : 'Sincronización de notificaciones conectando'}</span>;
}

/** Campana accesible con badge y navegación sólo a rutas internas conocidas. */
export function CentroNotificacionesHeader({ usuarioId }: { usuarioId: string }) {
  const router = useRouter();
  const clienteQuery = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const consulta = useQuery({
    queryKey: [...CLAVE_NOTIFICACIONES, usuarioId],
    queryFn: async (): Promise<NotificacionUsuario[]> => {
      const respuesta = await obtenerNotificacionesAccion({ soloNoLeidas: false, limite: 30 });
      if (!respuesta.exito || !respuesta.datos) throw new Error(respuesta.exito ? 'Sin notificaciones' : respuesta.error);
      return respuesta.datos;
    },
    staleTime: 0,
  });

  const notificaciones = consulta.data ?? [];
  const noLeidas = notificaciones.reduce(
    (total, notificacion) => total + (notificacion.leida ? 0 : 1),
    0,
  );

  async function manejarNotificacion(notificacion: NotificacionUsuario): Promise<void> {
    if (!notificacion.leida) {
      const respuesta = await marcarNotificacionesLeidasAccion({ notificacionId: notificacion.id });
      if (respuesta.exito) {
        void clienteQuery.invalidateQueries({ queryKey: CLAVE_NOTIFICACIONES });
      }
    }
    const enlace = enlaceInternoSeguro(notificacion.enlace);
    setAbierto(false);
    if (enlace) router.push(enlace);
  }

  return (
    <div className="relative">
      <SincronizadorNotificaciones usuarioId={usuarioId} />
      <button
        type="button"
        aria-label={noLeidas > 0 ? `Notificaciones (${noLeidas} sin leer)` : 'Notificaciones'}
        aria-expanded={abierto}
        aria-controls="centro-notificaciones-panel"
        onClick={() => setAbierto((actual) => !actual)}
        className="relative rounded-base border border-foreground/20 p-2 transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario/40"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17H9m9-2V10a6 6 0 0 0-12 0v5l-2 2h16l-2-2Zm-5 5h-2" />
        </svg>
        {noLeidas > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-5 text-white">{noLeidas > 99 ? '99+' : noLeidas}</span>}
      </button>
      {abierto && (
        <div id="centro-notificaciones-panel" role="dialog" aria-label="Centro de notificaciones" className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-base border border-foreground/15 bg-background p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Notificaciones</h2>
            <span className="text-xs text-foreground/60">{noLeidas} sin leer</span>
          </div>
          {consulta.isError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">No se pudieron cargar las notificaciones.</p>}
          {!consulta.isError && notificaciones.length === 0 && <p className="py-4 text-sm text-foreground/60">No tienes notificaciones nuevas.</p>}
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto" aria-live="polite">
            {notificaciones.map((notificacion) => (
              <li key={notificacion.id}>
                <button type="button" onClick={() => void manejarNotificacion(notificacion)} className={`w-full rounded-base p-2 text-left transition-colors hover:bg-foreground/5 ${notificacion.leida ? 'opacity-70' : 'bg-primario/5'}`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold">{notificacion.titulo}</span>
                    {!notificacion.leida && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primario" aria-label="Sin leer" />}
                  </span>
                  <span className="mt-1 block line-clamp-2 text-xs text-foreground/75">{notificacion.mensaje}</span>
                  <time dateTime={notificacion.creadoEn} className="mt-1 block text-[11px] text-foreground/55">{fechaNotificacion(notificacion.creadoEn)}</time>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
