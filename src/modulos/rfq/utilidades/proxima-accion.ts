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
