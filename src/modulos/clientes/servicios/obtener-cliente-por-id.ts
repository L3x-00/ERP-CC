import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaACliente,
  filaADocumentoCliente,
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
  /** Versiones vigentes (una por documento). */
  documentos: DocumentoCliente[];
  /** Todas las versiones, para el historial de reemplazos (SII-B2.6). */
  versionesDocumentos: DocumentoCliente[];
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

  // Modelo único de archivos (SII-B1.9): todas las versiones, y la pestaña
  // Documentos muestra la vigente + el historial de reemplazos (SII-B2.6).
  const { data: archivos } = await cliente
    .from('archivos')
    .select('*')
    .eq('entidad', 'cliente')
    .eq('entidad_id', id)
    .order('creado_en', { ascending: false });

  const versionesDocumentos = (archivos ?? []).map((archivo) => {
    const doc = filaADocumentoCliente(archivo);
    return { ...doc, tipo: normalizarTipoDocumento(archivo.tema_codigo) };
  });

  const [consumoUltimos3Meses, creditoUsado] = await Promise.all([
    calcularConsumoUltimos3Meses(cliente, id),
    obtenerCreditoUsado(cliente, id),
  ]);

  return {
    cliente: filaACliente(fila),
    documentos: versionesDocumentos.filter((doc) => doc.vigente),
    versionesDocumentos,
    consumoUltimos3Meses,
    creditoUsado,
  };
}
