'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  prepararFacturaEntrega,
  type PreparacionFactura,
} from '@/modulos/facturacion/servicios/obtener-facturas';
import { esquemaFacturaEntrega } from '@/modulos/facturacion/validaciones/esquemas-facturacion';

/** SII-B8 F2: contexto de la entrega para precargar/editar su factura. */
export async function prepararFacturaEntregaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<PreparacionFactura>> {
  const analisis = esquemaFacturaEntrega.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

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
    const preparacion = await prepararFacturaEntrega(servidor, analisis.data.entregaId);
    if (!preparacion) {
      return { exito: false, error: 'La entrega no existe o no es visible' };
    }
    return { exito: true, datos: preparacion };
  } catch {
    return { exito: false, error: 'No se pudo cargar la entrega' };
  }
}
