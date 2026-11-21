/**
 * Consumo de piezas entre procesos (C17).
 *
 * En un proceso posterior (Doblado, Soldadura, etc.) el operador no consume la
 * lámina: consume las piezas que liberó el proceso anterior. El formulario
 * arranca «Usado» en 0 y el piso casi nunca lo captura, así que el consumo
 * real se asume 1:1 con lo producido cuando queda vacío o en 0.
 *
 * Estas funciones son la única fuente de esa regla: el detalle del proceso y
 * el panel rápido deben validar y avisar exactamente igual.
 */

/**
 * Piezas que se descontarán del proceso anterior. Si el operador deja «Usado»
 * en 0 en un proceso posterior, se toma lo producido (1:1). Cualquier valor
 * capturado se respeta tal cual.
 */
export function piezasUsadasEfectivas(
  usada: number,
  producidas: number,
  esProcesoPosterior: boolean,
): number {
  if (!esProcesoPosterior || usada > 0) return usada;
  return Number.isFinite(producidas) && producidas > 0 ? producidas : usada;
}

export interface DatosConsumoPiezasCierre {
  /** Valor capturado en «Usado» (ya convertido a número). */
  usada: number;
  /** Valor capturado en «Merma». */
  merma: number;
  /** Piezas que el operador declara producidas en esta sesión. */
  producidas: number;
  /** Piezas del proceso anterior disponibles antes de este cierre. */
  disponibles: number;
  /** Nombre del proceso inmediato anterior («Corte laser»). */
  procesoPrevio: string;
  /** Nombre del proceso que se está cerrando («DOBLADO_CNC»). */
  procesoActual: string;
}

export interface FalloConsumoPiezas {
  /** Título concreto del aviso: dice qué revisar, no que algo falló. */
  titulo: string;
  mensaje: string;
  /**
   * true cuando el fallo se corrige tomando lo producido como consumo; la UI
   * ofrece ese botón en lugar de dejar al operador adivinar el número.
   */
  sugerirUsarProducidas: boolean;
}

function numero(valor: number): string {
  return Number.isFinite(valor)
    ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(valor)
    : '—';
}

/**
 * Valida el consumo de piezas antes de llamar al cierre. Devuelve null cuando
 * los datos son válidos. Los mensajes citan la cantidad capturada y el campo
 * del que sale, para que el operador sepa qué corregir sin adivinar.
 */
export function validarConsumoPiezasCierre(
  datos: DatosConsumoPiezasCierre,
): FalloConsumoPiezas | null {
  const { usada, merma, producidas, disponibles, procesoPrevio, procesoActual } = datos;
  const total = usada + merma;

  const titulo = 'Revisa el consumo de piezas';
  if (!Number.isInteger(usada) || !Number.isInteger(merma) || usada < 0 || merma < 0) {
    return {
      titulo,
      mensaje: `Las piezas usadas de ${procesoPrevio} y la merma deben ser números enteros: capturaste ${numero(usada)} y ${numero(merma)}.`,
      sugerirUsarProducidas: false,
    };
  }
  if (total > disponibles) {
    return {
      titulo,
      mensaje: `Solo hay ${numero(disponibles)} piezas terminadas por ${procesoPrevio}. Bajaste ${numero(total)} entre usadas y mermas; ajusta Usado o Merma para continuar.`,
      sugerirUsarProducidas: false,
    };
  }
  if (usada < producidas) {
    return {
      titulo,
      mensaje: `Declaraste ${numero(producidas)} piezas terminadas en ${procesoActual}, pero el campo Usado de ${procesoPrevio} tiene ${numero(usada)}. Para cerrar, deja Usado en 0 y el sistema tomará las ${numero(producidas)} piezas, o escribe ${numero(producidas)} o más.`,
      sugerirUsarProducidas: true,
    };
  }
  return null;
}

/** Mensaje del motivo obligatorio cuando hay consumo de piezas. */
export function mensajeMotivoConsumoPiezas(
  procesoPrevio: string,
  total: number,
): string {
  return `Escribe por qué consumiste ${numero(total)} piezas de ${procesoPrevio}. Necesitamos al menos 3 caracteres.`;
}
