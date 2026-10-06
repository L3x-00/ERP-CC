import type { ClaseEvidenciaEntrega } from '@/modulos/entregas/tipos/indice';
import type { EntregaCola } from '@/modulos/entregas/servicios/obtener-entregas';

/** Etiqueta legible de la clase de evidencia. */
export const ETIQUETA_CLASE_EVIDENCIA: Record<ClaseEvidenciaEntrega, string> = {
  evidencia: 'Evidencia fotográfica',
  firma: 'Firma digital',
  firma_escaneada: 'Firma escaneada',
};

/**
 * Formatea el consecutivo de entrega de una orden (YY de `NE-MMYY_XX-YY`).
 * Usa `CASE`-equivalente: 2 dígitos hasta 99 y sin truncar desde 100
 * (nunca `lpad` fijo).
 */
export function formatearConsecutivoEntrega(numero: number): string {
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new RangeError('consecutivo_entrega_invalido');
  }
  return numero < 100 ? String(numero).padStart(2, '0') : String(numero);
}

/** Deriva `MMYY_XX` del folio de orden `O-`/`OI-`; `null` si no aplica. */
export function derivarBaseFolioOrden(folioOrdenSii: string | null): string | null {
  if (!folioOrdenSii) return null;
  const coincidencia = /^O(?:I)?-(.+)$/.exec(folioOrdenSii);
  return coincidencia?.[1] ?? null;
}

/**
 * Construye el folio SII de una entrega: `NE-MMYY_XX-YY`.
 * `null` cuando la orden es histórica (sin `folio_sii`).
 */
export function construirFolioEntrega(
  folioOrdenSii: string | null,
  consecutivo: number,
): string | null {
  const base = derivarBaseFolioOrden(folioOrdenSii);
  if (!base) return null;
  return `NE-${base}-${formatearConsecutivoEntrega(consecutivo)}`;
}

/** Etiqueta de estado de una nota de entrega. */
export function etiquetaEstadoEntrega(esParcial: boolean): 'Parcial' | 'Total' {
  return esParcial ? 'Parcial' : 'Total';
}

export type FiltroEstadoEntrega = 'todas' | 'parcial' | 'completa';

/** Filtra la cola de notas por estado (parcial/completa) y texto libre. */
export function filtrarEntregasCola(
  entregas: readonly EntregaCola[],
  filtros: { estado: FiltroEstadoEntrega; texto: string },
): EntregaCola[] {
  const texto = filtros.texto.trim().toLowerCase();
  return entregas.filter(({ entrega, ordenFolio, ordenFolioSii, clienteNombre }) => {
    if (filtros.estado === 'parcial' && !entrega.esParcial) return false;
    if (filtros.estado === 'completa' && entrega.esParcial) return false;
    if (!texto) return true;
    return [
      entrega.folio,
      entrega.folioSii ?? '',
      ordenFolio,
      ordenFolioSii ?? '',
      clienteNombre ?? '',
      entrega.recibidoPor,
    ]
      .join(' ')
      .toLowerCase()
      .includes(texto);
  });
}
