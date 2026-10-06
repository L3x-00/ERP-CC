'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerColaCompras,
  type ColaCompras,
} from '@/modulos/compras/servicios/obtener-compras';

/** SII-B8 F4: cola de compras + catálogos del alta. */
export async function obtenerColaComprasAccion(): Promise<RespuestaAccion<ColaCompras>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const [puedeGestionar, puedeVerFinanzas] = await Promise.all([
    can(usuario, 'registrar_gastos'),
    can(usuario, 'ver_finanzas'),
  ]);
  if (!puedeGestionar && !puedeVerFinanzas) {
    return { exito: false, error: 'Sin permiso para ver compras' };
  }

  try {
    const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
    const servidor = await crearClienteSupabaseServidor();
    const cola = await obtenerColaCompras(servidor);
    return { exito: true, datos: cola };
  } catch {
    return { exito: false, error: 'No se pudieron cargar las compras' };
  }
}
