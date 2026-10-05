import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaACliente,
  type Cliente,
  type DocumentoCliente,
  type TipoDocumentoCliente,
} from '@/modulos/clientes/tipos/indice';
import { calcularConsumoUltimos3Meses } from '@/modulos/clientes/servicios/calcular-consumo';
import { obtenerCreditoUsado } from '@/modulos/clientes/servicios/credito-usado';

const TIPOS_DOCUMENTO: readonly string[] = [
  'csf',
  'contrato',
  'identificacion',
  'comprobante_domicilio',
  'otro',
];

function normalizarTipoDocumento(valor: string | null): TipoDocumentoCliente {
  return TIPOS_DOCUMENTO.includes(valor ?? '') ? (valor as TipoDocumentoCliente) : 'otro';
}

/** Cliente con documentos y resumen financiero calculado (ficha 360°). */
export type ClienteConDocumentos = {
  cliente: Cliente;
  documentos: DocumentoCliente[];
  /** Consumo MXN de los últimos 3 meses (AR no cancelada); 0 si RLS lo oculta. */
  consumoUltimos3Meses: number;
  /** Suma de saldos AR pendientes/parciales en MXN; 0 si RLS lo oculta. */
  creditoUsado: number;
};

/**
 * Carga un cliente por id junto con sus documentos. El alcance lo impone RLS.
 *
 * @param cliente Cliente Supabase (servidor o navegador).
 * @param id Identificador del cliente.
 * @returns El cliente con sus documentos, o `null` si no existe/no es visible.
 * @throws Error si la consulta del cliente falla por un motivo distinto a "no existe".
 */
export async function obtenerClientePorId(
  cliente: SupabaseClient<Database>,
  id: string,
): Promise<ClienteConDocumentos | null> {
  const { data: fila, error } = await cliente
    .from('clientes')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('No se pudo cargar el cliente');
  }
  if (!fila) {
    return null;
  }

  // Modelo único de archivos (SII-B1.9): solo la versión vigente de cada documento.
  const { data: docs } = await cliente
    .from('archivos')
    .select('id, entidad_id, tema_codigo, nombre_original, ruta_storage, subido_por, creado_en')
    .eq('entidad', 'cliente')
    .eq('entidad_id', id)
    .eq('vigente', true)
    .order('creado_en', { ascending: false });

  const [consumoUltimos3Meses, creditoUsado] = await Promise.all([
    calcularConsumoUltimos3Meses(cliente, id),
    obtenerCreditoUsado(cliente, id),
  ]);

  return {
    cliente: filaACliente(fila),
    documentos: (docs ?? []).map((doc) => ({
      id: doc.id,
      clienteId: doc.entidad_id,
      tipo: normalizarTipoDocumento(doc.tema_codigo),
      nombreArchivo: doc.nombre_original,
      rutaStorage: doc.ruta_storage,
      subidoPor: doc.subido_por,
      creadoEn: doc.creado_en,
    })),
    consumoUltimos3Meses,
    creditoUsado,
  };
}
