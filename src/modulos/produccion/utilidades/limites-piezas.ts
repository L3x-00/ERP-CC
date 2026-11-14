/**
 * Límite de piezas que el operador puede declarar en una operación.
 *
 * El servidor ya rechaza cantidades mayores, pero el operador necesita ver el
 * tope antes de capturar: la orden no puede producir más de lo solicitado ni
 * más de lo que el proceso anterior dejó disponible.
 */
export interface DatosLimitePiezas {
  /** Meta de proceso de la operación; null en partidas sin ruteo. */
  metaProcesoId: string | null;
  /** Piezas que faltan para cumplir la meta (solo con ruteo). */
  pendientePiezas?: number | null;
  /** Piezas terminadas por el proceso anterior; null si es la primera operación. */
  piezasDisponibles?: number | null;
  cantidadSolicitada: number;
  cantidadProducida: number;
}

function positivo(valor: number | null | undefined): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.max(0, valor) : null;
}

/** Máximo de piezas que se pueden declarar; nunca negativo. */
export function maximoPiezasProceso(datos: DatosLimitePiezas): number {
  const pendienteOrden = Math.max(0, datos.cantidadSolicitada - datos.cantidadProducida);
  if (!datos.metaProcesoId) return pendienteOrden;

  const pendienteMeta = positivo(datos.pendientePiezas) ?? pendienteOrden;
  const disponible = positivo(datos.piezasDisponibles);
  return disponible === null
    ? Math.min(pendienteOrden, pendienteMeta)
    : Math.min(pendienteOrden, pendienteMeta, disponible);
}

/**
 * Mensaje accionable para la captura de piezas. Devuelve null cuando la
 * cantidad es válida.
 */
export function validarCantidadPiezas(
  cantidad: number,
  maximo: number | null,
  etiqueta = 'piezas producidas',
): string | null {
  if (!Number.isInteger(cantidad) || cantidad < 0) {
    return `Las ${etiqueta} deben ser un número entero mayor o igual a 0.`;
  }
  if (maximo !== null && cantidad > maximo) {
    return `No puedes declarar ${cantidad} ${etiqueta}: el máximo permitido es ${maximo}.`;
  }
  return null;
}

/** Texto de ayuda que acompaña al campo de piezas. */
export function ayudaLimitePiezas(maximo: number | null): string {
  if (maximo === null) return '';
  if (maximo === 0) return 'Esta operación ya no tiene piezas pendientes.';
  return maximo === 1
    ? 'Máximo 1 pieza para esta operación.'
    : `Máximo ${maximo} piezas para esta operación.`;
}
