'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import type { MonedaTarifa } from '@/modulos/catalogos/tipos/indice';
import {
  esquemaCrearEquipo,
  monedaTarifaCatalogo,
  tarifaHoraCatalogo,
} from '@/modulos/catalogos/validaciones/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Recurso con su tarifa propia opcional (C3.2/DC-07). */
export type TarifaRecurso = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  grupoEquipoId: string | null;
  overrideActivo: boolean;
  tarifaHora: number | null;
  moneda: MonedaTarifa | null;
};

const esquemaGuardarTarifaRecurso = z
  .discriminatedUnion('overrideActivo', [
    z.object({ recursoId: z.uuid(), overrideActivo: z.literal(false) }).strict(),
    z
      .object({
        recursoId: z.uuid(),
        overrideActivo: z.literal(true),
        tarifaHora: tarifaHoraCatalogo,
        moneda: monedaTarifaCatalogo,
      })
      .strict(),
  ]);

const esquemaAlternarEquipoActivo = z
  .object({ recursoId: z.uuid(), activo: z.boolean() })
  .strict();

/** Recursos con su override de tarifa; lectura con permiso de catálogos. */
export async function listarTarifasRecursosAccion(): Promise<RespuestaAccion<TarifaRecurso[]>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_ver'))) {
    return { exito: false, error: 'Sin permiso para ver catálogos' };
  }

  const { data, error } = await crearClienteSupabaseAdmin()
    .from('recursos_planeacion')
    .select('id, codigo, nombre, activo, grupo_equipo_id, tarifa_override_activa, tarifa_override_hora, tarifa_override_moneda')
    .order('codigo');
  if (error) {
    console.error('[CATALOGOS] Error al listar tarifas de recursos:', error.message);
    return { exito: false, error: 'No se pudieron cargar las tarifas por máquina' };
  }
  return {
    exito: true,
    datos: (data ?? []).map((fila) => ({
      id: fila.id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      activo: fila.activo,
      grupoEquipoId: fila.grupo_equipo_id,
      overrideActivo: fila.tarifa_override_activa,
      tarifaHora: fila.tarifa_override_hora === null ? null : Number(fila.tarifa_override_hora),
      moneda: fila.tarifa_override_moneda === 'USD' ? 'USD' : fila.tarifa_override_moneda === 'MXN' ? 'MXN' : null,
    })),
  };
}

/**
 * Activa o retira la tarifa propia de una máquina. Retirarla vuelve a usar la
 * del Grupo de Equipo; una tarifa propia en cero es válida y explícita.
 */
export async function guardarTarifaRecursoAccion(entrada: unknown): Promise<RespuestaAccion<null>> {
  const analisis = esquemaGuardarTarifaRecurso.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_editar'))) {
    return { exito: false, error: 'Sin permiso para editar catálogos' };
  }

  const datos = analisis.data;
  const cambios = datos.overrideActivo
    ? { tarifa_override_activa: true, tarifa_override_hora: datos.tarifaHora, tarifa_override_moneda: datos.moneda }
    : { tarifa_override_activa: false, tarifa_override_hora: null, tarifa_override_moneda: null };

  const { data, error } = await crearClienteSupabaseAdmin()
    .from('recursos_planeacion')
    .update(cambios)
    .eq('id', datos.recursoId)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[CATALOGOS] Error al guardar tarifa de recurso:', error.message);
    return { exito: false, error: 'No se pudo guardar la tarifa de la máquina' };
  }
  if (!data) return { exito: false, error: 'El recurso no existe' };

  await registrarLog(usuario, 'guardar_tarifa_recurso', 'catalogos', datos.recursoId, cambios, nuevoCorrelationId());
  return { exito: true, datos: null };
}

export type EquipoCreado = { id: string; codigo: string; nombre: string };

/**
 * Aclaración cliente 2026-11-06: alta guiada de un equipo. Crea el recurso con
 * su grupo y, si se marcó la excepción, su tarifa propia. El equipo queda
 * disponible de inmediato en Planeación.
 */
export async function crearEquipoAccion(entrada: unknown): Promise<RespuestaAccion<EquipoCreado>> {
  const analisis = esquemaCrearEquipo.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_editar'))) {
    return { exito: false, error: 'Sin permiso para editar catálogos' };
  }

  const datos = analisis.data;
  const { data, error } = await crearClienteSupabaseAdmin()
    .from('recursos_planeacion')
    .insert({
      codigo: datos.codigo,
      nombre: datos.nombre,
      area: datos.area,
      activo: datos.activo,
      grupo_equipo_id: datos.grupoEquipoId,
      costo_hora_interno: 0,
      tarifa_override_activa: datos.tarifaPropiaActiva,
      tarifa_override_hora: datos.tarifaPropiaActiva ? datos.tarifaHora : null,
      tarifa_override_moneda: datos.tarifaPropiaActiva ? datos.tarifaMoneda : null,
    })
    .select('id, codigo, nombre')
    .single();

  if (error) {
    console.error('[CATALOGOS] Error al crear equipo:', error.message);
    if (error.code === '23505') {
      return { exito: false, error: 'Ya existe un equipo con ese código' };
    }
    if (error.code === '23503') {
      return { exito: false, error: 'El grupo de equipo ya no existe' };
    }
    return { exito: false, error: 'No se pudo crear el equipo' };
  }

  await registrarLog(
    usuario,
    'crear_equipo',
    'catalogos',
    data.id,
    {
      codigo: datos.codigo,
      grupoEquipoId: datos.grupoEquipoId,
      tarifaPropiaActiva: datos.tarifaPropiaActiva,
    },
    nuevoCorrelationId(),
  );
  return { exito: true, datos: data };
}

/**
 * Aclaración cliente 2026-11-06: un equipo se desactiva, no se borra. El
 * historial de producción y de costos permanece intacto.
 */
export async function alternarEquipoActivoAccion(entrada: unknown): Promise<RespuestaAccion<null>> {
  const analisis = esquemaAlternarEquipoActivo.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'catalogo_editar'))) {
    return { exito: false, error: 'Sin permiso para editar catálogos' };
  }

  const datos = analisis.data;
  const { data, error } = await crearClienteSupabaseAdmin()
    .from('recursos_planeacion')
    .update({ activo: datos.activo })
    .eq('id', datos.recursoId)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[CATALOGOS] Error al cambiar estado del equipo:', error.message);
    return { exito: false, error: 'No se pudo cambiar el estado del equipo' };
  }
  if (!data) return { exito: false, error: 'El equipo no existe' };

  await registrarLog(
    usuario,
    datos.activo ? 'activar_equipo' : 'desactivar_equipo',
    'catalogos',
    datos.recursoId,
    { activo: datos.activo },
    nuevoCorrelationId(),
  );
  return { exito: true, datos: null };
}
