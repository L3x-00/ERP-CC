import type { ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';

export type PasoCapturaRfq = 'cliente' | 'solicitud' | 'items' | 'archivos' | 'revisar';
export type PestanaCapturaRfq = 'resumen' | 'items' | 'archivos' | 'revisar';

/** Devuelve los pasos que requieren corrección sin duplicar Solicitud. */
export function pasosConFaltantesCaptura(
  validacion: ValidacionRfqListo,
): PasoCapturaRfq[] {
  const faltantes: PasoCapturaRfq[] = [];
  if (validacion.secciones.cliente.length > 0) faltantes.push('cliente');
  if (
    validacion.secciones.general.length > 0 ||
    validacion.secciones.seguimiento.length > 0
  ) {
    faltantes.push('solicitud');
  }
  if (validacion.secciones.items.length > 0) faltantes.push('items');
  if (validacion.secciones.archivos.length > 0) faltantes.push('archivos');
  return faltantes;
}

/** Reanuda en el primer paso pendiente; si todo está completo, abre Revisar. */
export function pasoSugeridoCaptura(validacion: ValidacionRfqListo): PasoCapturaRfq {
  return pasosConFaltantesCaptura(validacion)[0] ?? 'revisar';
}

/** Cliente y Solicitud comparten la pestaña editable Resumen de la ficha. */
export function pestanaPorPasoCaptura(paso: PasoCapturaRfq): PestanaCapturaRfq {
  if (paso === 'cliente' || paso === 'solicitud') return 'resumen';
  return paso;
}
