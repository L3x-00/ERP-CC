import type { DesglosePartidaPlaneacion } from '@/modulos/planeacion/tipos/indice';

/**
 * Presentación pura del desglose de una partida (OBS-08). Los campos que el
 * negocio aún no captura no se inventan: se muestran como "Por definir" para
 * que la ausencia sea visible en lugar de un espacio vacío ambiguo.
 */

export const TEXTO_POR_DEFINIR = 'Por definir';

export function textoODefecto(valor: string | null | undefined): string {
  const texto = (valor ?? '').trim();
  return texto === '' ? TEXTO_POR_DEFINIR : texto;
}

/** Duración legible: `2 h 30 min`, `45 min`, `3 h`. */
export function formatearDuracionMinutos(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return TEXTO_POR_DEFINIR;
  const totales = Math.round(minutos);
  const horas = Math.floor(totales / 60);
  const resto = totales % 60;
  if (horas === 0) return `${resto} min`;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${resto} min`;
}

/** Piezas aún pendientes de fabricar; nunca negativo. */
export function calcularPendientes(
  solicitada: number,
  producida: number,
  scrap: number,
): number {
  const pendientes =
    (Number.isFinite(solicitada) ? solicitada : 0)
    - (Number.isFinite(producida) ? producida : 0)
    - (Number.isFinite(scrap) ? scrap : 0);
  return pendientes > 0 ? pendientes : 0;
}

function formatearCantidad(valor: number): string {
  if (!Number.isFinite(valor)) return '0';
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(2);
}

/** Avance de fabricación: `4/10 pieza · 6 pendientes` (y merma si existe). */
export function etiquetaAvancePartida(desglose: DesglosePartidaPlaneacion): string {
  const solicitada = desglose.cantidadSolicitada;
  const producida = desglose.cantidadProducida;
  const pendientes = calcularPendientes(
    solicitada,
    producida,
    desglose.cantidadScrap,
  );
  const unidad = textoODefecto(desglose.unidadMedida).toLowerCase();
  const avance = `${formatearCantidad(producida)}/${formatearCantidad(solicitada)} ${unidad}`;
  const partes = [avance, `${formatearCantidad(pendientes)} pendientes`];
  if (desglose.cantidadScrap > 0) {
    partes.push(`${formatearCantidad(desglose.cantidadScrap)} merma`);
  }
  return partes.join(' · ');
}

/** Procesos solicitados o "Por definir" cuando el catálogo aún no los captura. */
export function etiquetaProcesos(desglose: DesglosePartidaPlaneacion): string {
  const procesos = desglose.procesos.map((proceso) => proceso.trim()).filter(Boolean);
  return procesos.length === 0 ? TEXTO_POR_DEFINIR : procesos.join(', ');
}

/** Material asignado con su cantidad solicitada, o "Por definir". */
export function etiquetaMaterial(desglose: DesglosePartidaPlaneacion): string {
  if (!desglose.materialNombre) return TEXTO_POR_DEFINIR;
  const unidad = textoODefecto(desglose.unidadMedida).toLowerCase();
  return `${desglose.materialNombre} · ${formatearCantidad(desglose.cantidadSolicitada)} ${unidad}`;
}

/** Área legible: nombre de configuración, código o "Por definir". */
export function etiquetaArea(desglose: DesglosePartidaPlaneacion): string {
  return textoODefecto(desglose.areaNombre ?? desglose.areaCodigo);
}
