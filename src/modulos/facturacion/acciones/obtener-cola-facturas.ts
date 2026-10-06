'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerColaFacturas,
  type ColaFacturas,
} from '@/modulos/facturacion/servicios/obtener-facturas';

/** SII-B8 F2: cola de facturación (facturas + entregas facturables). */
export async function obtenerColaFacturasAccion(): Promise<RespuestaAccion<ColaFacturas>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const [puedeFacturar, puedeVerFinanzas] = await Promise.all([
    can(usuario, 'registrar_pagos'),
    can(usuario, 'ver_finanzas'),
  ]);
  if (!puedeFacturar && !puedeVerFinanzas) {
    return { exito: false, error: 'Sin permiso para ver facturación' };
  }

  try {
    const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
    const servidor = await crearClienteSupabaseServidor();
    const cola = await obtenerColaFacturas(servidor);
    return { exito: true, datos: cola };
  } catch {
    return { exito: false, error: 'No se pudieron cargar las facturas' };
  }
}
