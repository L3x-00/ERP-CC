import type { ResultadoDisponibilidadInicio } from '@/modulos/produccion/acciones/indice';

/** Texto de piso: sin códigos internos ni ids, con causa y salida real. */
export function mensajeSinDisponibilidad(
  resultado: ResultadoDisponibilidadInicio,
): string {
  if (resultado.motivo === 'sin_proceso') {
    return 'No se pudo identificar el equipo que pide este proceso. Revisa la configuración del proceso antes de iniciar.';
  }
  const grupo = resultado.grupoNombre ?? 'el equipo del proceso';
  const area = resultado.areaNombre ? ` el área ${resultado.areaNombre}` : ' el área configurada';
  return `No hay una máquina activa disponible para ${grupo} en${area}. Configura un equipo activo de ese grupo o corrige el área del proceso.`;
}
