import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';

/** C31/A2: matriz única de acciones. Ningún componente decide por su cuenta. */
export type CodigoAccion =
  | 'reclamar'
  | 'iniciar'
  | 'reanudar'
  | 'sesion'
  | 'registrar_cierre'
  | 'reabrir_operacion'
  | 'liberar_reserva'
  | 'consultar'
  | 'bloqueada';

export type CodigoBloqueo =
  | 'programacion_bloqueada_sin_sesion'
  | 'proceso_ajeno'
  | 'sin_reclamo'
  | 'sesion_activa'
  | 'proceso_completado'
  | 'sin_piezas'
  | 'pausado'
  | 'solo_lectura';

export interface MatrizAccionesProceso {
  principal: CodigoAccion;
  etiqueta: string;
  deshabilitada: boolean;
  motivoBloqueo: CodigoBloqueo | null;
  destino: string | null;
}

/** Textos exactos que ve el operador; nunca un «No disponible» genérico. */
export const MOTIVO_BLOQUEO_TEXTO: Record<CodigoBloqueo, string> = {
  programacion_bloqueada_sin_sesion:
    'Bloqueado por Planeación: no hay sesión que reanudar. Administración debe reabrir la operación.',
  proceso_ajeno: 'Otro operador tiene el proceso; puedes consultar el detalle.',
  sin_reclamo: 'Reclama el proceso para iniciar.',
  sesion_activa: 'Ya hay una sesión activa en este proceso.',
  proceso_completado: 'Proceso completado: registra el consumo pendiente para cerrarlo.',
  sin_piezas: 'Espera a que el proceso anterior libere piezas.',
  pausado: 'Proceso pausado: reanuda la sesión.',
  solo_lectura: 'Vista de solo lectura: no puedes operar este proceso.',
};

export interface ContextoMatriz {
  soloLectura?: boolean;
  puedeReabrirOperacion?: boolean;
}

/**
 * Acción principal coherente con el estado persistido. El caso A2 va antes
 * que «reclamar»: si no hay sesión, permitir reclamar deja al operador atrapado
 * otra vez con una reserva que no puede iniciar.
 */
export function matrizAccionesProceso(
  proceso: ProcesoEspacioOperador,
  contexto: ContextoMatriz = {},
): MatrizAccionesProceso {
  if (proceso.motivoBloqueo === 'programacion_bloqueada_sin_sesion') {
    return {
      principal: 'reabrir_operacion',
      etiqueta: 'Bloqueado por Planeación',
      deshabilitada: contexto.puedeReabrirOperacion !== true,
      motivoBloqueo: 'programacion_bloqueada_sin_sesion',
      destino: 'panel-operador-produccion',
    };
  }
  if (contexto.soloLectura === true) {
    return {
      principal: 'consultar', etiqueta: 'Solo lectura', deshabilitada: true,
      motivoBloqueo: 'solo_lectura', destino: null,
    };
  }
  if (proceso.reclamo && !proceso.reclamadoPorMi) {
    return {
      principal: 'bloqueada', etiqueta: 'Tomado', deshabilitada: true,
      motivoBloqueo: 'proceso_ajeno', destino: null,
    };
  }
  if (proceso.sesionActiva) {
    return {
      principal: 'sesion', etiqueta: 'Registrar cierre', deshabilitada: false,
      motivoBloqueo: null, destino: null,
    };
  }
  if (proceso.puedeReanudar) {
    return {
      principal: 'reanudar', etiqueta: 'Continuar', deshabilitada: false,
      motivoBloqueo: null, destino: null,
    };
  }
  if (proceso.puedeIniciar) {
    return {
      principal: 'iniciar', etiqueta: 'Iniciar', deshabilitada: false,
      motivoBloqueo: null, destino: null,
    };
  }
  if (proceso.reclamo) {
    return {
      principal: 'bloqueada',
      etiqueta: proceso.reclamadoPorMi ? 'Reservado' : 'Tomado',
      deshabilitada: true,
      motivoBloqueo: null,
      destino: null,
    };
  }
  if (proceso.columna === 'lista') {
    return {
      principal: 'bloqueada', etiqueta: 'Completado', deshabilitada: true,
      motivoBloqueo: 'proceso_completado', destino: null,
    };
  }
  // Obs. cliente: el operador ya no hace el paso de «reclamar». La reserva la
  // crea la acción de inicio; aquí solo se ofrece iniciar (o el motivo real).
  return {
    principal: 'iniciar', etiqueta: 'Iniciar proceso', deshabilitada: true,
    motivoBloqueo: proceso.motivoBloqueo ?? null, destino: null,
  };
}
