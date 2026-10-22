import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';

/**
 * Frase de referencia para quien confirma la fecha compromiso al aceptar: lo que
 * pidió el cliente y el plazo ofrecido. Ninguno es la fecha compromiso; devuelve
 * null cuando el RFQ no tiene ninguno de los dos.
 */
export function textoReferenciaFechasRfq(
  fechas: { fechaRequerida: string | null; plazoComercial: string | null } | null,
): string | null {
  if (!fechas) return null;
  const partes: string[] = [];
  if (fechas.fechaRequerida) {
    partes.push(`El cliente pidió recibirlo el ${formatearFechaCalendario(fechas.fechaRequerida)}`);
  }
  if (fechas.plazoComercial) {
    partes.push(`Plazo ofrecido: ${fechas.plazoComercial}`);
  }
  return partes.length > 0 ? partes.join(' · ') : null;
}
