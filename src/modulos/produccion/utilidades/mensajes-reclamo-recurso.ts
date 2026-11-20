import type { ReclamacionRecurso } from '@/modulos/produccion/servicios/corridas-servicio';
import type { ReaperturaOperacion } from '@/modulos/produccion/servicios/reabrir-operacion-servicio';
import { etiquetaFechaHoraNegocio } from '@/modulos/produccion/utilidades/formato-operador';
import type { AvisoSupervision } from '@/modulos/produccion/tipos/espacio-operador';

/** C31/A2: texto exacto al reabrir una operación bloqueada sin sesión. */
export function mensajeReaperturaOperacion(
  resultado: ReaperturaOperacion,
  partidaCodigo: string,
): string {
  const actor = resultado.reabiertaPorNombre ?? 'administración';
  if (resultado.yaAplicado) {
    if (resultado.reabiertaEn === null) {
      return `${partidaCodigo} ya estaba abierta antes de que se registrara el responsable. No se registró ningún cambio nuevo.`;
    }
    return `${partidaCodigo} ya había sido reabierta por ${actor} el ${etiquetaFechaHoraNegocio(resultado.reabiertaEn)}. No se registró ningún cambio nuevo.`;
  }
  const reclamos = resultado.reclamosLiberados === 0
    ? 'no había reclamo activo que cerrar'
    : resultado.reclamosLiberados === 1
      ? 'se cerró 1 reclamo'
      : `se cerraron ${resultado.reclamosLiberados} reclamos`;
  return `${partidaCodigo} reabierta por ${actor}: volvió a Planeación y ${reclamos}. Ya puedes reclamarla de nuevo.`;
}

/**
 * C31/A1: textos exactos para la liberación de una máquina. Ningún mensaje dice
 * «No se pudo…» sin indicar qué pasó y qué hacer a continuación.
 */
export function mensajeLiberacionRecurso(
  resultado: ReclamacionRecurso,
  recursoCodigo: string,
  folioOrden: string,
): string {
  const actor = resultado.liberadoPorNombre ?? 'administración';
  if (resultado.yaAplicado) {
    if (resultado.liberadoEn === null) {
      return `Máquina ${recursoCodigo} ya estaba liberada antes de que se registrara el responsable. No se registró ningún cambio nuevo.`;
    }
    return `Máquina ${recursoCodigo} ya había sido liberada por ${actor} el ${etiquetaFechaHoraNegocio(resultado.liberadoEn)}. No se registró ningún cambio nuevo.`;
  }
  const reclamos = resultado.reclamosLiberados === 0
    ? 'no había ningún reclamo activo que cerrar'
    : resultado.reclamosLiberados === 1
      ? 'se cerró 1 reclamo'
      : `se cerraron ${resultado.reclamosLiberados} reclamos`;
  return `Máquina ${recursoCodigo} liberada por ${actor}: ${folioOrden} volvió a Planeación y ${reclamos}.`;
}

/** El transporte pudo fallar después del commit: no afirmar que no se aplicó. */
export function mensajeFalloConfirmacionRecurso(recursoCodigo: string): string {
  return `No se pudo confirmar la liberación de ${recursoCodigo}. Revisa «Máquinas liberadas»: si la máquina ya no aparece, la liberación se registró; si sigue ahí, vuelve a pulsar Reclamar.`;
}

/** Aviso que ve el operador en «Mis procesos» y en el detalle del proceso. */
export function mensajeAvisoSupervision(aviso: AvisoSupervision): string {
  if (aviso.actorNombre === null || aviso.fecha === null) {
    return 'Administración liberó esta máquina antes de que se registrara el responsable. La operación volvió a Planeación; vuelve a reclamarla si la necesitas.';
  }
  const reclamos = aviso.reclamosCerrados === 0
    ? 'no había reclamo activo que cerrar'
    : aviso.reclamosCerrados === 1
      ? 'se cerró 1 reclamo'
      : `se cerraron ${aviso.reclamosCerrados} reclamos`;
  return `${aviso.actorNombre} liberó esta máquina el ${etiquetaFechaHoraNegocio(aviso.fecha)}; ${reclamos}. La operación volvió a Planeación: vuelve a reclamarla si la necesitas.`;
}
