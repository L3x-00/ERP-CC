import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/compartido/tipos/supabase';
import type { GuardarCotizacionInput } from '@/modulos/pipeline/validaciones/esquemas-cotizacion';

/** Códigos de negocio estables que devuelve `guardar_cotizacion_atomica`. */
export type CodigoErrorCotizacion =
  | 'cotizacion_sin_identidad'
  | 'cotizacion_lineas_invalidas'
  | 'oportunidad_inexistente'
  | 'usuario_sin_acceso_oportunidad'
  | 'cotizacion_no_editable'
  | 'cotizacion_conflicto'
  | 'cotizacion_con_orden'
  | 'desconocido';

/** Error de negocio de cotización; el detalle crudo de Postgres no sale de aquí. */
export class ErrorCotizacion extends Error {
  constructor(
    public readonly codigo: CodigoErrorCotizacion,
    mensaje?: string,
  ) {
    super(mensaje ?? codigo);
    this.name = 'ErrorCotizacion';
  }
}

/** Resultado del guardado: líneas persistidas y nuevo token de concurrencia. */
export type CotizacionGuardada = {
  pipelineId: string;
  lineasGuardadas: number;
  actualizadoEn: string;
};

const CODIGOS: readonly CodigoErrorCotizacion[] = [
  'cotizacion_sin_identidad',
  'cotizacion_lineas_invalidas',
  'oportunidad_inexistente',
  'usuario_sin_acceso_oportunidad',
  'cotizacion_no_editable',
  'cotizacion_conflicto',
  'cotizacion_con_orden',
];

function codigoDesdeMensaje(mensaje: string): CodigoErrorCotizacion {
  return CODIGOS.find((codigo) => mensaje.includes(codigo)) ?? 'desconocido';
}

const MENSAJES: Record<CodigoErrorCotizacion, string> = {
  cotizacion_sin_identidad: 'No autorizado',
  cotizacion_lineas_invalidas: 'Revisa las líneas de la cotización',
  oportunidad_inexistente: 'No encontrada',
  usuario_sin_acceso_oportunidad: 'Sin permiso para editar esta cotización',
  cotizacion_no_editable: 'La oportunidad ya está cerrada: su cotización es solo lectura',
  cotizacion_conflicto:
    'La oportunidad cambió mientras editabas. Vuelve a abrirla para no perder el trabajo de otra persona',
  cotizacion_con_orden: 'La cotización ya generó una orden de producción y no se puede modificar',
  desconocido: 'No se pudo guardar la cotización',
};

/** Traduce un error de guardado a un mensaje de usuario sin filtrar detalle interno. */
export function mensajeErrorCotizacion(error: unknown): string {
  if (error instanceof ErrorCotizacion) {
    return MENSAJES[error.codigo];
  }
  return MENSAJES.desconocido;
}

/** Convierte las líneas validadas al JSON snake_case que espera la RPC. */
function lineasAJson(lineas: GuardarCotizacionInput['lineas']): Json {
  return lineas.map((linea) => ({
    descripcion: linea.descripcion,
    cantidad: linea.cantidad,
    precio_unitario: linea.precioUnitario,
    material: linea.material ?? null,
    espesor: linea.espesor ?? null,
    area: linea.area ?? null,
    procesos: linea.procesos,
    ...(linea.calculoTecnico ? { calculo_tecnico: JSON.parse(JSON.stringify(linea.calculoTecnico)) as Json } : {}),
  }));
}

/**
 * Reemplaza las líneas de una cotización en una sola transacción de Postgres.
 *
 * Se llama con el cliente del USUARIO (no service role): la RPC resuelve la
 * identidad con `auth.uid()` y verifica ownership/permiso y etapa editable por
 * dentro. Un fallo no deja la cotización a medias: el borrado y la inserción
 * viven en la misma transacción.
 */
export async function guardarCotizacionServicio(
  cliente: SupabaseClient<Database>,
  entrada: GuardarCotizacionInput,
): Promise<CotizacionGuardada> {
  const { data, error } = await cliente.rpc('guardar_cotizacion_atomica', {
    p_pipeline_id: entrada.pipelineId,
    p_lineas: lineasAJson(entrada.lineas),
    ...(entrada.actualizadoEnEsperado
      ? { p_actualizado_en_esperado: entrada.actualizadoEnEsperado }
      : {}),
  });

  if (error) {
    throw new ErrorCotizacion(codigoDesdeMensaje(error.message), error.message);
  }

  const fila = data?.[0];
  if (!fila?.pipeline_id) {
    throw new ErrorCotizacion('desconocido');
  }

  return {
    pipelineId: fila.pipeline_id,
    lineasGuardadas: fila.lineas_guardadas,
    actualizadoEn: fila.actualizado_en,
  };
}
