import type { ResultadoDisponibilidadInicio } from '@/modulos/produccion/acciones/indice';
import { ETIQUETA_AREA_EQUIPO } from '@/modulos/catalogos/utilidades/indice';

function unirAreas(areas: readonly string[]): string {
  if (areas.length === 1) return areas[0]!;
  return `${areas.slice(0, -1).join(', ')} y ${areas[areas.length - 1]}`;
}

/** Texto de piso: sin códigos internos ni ids, con causa y salida real. */
export function mensajeSinDisponibilidad(
  resultado: ResultadoDisponibilidadInicio,
): string {
  if (resultado.motivo === 'sin_proceso') {
    return 'No se pudo identificar el equipo que pide este proceso. Revisa la configuración del proceso antes de iniciar.';
  }
  const grupo = resultado.grupoNombre ?? 'el equipo del proceso';
  const area = resultado.areaNombre ? ` el área ${resultado.areaNombre}` : ' el área configurada';

  if (resultado.motivo === 'sin_equipos_en_area' && resultado.areasConEquipos?.length) {
    const areas = unirAreas(
      resultado.areasConEquipos.map((macro) => ETIQUETA_AREA_EQUIPO[macro]),
    );
    const cuantos = resultado.areasConEquipos.length === 1 ? 'están' : 'están repartidos';
    return `El grupo ${grupo} sí tiene equipos activos, pero ninguno en${area}: ${cuantos} en ${areas}. Corrige el área del equipo en Configuración → Tarifas y costos → Equipos y sus tarifas.`;
  }

  return `No hay una máquina activa disponible para ${grupo} en${area}. Configura un equipo activo de ese grupo o corrige el área del proceso.`;
}
