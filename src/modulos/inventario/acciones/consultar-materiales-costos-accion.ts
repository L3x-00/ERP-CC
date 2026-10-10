'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorCostoMaterial,
  listarHistorialCostos,
  listarMaterialesCostos,
  listarPropuestasCostoPendientes,
  mensajeErrorCosto,
} from '@/modulos/inventario/servicios/materiales-costos-servicio';
import {
  puedeGestionarInventario,
  puedeVerMaterialesCostos,
} from '@/modulos/inventario/servicios/permiso-inventario';
import type {
  MaterialesCostosVista,
  PropuestaCostoMaterial,
  VersionCostoMaterial,
} from '@/modulos/inventario/tipos/materiales-costos';

const esquemaHistorialCostos = z.object({ materialId: z.uuid().optional() }).strict();

function mensajeDeError(error: unknown): string {
  return mensajeErrorCosto(
    error instanceof ErrorCostoMaterial ? error.codigo : 'desconocido',
  );
}

/**
 * Server Action: catálogo canónico de materiales con su costo vigente (C6.1).
 * Lectura permitida a `gestionar_inventario` o `ver_finanzas`; la acción además
 * informa si el actor puede proponer/confirmar.
 */
export async function listarMaterialesCostosAccion(): Promise<
  RespuestaAccion<MaterialesCostosVista>
> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await puedeVerMaterialesCostos(usuario))) {
    return { exito: false, error: 'Sin permiso para ver materiales y costos' };
  }

  try {
    const materiales = await listarMaterialesCostos(crearClienteSupabaseAdmin());
    return {
      exito: true,
      datos: { materiales, puedeGestionar: await puedeGestionarInventario(usuario) },
    };
  } catch (error) {
    console.error('[MATERIALES] Error al consultar el catálogo:', error);
    return { exito: false, error: mensajeDeError(error) };
  }
}

/** Server Action: propuestas de costo pendientes de confirmación (C6.1). */
export async function listarPropuestasCostoPendientesAccion(): Promise<
  RespuestaAccion<PropuestaCostoMaterial[]>
> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await puedeVerMaterialesCostos(usuario))) {
    return { exito: false, error: 'Sin permiso para ver materiales y costos' };
  }

  try {
    const propuestas = await listarPropuestasCostoPendientes(crearClienteSupabaseAdmin());
    return { exito: true, datos: propuestas };
  } catch (error) {
    console.error('[MATERIALES] Error al consultar propuestas:', error);
    return { exito: false, error: mensajeDeError(error) };
  }
}

/** Server Action: historial de costos confirmados, opcionalmente por material. */
export async function listarHistorialCostosAccion(
  entrada: unknown,
): Promise<RespuestaAccion<VersionCostoMaterial[]>> {
  const analisis = esquemaHistorialCostos.safeParse(entrada ?? {});
  if (!analisis.success) {
    return { exito: false, error: 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await puedeVerMaterialesCostos(usuario))) {
    return { exito: false, error: 'Sin permiso para ver materiales y costos' };
  }

  try {
    const versiones = await listarHistorialCostos(crearClienteSupabaseAdmin(), {
      ...(analisis.data.materialId ? { materialId: analisis.data.materialId } : {}),
    });
    return { exito: true, datos: versiones };
  } catch (error) {
    console.error('[MATERIALES] Error al consultar el historial:', error);
    return { exito: false, error: mensajeDeError(error) };
  }
}
