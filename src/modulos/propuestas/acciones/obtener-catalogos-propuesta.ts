'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

export type CatalogosPropuesta = {
  procesos: { id: string; codigo: string; nombre: string }[];
  gruposEquipo: { id: string; codigo: string; nombre: string }[];
  gruposPlaneados: { id: string; codigo: string; nombre: string }[];
  proximasAcciones: { codigo: string; nombre: string; esOtro: boolean }[];
};

/** Catálogos que alimentan el editor DRAFT (procesos, grupos y próxima acción). */
export async function obtenerCatalogosPropuestaAccion(): Promise<
  RespuestaAccion<CatalogosPropuesta>
> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'propuesta_vista'))) {
    return { exito: false, error: 'Sin permiso para ver propuestas' };
  }

  const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
  const servidor = await crearClienteSupabaseServidor();

  const [procesos, gruposEquipo, gruposPlaneados, acciones] = await Promise.all([
    servidor
      .from('catalogo_procesos')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .order('orden', { ascending: true }),
    servidor
      .from('grupos_equipo')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .order('orden', { ascending: true }),
    servidor
      .from('grupos_planeados')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .order('orden', { ascending: true }),
    servidor
      .from('catalogo_proximas_acciones')
      .select('codigo, nombre, es_otro')
      .eq('activo', true)
      .order('orden', { ascending: true }),
  ]);

  return {
    exito: true,
    datos: {
      procesos: (procesos.data ?? []).map((fila) => ({
        id: fila.id,
        codigo: fila.codigo,
        nombre: fila.nombre,
      })),
      gruposEquipo: (gruposEquipo.data ?? []).map((fila) => ({
        id: fila.id,
        codigo: fila.codigo,
        nombre: fila.nombre,
      })),
      gruposPlaneados: (gruposPlaneados.data ?? []).map((fila) => ({
        id: fila.id,
        codigo: fila.codigo,
        nombre: fila.nombre,
      })),
      proximasAcciones: (acciones.data ?? []).map((fila) => ({
        codigo: fila.codigo,
        nombre: fila.nombre,
        esOtro: fila.es_otro,
      })),
    },
  };
}
