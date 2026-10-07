import type { ClaseEvidenciaEntrega } from '@/modulos/entregas/tipos/indice';
import type { EntregaCola } from '@/modulos/entregas/servicios/obtener-entregas';

/** Etiqueta legible de la clase de evidencia. */
export const ETIQUETA_CLASE_EVIDENCIA: Record<ClaseEvidenciaEntrega, string> = {
  evidencia: 'Evidencia fotográfica',
  firma: 'Firma digital',
  firma_escaneada: 'Firma escaneada',
};

/**
 * Formatea el consecutivo de entrega de una orden (YY de `NE-O-MMYY_XX-YY`).
 * Usa `CASE`-equivalente: 2 dígitos hasta 99 y sin truncar desde 100
 * (nunca `lpad` fijo).
 */
export function formatearConsecutivoEntrega(numero: number): string {
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new RangeError('consecutivo_entrega_invalido');
  }
  return numero < 100 ? String(numero).padStart(2, '0') : String(numero);
}

/**
 * Base del folio derivado (decisión cliente D1-B): el folio SII completo de la
 * orden `O-MMYY_XX` / `OI-MMYY_XX`, para que `NE-`/`RP-` conserven el prefijo
 * de origen; `null` si la orden es histórica o el folio no aplica.
 */
export function derivarBaseFolioOrden(folioOrdenSii: string | null): string | null {
  if (!folioOrdenSii) return null;
  return /^OI?-[0-9]{4}_[0-9]{2,3}$/.test(folioOrdenSii) ? folioOrdenSii : null;
}

/**
 * Construye el folio SII de una entrega: `NE-O-MMYY_XX-YY` / `NE-OI-MMYY_XX-YY`.
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
