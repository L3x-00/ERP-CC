'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  guardarEspesorServicio,
  guardarMaterialServicio,
} from '@/modulos/catalogos/servicios/indice';
import { puedeGestionarInventario } from '@/modulos/inventario/servicios/permiso-inventario';
import {
  esquemaGuardarMaterialInventario,
  type GuardarMaterialInventarioInput,
} from '@/modulos/inventario/validaciones/materiales-catalogo';

export type ResultadoGuardarMaterial = { id: string; codigo: string; actualizadoEn: string };

/** Traduce los errores de base (triggers/constraints) a mensajes de la UI. */
function mensajeGuardado(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  if (texto.includes('material_padre_invalido')) return 'El grupo elegido no es válido';
  if (texto.includes('material_jerarquia_maxima')) {
    return 'Solo se permiten dos niveles: un grupo con subítems no puede agruparse';
  }
  if (texto.includes('material_con_hijos_no_agrupa')) {
    return 'Un grupo con materiales dentro no puede agruparse en otro';
  }
  if (texto.includes('duplicate key') || texto.includes('catalogo_materiales_codigo_key')) {
    return 'Ya existe un material con ese código';
  }
  if (texto.includes('catalogo_espesores')) {
    return 'No se pudo guardar uno de los espesores';
  }
  console.error('[MATERIALES] Error al guardar material:', texto);
  return 'No se pudo guardar el material';
}

/**
 * Obs. cliente 2026-10-13 (8): alta/edición de material del módulo «Materiales
 * y costos» con permiso `gestionar_inventario`. Usa las MISMAS tablas y
 * versionado del catálogo (`catalogo_materiales` / `catalogo_espesores`);
 * devuelve el token CAS del material para confirmar el costo inicial después.
 */
export async function guardarMaterialCatalogoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoGuardarMaterial>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaGuardarMaterialInventario.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await puedeGestionarInventario(usuario))) {
    return { exito: false, error: 'Sin permiso para gestionar materiales' };
  }

  const datos: GuardarMaterialInventarioInput = analisis.data;
  const admin = crearClienteSupabaseAdmin();
  try {
    const material = await guardarMaterialServicio(admin, {
      ...(datos.id ? { id: datos.id } : {}),
      codigo: datos.codigo,
      nombre: datos.nombre,
      activo: datos.activo,
      orden: datos.orden,
      unidadBase: datos.unidadBase,
      padreId: datos.padreId ?? null,
    });
    for (const espesor of datos.espesores) {
      await guardarEspesorServicio(admin, {
        ...(espesor.id ? { id: espesor.id } : {}),
        materialId: material.id,
        etiqueta: espesor.etiqueta,
        espesorMm: espesor.espesorMm,
        activo: espesor.activo,
        orden: espesor.orden,
      });
    }
    await registrarLog(
      usuario,
      datos.id ? 'actualizar_material_catalogo' : 'crear_material_catalogo',
      'inventario',
      material.id,
      {
        codigo: material.codigo,
        unidadBase: datos.unidadBase,
        padreId: datos.padreId ?? null,
        espesores: datos.espesores.length,
      },
      correlationId,
    );
    return {
      exito: true,
      datos: {
        id: material.id,
        codigo: material.codigo,
        actualizadoEn: material.actualizadoEn,
      },
    };
  } catch (error) {
    return { exito: false, error: mensajeGuardado(error) };
  }
}
