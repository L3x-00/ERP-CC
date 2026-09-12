import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/compartido/tipos/supabase';
import type { CrearNotaEntregaInput } from '@/modulos/produccion/validaciones/indice';
import { ErrorProduccion } from '@/modulos/produccion/servicios/sesiones-servicio';

export interface NotaEntregaGenerada {
  id: string;
  folio: string;
  esParcial: boolean;
  creadoEn: string;
}

function aJsonPartidas(partidas: CrearNotaEntregaInput['partidas']): Json {
  return partidas.map((partida) => ({
    partida_id: partida.partidaId,
    cantidad_entregada: partida.cantidadEntregada,
  }));
}

const CODIGOS_ENTREGA: readonly CodigoErrorProduccionEntrega[] = [
  'cantidad_entrega_excede_producida',
  'orden_no_entregable',
  'partida_no_corresponde_orden',
];

type CodigoErrorProduccionEntrega =
  | 'cantidad_entrega_excede_producida'
  | 'orden_no_entregable'
  | 'partida_no_corresponde_orden';

function lanzarErrorEntrega(mensaje: string | undefined): never {
  const codigo = CODIGOS_ENTREGA.find((candidato) => mensaje?.includes(candidato));
  throw new ErrorProduccion(codigo ?? 'desconocido', mensaje);
}

/** Emite la nota con el folio y las cantidades resueltas dentro de una sola RPC. */
export async function generarNotaEntregaServicio(
  admin: SupabaseClient<Database>,
  entrada: CrearNotaEntregaInput & { creadoPor: string },
): Promise<NotaEntregaGenerada> {
  const { data, error } = await admin.rpc('generar_nota_entrega', {
    p_orden_id: entrada.ordenId,
    p_recibido_por: entrada.recibidoPor,
    p_firma_cliente_url: entrada.firmaClienteUrl ?? '',
    p_creado_por: entrada.creadoPor,
    p_partidas: aJsonPartidas(entrada.partidas),
  });
  if (error) lanzarErrorEntrega(error.message);
  const fila = data?.[0];
  if (!fila?.id || !fila.folio) throw new ErrorProduccion('desconocido');

  return {
    id: fila.id,
    folio: fila.folio,
    esParcial: fila.es_parcial,
    creadoEn: fila.creado_en,
  };
}

export function mensajeErrorEntrega(error: unknown): string {
  if (error instanceof ErrorProduccion) {
    if (error.codigo === 'cantidad_entrega_excede_producida') {
      return 'La entrega no puede superar las piezas producidas pendientes';
    }
    if (error.codigo === 'orden_no_entregable') {
      return 'La orden no está lista para entregarse';
    }
    if (error.codigo === 'partida_no_corresponde_orden') {
      return 'Una partida no pertenece a la orden';
    }
  }
  return 'No se pudo generar la nota de entrega';
}
