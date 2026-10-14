'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ETIQUETA_ESTACION_TARIFA,
  esEstacionTarifa,
  tarifaEfectivaDeGrupo,
} from '@/modulos/catalogos/utilidades/tarifa-estacion';
import { obtenerConfiguracionGeneral } from '@/modulos/configuracion/servicios/configuracion-servicio';

export type CatalogosPropuesta = {
  /** Obs. cliente 2026-10-12 (4b): el grupo de equipo/planeado del proceso se autocompleta en el ruteo. */
  procesos: {
    id: string;
    codigo: string;
    nombre: string;
    grupoEquipoId: string | null;
    grupoPlaneadoId: string | null;
    areaTrabajoCodigo: string | null;
  }[];
  /**
   * Tarifario único (obs. cliente 2026-10-13): la tarifa del grupo es la propia
   * o, si no tiene, la de la estación de Tarifas / TC vinculada. `sinTarifa`:
   * ninguna de las dos existe. `tarifaHora`/`tarifaMoneda` solo viajan con
   * permiso `propuesta_editar_costo`; para el resto van en null (nunca se expone
   * el monto). `origenTarifa` indica de dónde sale (para rotularla).
   */
  gruposEquipo: {
    id: string;
    codigo: string;
    nombre: string;
    sinTarifa: boolean;
    tarifaHora: number | null;
    tarifaMoneda: 'MXN' | 'USD' | null;
    origenTarifa: string | null;
  }[];
  gruposPlaneados: { id: string; codigo: string; nombre: string }[];
  /**
   * Máquinas activas para el ruteo (C3.3). `tarifaHora`/`tarifaMoneda` son el
   * override efectivo de la máquina y solo viajan con `propuesta_editar_costo`.
   */
  recursos: {
    id: string;
    nombre: string;
    grupoEquipoId: string | null;
    tarifaHora: number | null;
    tarifaMoneda: 'MXN' | 'USD' | null;
  }[];
  proximasAcciones: { codigo: string; nombre: string; esOtro: boolean }[];
  /**
   * DC-02: canales configurados (compartidos con RFQ). `esOtro` exige detalle;
   * `activo` permite ocultar retirados sin romper seguimientos históricos.
   */
  canales: { codigo: string; nombre: string; esOtro: boolean; activo: boolean }[];
  /** Áreas de trabajo activas: rotulan el proceso en el ruteo. */
  areasTrabajo: { codigo: string; nombre: string }[];
  /** C3.1: materiales activos para el alta de un ítem propio de la revisión. */
  materiales: { id: string; codigo: string; nombre: string }[];
  /** C3.1: espesores activos; `materialId` permite filtrarlos en el formulario. */
  espesores: { id: string; materialId: string; etiqueta: string; espesorMm: number }[];
  /** Error acotado al alta de ítems; no inutiliza ruteo/seguimiento existentes. */
  errorItems: string | null;
};

/**
 * Catálogos que alimentan el editor DRAFT: procesos, grupos, próxima acción y
 * (C3.1) materiales/espesores activos para el alta de ítems por revisión.
 */
export async function obtenerCatalogosPropuestaAccion(): Promise<
  RespuestaAccion<CatalogosPropuesta>
> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'propuesta_vista'))) {
    return { exito: false, error: 'Sin permiso para ver propuestas' };
  }
  // Las tarifas del ruteo solo viajan a quien puede ver el costo interno.
  const puedeVerCosto = await can(usuario, 'propuesta_editar_costo');

  const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
  const servidor = await crearClienteSupabaseServidor();

  // Los recursos y las áreas se leen con admin (no financiero): el ruteo no
  // depende de permisos de planeación/configuración del usuario.
  const { crearClienteSupabaseAdmin } = await import('@/nucleo/supabase/admin');
  const admin = crearClienteSupabaseAdmin();
  // Tarifas / TC: si no se puede leer, las estaciones usan los valores por defecto.
  const estaciones = await obtenerConfiguracionGeneral(admin)
    .then((configuracion) => configuracion.tarifas.estaciones)
    .catch(() => undefined);
  const [recursos, areasTrabajo] = await Promise.all([
    admin
      .from('recursos_planeacion')
      .select(
        'id, nombre, grupo_equipo_id, tarifa_override_activa, tarifa_override_hora, tarifa_override_moneda',
      )
      .eq('activo', true)
      .order('codigo'),
    admin
      .from('areas_trabajo_config')
      .select('codigo, nombre')
      .eq('activo', true)
      .order('nombre'),
  ]);

  const [procesos, gruposEquipo, gruposPlaneados, acciones, materiales, espesores, canales] =
    await Promise.all([
      servidor
        .from('catalogo_procesos')
        .select('id, codigo, nombre, grupo_equipo_id, grupo_planeado_id, area_trabajo_codigo')
        .eq('activo', true)
        .order('orden', { ascending: true }),
      servidor
        .from('grupos_equipo')
        .select('id, codigo, nombre, tarifa_hora, tarifa_moneda, estacion_tarifa')
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
      servidor
        .from('catalogo_materiales')
        .select('id, codigo, nombre')
        .eq('activo', true)
        .order('orden', { ascending: true }),
      servidor
        .from('catalogo_espesores')
        .select('id, material_id, etiqueta, espesor_mm')
        .eq('activo', true)
        .order('orden', { ascending: true }),
      admin
        .from('catalogo_canales')
        .select('codigo, nombre, es_otro, activo')
        .order('orden', { ascending: true }),
    ]);

  return {
    exito: true,
    datos: {
      procesos: (procesos.data ?? []).map((fila) => ({
        id: fila.id,
        codigo: fila.codigo,
        nombre: fila.nombre,
        grupoEquipoId: fila.grupo_equipo_id,
        grupoPlaneadoId: fila.grupo_planeado_id,
        areaTrabajoCodigo: fila.area_trabajo_codigo,
      })),
      gruposEquipo: (gruposEquipo.data ?? []).map((fila) => {
        const efectiva = tarifaEfectivaDeGrupo(
          {
            tarifaHora: fila.tarifa_hora === null ? null : Number(fila.tarifa_hora),
            tarifaMoneda: fila.tarifa_moneda === 'USD' ? 'USD' : 'MXN',
            estacionTarifa: esEstacionTarifa(fila.estacion_tarifa) ? fila.estacion_tarifa : null,
          },
          estaciones,
        );
        return {
          id: fila.id,
          codigo: fila.codigo,
          nombre: fila.nombre,
          sinTarifa: efectiva === null,
          tarifaHora: puedeVerCosto && efectiva !== null ? efectiva.tarifa : null,
          tarifaMoneda: puedeVerCosto && efectiva !== null ? efectiva.moneda : null,
          origenTarifa:
            efectiva === null
              ? null
              : efectiva.fuente === 'ESTACION' && efectiva.estacion !== null
                ? `Tarifas / TC · ${ETIQUETA_ESTACION_TARIFA[efectiva.estacion]}`
                : 'Tarifa del grupo',
        };
      }),
      gruposPlaneados: (gruposPlaneados.data ?? []).map((fila) => ({
        id: fila.id,
        codigo: fila.codigo,
        nombre: fila.nombre,
      })),
      recursos: (recursos.data ?? []).map((fila) => ({
        id: fila.id,
        nombre: fila.nombre,
        grupoEquipoId: fila.grupo_equipo_id,
        tarifaHora:
          puedeVerCosto
          && fila.tarifa_override_activa
          && fila.tarifa_override_hora !== null
            ? Number(fila.tarifa_override_hora)
            : null,
        tarifaMoneda:
          puedeVerCosto && fila.tarifa_override_activa
            ? fila.tarifa_override_moneda === 'USD'
              ? 'USD'
              : 'MXN'
            : null,
      })),
      areasTrabajo: (areasTrabajo.data ?? []).map((fila) => ({
        codigo: fila.codigo,
        nombre: fila.nombre,
      })),
      proximasAcciones: (acciones.data ?? []).map((fila) => ({
        codigo: fila.codigo,
        nombre: fila.nombre,
        esOtro: fila.es_otro,
      })),
      canales: (canales.data ?? []).map((fila) => ({
        codigo: fila.codigo,
        nombre: fila.nombre,
        esOtro: fila.es_otro,
        activo: fila.activo,
      })),
      materiales: (materiales.data ?? []).map((fila) => ({
        id: fila.id,
        codigo: fila.codigo,
        nombre: fila.nombre,
      })),
      espesores: (espesores.data ?? []).map((fila) => ({
        id: fila.id,
        materialId: fila.material_id,
        etiqueta: fila.etiqueta,
        espesorMm: Number(fila.espesor_mm),
      })),
      errorItems:
        materiales.error || espesores.error
          ? 'No se pudieron cargar los materiales y espesores para agregar el ítem.'
          : null,
    },
  };
}
