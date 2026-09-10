import { create } from 'zustand';
import type { NotificacionUsuario } from '@/modulos/comentarios/tipos/indice';

interface TiendaNotificaciones {
  usuarioId: string | null;
  notificaciones: readonly NotificacionUsuario[];
  noLeidas: number;
  abierto: boolean;
  cargando: boolean;
  error: string | null;
  revision: number;
  establecerNotificaciones: (usuarioId: string, notificaciones: readonly NotificacionUsuario[]) => void;
  marcarComoLeidaLocal: (notificacionId: string) => void;
  alternarAbierto: () => void;
  cerrar: () => void;
  establecerCargando: (cargando: boolean) => void;
  establecerError: (error: string | null) => void;
  notificarActualizacion: () => void;
  limpiar: () => void;
}

function contarNoLeidas(notificaciones: readonly NotificacionUsuario[]): number {
  return notificaciones.reduce((total, notificacion) => total + (notificacion.leida ? 0 : 1), 0);
}

/** Estado efímero del centro de notificaciones; no se persisten mensajes ni permisos. */
export const usarTiendaNotificaciones = create<TiendaNotificaciones>((set) => ({
  usuarioId: null,
  notificaciones: [],
  noLeidas: 0,
  abierto: false,
  cargando: false,
  error: null,
  revision: 0,
  establecerNotificaciones: (usuarioId, notificaciones) => set({
    usuarioId,
    notificaciones: [...notificaciones],
    noLeidas: contarNoLeidas(notificaciones),
    error: null,
  }),
  marcarComoLeidaLocal: (notificacionId) => set((estado) => {
    const notificaciones = estado.notificaciones.map((notificacion) => (
      notificacion.id === notificacionId ? { ...notificacion, leida: true } : notificacion
    ));
    return { notificaciones, noLeidas: contarNoLeidas(notificaciones) };
  }),
  alternarAbierto: () => set((estado) => ({ abierto: !estado.abierto })),
  cerrar: () => set({ abierto: false }),
  establecerCargando: (cargando) => set({ cargando }),
  establecerError: (error) => set({ error }),
  notificarActualizacion: () => set((estado) => ({ revision: estado.revision + 1 })),
  limpiar: () => set({ usuarioId: null, notificaciones: [], noLeidas: 0, abierto: false, cargando: false, error: null }),
}));

export type { TiendaNotificaciones };
