import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import {
  ErrorProduccion,
  lanzarErrorProduccion,
} from '@/modulos/produccion/servicios/sesiones-servicio';

type Admin = SupabaseClient<Database>;

/** C31/A6: acción concreta sugerida por cada código de diagnóstico. */
export type AccionDiagnostico =
  | 'cerrar_pausa'
  | 'reabrir_operacion'
  | 'registrar_consumo'
  | 'generar_nota_entrega'
  | 'revisar_planeacion'
  | 'ver_detalle';

export type PermisoDiagnostico =
  | 'gestionar_produccion'
  | 'gestionar_planeacion'
  | 'operador';

/** C23/C31-A6: una inconsistencia accionable de una orden de producción. */
export interface DiagnosticoOrdenItem {
  codigo: string;
  severidad: 'alta' | 'media' | 'baja';
  partidaId: string | null;
  sesionId: string | null;
  programacionId: string | null;
  detalle: string;
  valorActual: number | null;
  valorEsperado: number | null;
  accionSugerida: AccionDiagnostico;
  textoAccion: string;
  destino: string;
  permisoRequerido: PermisoDiagnostico;
}

interface GuiaDiagnostico {
  accionSugerida: AccionDiagnostico;
  textoAccion: string;
  permisoRequerido: PermisoDiagnostico;
}

/** Fuente única de las 11 guías; la UI no inventa texto ni botones. */
export const GUIAS_DIAGNOSTICO: Readonly<Record<string, GuiaDiagnostico>> = {
  tiempo_real_desincronizado: {
    accionSugerida: 'revisar_planeacion', textoAccion: 'Revisar las horas en Planeación',
    permisoRequerido: 'gestionar_produccion',
  },
  produccion_excede_solicitada: {
    accionSugerida: 'revisar_planeacion', textoAccion: 'Revisar el exceso en Planeación',
    permisoRequerido: 'gestionar_produccion',
  },
  meta_excede_piezas: {
    accionSugerida: 'revisar_planeacion', textoAccion: 'Revisar el avance de la operación',
    permisoRequerido: 'gestionar_produccion',
  },
  cantidad_producida_inconsistente: {
    accionSugerida: 'revisar_planeacion', textoAccion: 'Conciliar las piezas producidas',
    permisoRequerido: 'gestionar_produccion',
  },
  produccion_sin_programacion: {
    accionSugerida: 'revisar_planeacion', textoAccion: 'Registrar la operación programada que falta',
    permisoRequerido: 'gestionar_produccion',
  },
  pausa_huerfana: {
    accionSugerida: 'cerrar_pausa', textoAccion: 'Cerrar pausa pendiente',
    permisoRequerido: 'gestionar_produccion',
  },
  sesion_vacia: {
    accionSugerida: 'revisar_planeacion', textoAccion: 'Descartar la sesión vacía desde la ficha',
    permisoRequerido: 'gestionar_produccion',
  },
  sesion_activa_programacion_inoperable: {
    accionSugerida: 'ver_detalle', textoAccion: 'Ver la sesión activa en la ficha',
    permisoRequerido: 'gestionar_produccion',
  },
  programacion_bloqueada_sin_sesion: {
    accionSugerida: 'reabrir_operacion', textoAccion: 'Reabrir la operación en el panel de piso',
    permisoRequerido: 'gestionar_planeacion',
  },
  consumo_material_pendiente: {
    accionSugerida: 'registrar_consumo', textoAccion: 'Registrar el consumo pendiente',
    permisoRequerido: 'operador',
  },
  orden_completada_sin_entrega: {
    accionSugerida: 'generar_nota_entrega', textoAccion: 'Generar la nota de entrega',
    permisoRequerido: 'gestionar_produccion',
  },
};

function guia(codigo: string): GuiaDiagnostico {
  return GUIAS_DIAGNOSTICO[codigo] ?? {
    accionSugerida: 'revisar_planeacion',
    textoAccion: 'Revisar el registro en la ficha de la orden',
    permisoRequerido: 'gestionar_produccion',
  };
}

function severidadDesdeBase(valor: string): DiagnosticoOrdenItem['severidad'] {
  if (valor === 'alta' || valor === 'media' || valor === 'baja') return valor;
  return 'media';
}

/**
 * C23: lectura de consistencia de una orden. No modifica datos; el
 * administrador decide qué corregir a partir de las filas devueltas.
 */
export async function obtenerDiagnosticoOrdenServicio(
  admin: Admin,
  ordenId: string,
): Promise<DiagnosticoOrdenItem[]> {
  const { data, error } = await admin.rpc('diagnostico_consistencia_orden', {
    p_orden_id: ordenId,
  });
  if (error) lanzarErrorProduccion(error.message);
  return (data ?? []).map((fila) => {
    const guiaCodigo = guia(fila.codigo);
    const destino = fila.codigo === 'programacion_bloqueada_sin_sesion'
      ? '/produccion-piso'
      : fila.codigo === 'consumo_material_pendiente'
        ? '/produccion-piso'
        : `/produccion?ordenId=${ordenId}`;
    return {
      codigo: fila.codigo,
      severidad: severidadDesdeBase(fila.severidad),
      partidaId: fila.partida_id,
      sesionId: fila.sesion_id,
      programacionId: fila.programacion_id,
      // El RPC cuenta partidas, no piezas: se corrige el texto sin tocar la firma.
      detalle: fila.codigo === 'orden_completada_sin_entrega'
        ? String(fila.detalle ?? '').replace('piezas pendientes de entrega', 'partidas pendientes de entrega')
        : fila.detalle,
      valorActual: fila.valor_actual === null ? null : Number(fila.valor_actual),
      valorEsperado: fila.valor_esperado === null ? null : Number(fila.valor_esperado),
      ...guiaCodigo,
      destino,
    };
  });
}

export interface PausaHuerfanaCerrada {
  id: string;
  estadoSesion: string;
  horasNetas: number;
  estadoPlaneacion: string;
  tiempoRealMinutos: number;
  actualizadoEn: string;
}

/**
 * C23: cierra una pausa atrapada en una orden ya terminada. El administrador
 * decide si conserva el tiempo (y puede declarar horas reales) o lo descarta;
 * la RPC no modifica piezas y deja evento de auditoría.
 */
export async function cerrarPausaHuerfanaServicio(
  admin: Admin,
  entrada: {
    sesionId: string;
    actorId: string;
    conservarTiempo: boolean;
    horasReales?: number | null;
    motivo?: string | null;
    correlationId?: string | null;
  },
): Promise<PausaHuerfanaCerrada> {
  const { data, error } = await admin.rpc('cerrar_pausa_huerfana_administrativa', {
    p_sesion_id: entrada.sesionId,
    p_actor_id: entrada.actorId,
    p_conservar_tiempo: entrada.conservarTiempo,
    p_horas_reales: entrada.horasReales ?? undefined,
    p_motivo: entrada.motivo ?? undefined,
    p_correlation_id: entrada.correlationId ?? undefined,
  });
  if (error) lanzarErrorProduccion(error.message);

  const fila = data?.[0];
  if (!fila?.id || !fila.actualizado_en) throw new ErrorProduccion('desconocido');

  return {
    id: fila.id,
    estadoSesion: fila.estado_sesion,
    horasNetas: Number(fila.horas_netas),
    estadoPlaneacion: fila.estado_planeacion,
    tiempoRealMinutos: Number(fila.tiempo_real_minutos),
    actualizadoEn: fila.actualizado_en,
  };
}
