import { create } from 'zustand';
import type { Usuario } from '@/modulos/autenticacion/tipos/indice';

interface TiendaUsuario {
  usuario: Usuario | null;
  permisos: string[];
  cargando: boolean;
  establecerUsuario: (usuario: Usuario | null, permisos?: string[]) => void;
  limpiarUsuario: () => void;
}

/** Tienda global: usuario autenticado actual y sus permisos. */
export const usarTiendaUsuario = create<TiendaUsuario>((set) => ({
  usuario: null,
  permisos: [],
  cargando: true,
  establecerUsuario: (usuario, permisos = []) =>
    set({ usuario, permisos, cargando: false }),
  limpiarUsuario: () => set({ usuario: null, permisos: [], cargando: false }),
}));
