import type { Rfq } from '@/modulos/rfq/tipos/indice';

/** Próxima acción capturada en un cambio de estado no terminal (C2.2/DC-06). */
export type ProximaAccionCaptura = {
  codigo: string;
  texto: string;
  fecha: string;
  responsableId: string;
};

type AccionCatalogo = { codigo: string; esOtro: boolean };

/** Fecha local `YYYY-MM-DD` de hoy (la UI no ofrece fechas pasadas). */
export function fechaHoyLocal(ahora: Date = new Date()): string {
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

/**
 * Parte de la próxima acción vigente del RFQ para confirmarla o cambiarla.
 * Una fecha vencida no se arrastra: obligaría a fallar en el servidor.
 */
export function proximaAccionInicial(rfq: Rfq, hoy: string): ProximaAccionCaptura {
  const fecha = rfq.fechaProximaAccion?.slice(0, 10) ?? '';
  return {
    codigo: rfq.proximaAccionCodigo ?? '',
    texto: rfq.proximaAccionTexto ?? '',
    fecha: fecha && fecha >= hoy ? fecha : '',
    responsableId: rfq.responsableProximaAccionId ?? '',
  };
}

/**
 * Cómo terminó la acción de seguimiento que se va a sustituir. Son los únicos
 * resultados que pide el cliente (obs. 2026-10-21); el resultado queda en Actividad.
 */
export const RESULTADOS_PROXIMA_ACCION = [
  { valor: 'completada', etiqueta: 'Completada', ayuda: 'Se hizo lo que estaba previsto.' },
  { valor: 'sin_respuesta', etiqueta: 'Sin respuesta', ayuda: 'Se intentó, pero el cliente no contestó.' },
  { valor: 'reprogramada', etiqueta: 'Reprogramada', ayuda: 'Se mueve para otra fecha.' },
  { valor: 'ya_no_aplica', etiqueta: 'Ya no aplica', ayuda: 'Ya no es necesaria.' },
] as const;

export type ResultadoProximaAccion = (typeof RESULTADOS_PROXIMA_ACCION)[number]['valor'];

/** Valores para el esquema Zod (Server Action) sin duplicar la lista. */
export const VALORES_RESULTADO_PROXIMA_ACCION = RESULTADOS_PROXIMA_ACCION.map(
  (resultado) => resultado.valor,
) as [ResultadoProximaAccion, ...ResultadoProximaAccion[]];

/** Etiqueta legible de un resultado de la acción de seguimiento. */
export function etiquetaResultadoProximaAccion(resultado: ResultadoProximaAccion): string {
  return RESULTADOS_PROXIMA_ACCION.find((opcion) => opcion.valor === resultado)?.etiqueta ?? resultado;
}

/**
 * ¿La edición directa del Resumen sustituye la acción vigente? Solo cuenta
 * cambiar la acción (o su detalle) o retirarla; mover la fecha o el responsable
 * es ajustar la misma acción, no cerrarla. El servidor reevalúa esta regla
 * contra la fila guardada, nunca contra lo que dicta el navegador.
 */
export function reemplazaProximaAccionVigente(
  rfq: Pick<Rfq, 'proximaAccionCodigo' | 'proximaAccionTexto'>,
  captura: Pick<ProximaAccionCaptura, 'codigo' | 'texto'>,
): boolean {
  if (!rfq.proximaAccionCodigo) return false;
  if (captura.codigo !== rfq.proximaAccionCodigo) return true;
  const textoNuevo = captura.texto.trim() || null;
  const textoVigente = rfq.proximaAccionTexto?.trim() || null;
  return textoNuevo !== textoVigente;
}

/** ¿El RFQ ya tiene una acción de seguimiento pendiente? */
export function tieneProximaAccionVigente(
  rfq: Pick<Rfq, 'proximaAccionCodigo'>,
): boolean {
  return Boolean(rfq.proximaAccionCodigo);
}

/** ¿La fecha de la acción vigente ya pasó? Entonces no puede dejarse como está. */
export function proximaAccionVencida(
  rfq: Pick<Rfq, 'proximaAccionCodigo' | 'fechaProximaAccion'>,
  hoy: string,
): boolean {
  const fecha = rfq.fechaProximaAccion?.slice(0, 10);
  return tieneProximaAccionVigente(rfq) && Boolean(fecha) && (fecha as string) < hoy;
}

/**
 * Decisión sobre el seguimiento al cambiar el estado del RFQ: dejar la acción
 * vigente tal cual, o cerrarla (con su resultado) y definir la siguiente.
 */
export type SeguimientoTransicion = {
  modo: 'mantener' | 'cerrar';
  resultado: ResultadoProximaAccion | '';
  proxima: ProximaAccionCaptura;
};

/**
 * Punto de partida: con una acción vigente y a tiempo se deja como está (cambiar
 * de estado no obliga a capturar otra); si venció o no existe, hay que definirla.
 */
export function seguimientoTransicionInicial(rfq: Rfq, hoy: string): SeguimientoTransicion {
  const vigenteATiempo = tieneProximaAccionVigente(rfq) && !proximaAccionVencida(rfq, hoy);
  return {
    modo: vigenteATiempo ? 'mantener' : 'cerrar',
    resultado: '',
    proxima: proximaAccionInicial(rfq, hoy),
  };
}

/**
 * Al cerrar la acción vigente la siguiente se define desde cero (salvo el
 * responsable); «Reprogramada» conserva la misma acción para solo mover la fecha.
 */
export function proximaAccionTrasResultado(
  rfq: Rfq,
  resultado: ResultadoProximaAccion,
): ProximaAccionCaptura {
  const responsableId = rfq.responsableProximaAccionId ?? '';
  if (resultado === 'reprogramada') {
    return {
      codigo: rfq.proximaAccionCodigo ?? '',
      texto: rfq.proximaAccionTexto ?? '',
      fecha: '',
      responsableId,
    };
  }
  return { codigo: '', texto: '', fecha: '', responsableId };
}

/** Faltantes del seguimiento en un cambio de estado (UX; el servidor revalida). */
export function faltantesSeguimientoTransicion(
  seguimiento: SeguimientoTransicion,
  hayAccionVigente: boolean,
  acciones: readonly AccionCatalogo[],
  hoy: string,
): string[] {
  if (seguimiento.modo === 'mantener') return [];
  const faltantes: string[] = [];
  if (hayAccionVigente && seguimiento.resultado === '') faltantes.push('cómo terminó la acción actual');
  faltantes.push(...faltantesProximaAccion(seguimiento.proxima, acciones, hoy));
  return faltantes;
}

/** Faltantes legibles para UX; el servidor revalida todo en la misma operación. */
export function faltantesProximaAccion(
  valor: ProximaAccionCaptura,
  acciones: readonly AccionCatalogo[],
  hoy: string,
): string[] {
  const faltantes: string[] = [];
  const accion = acciones.find((opcion) => opcion.codigo === valor.codigo);
  if (!accion) faltantes.push('próxima acción');
  if (accion?.esOtro && valor.texto.trim().length < 3) faltantes.push('detalle de la acción "Otro"');
  if (!valor.fecha) faltantes.push('fecha de la próxima acción');
  else if (valor.fecha < hoy) faltantes.push('una fecha que no esté en el pasado');
  if (!valor.responsableId) faltantes.push('responsable de la próxima acción');
  return faltantes;
}
