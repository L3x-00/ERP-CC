import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';

/**
 * Diagnóstico de la configuración que alimenta el ruteo.
 *
 * Aclaración cliente 2026-11-09: cuando falta tarifa, materiales o área de
 * trabajo, la pantalla debe decir exactamente qué falta y ofrecer un enlace a
 * la pantalla donde se resuelve. Nunca se deja al usuario sin salida ni se
 * costea un valor ambiguo en silencio.
 */

export type EnlaceConfiguracion = {
  href: string;
  etiqueta: string;
};

export const ENLACE_TARIFAS_RUTEO: EnlaceConfiguracion = {
  href: '/configuracion?pestana=tarifas',
  etiqueta: 'Abrir Tarifas / TC',
};

export const ENLACE_CATALOGOS_RUTEO: EnlaceConfiguracion = {
  href: '/configuracion?pestana=catalogos-base',
  etiqueta: 'Abrir Catálogos base',
};

export const ENLACE_AREAS_RUTEO: EnlaceConfiguracion = {
  href: '/configuracion?pestana=areas',
  etiqueta: 'Abrir Áreas de trabajo',
};

export type PendienteConfiguracionRuteo = {
  clave: string;
  titulo: string;
  detalle: string;
  enlace: EnlaceConfiguracion;
};

type EntradaDiagnostico = {
  catalogos: CatalogosPropuesta | null;
  /** Procesos que aparecen en las filas visibles del ruteo. */
  procesosUsados: readonly string[];
  /** Grupos de equipo que aparecen en las filas visibles del ruteo. */
  gruposUsados: readonly string[];
  /** Hay al menos un ítem activo en la revisión. */
  hayItemsActivos: boolean;
};

function nombres(lista: readonly string[]): string {
  if (lista.length === 1) return `«${lista[0]}»`;
  if (lista.length === 2) return `«${lista[0]}» y «${lista[1]}»`;
  return `${lista.slice(0, -1).map((nombre) => `«${nombre}»`).join(', ')} y «${lista[lista.length - 1]}»`;
}

/** Lista ordenada de pendientes; vacía cuando la configuración está completa. */
export function diagnosticarConfiguracionRuteo({
  catalogos,
  procesosUsados,
  gruposUsados,
  hayItemsActivos,
}: EntradaDiagnostico): PendienteConfiguracionRuteo[] {
  if (!catalogos) return [];

  const pendientes: PendienteConfiguracionRuteo[] = [];

  if (catalogos.procesos.length === 0) {
    pendientes.push({
      clave: 'sin-procesos',
      titulo: 'No hay procesos activos',
      detalle:
        'El ruteo se arma con procesos. Crea o activa al menos uno en Configuración → Catálogos base → Procesos.',
      enlace: ENLACE_CATALOGOS_RUTEO,
    });
  }

  const idsProcesos = new Set(procesosUsados);
  const procesos = catalogos.procesos.filter((proceso) => idsProcesos.has(proceso.id));
  const sinGrupo = procesos.filter((proceso) => !proceso.grupoEquipoId);
  if (sinGrupo.length > 0) {
    pendientes.push({
      clave: 'procesos-sin-grupo',
      titulo: 'Procesos sin grupo de equipo',
      detalle: `${nombres(sinGrupo.map((proceso) => proceso.nombre))} no tiene un grupo de equipo asignado. El grupo define la tarifa estándar; puedes elegirlo en cada fila del ruteo o dejarlo configurado en el proceso.`,
      enlace: ENLACE_CATALOGOS_RUTEO,
    });
  }

  const codigosArea = new Set(catalogos.areasTrabajo.map((area) => area.codigo));
  const sinArea = procesos.filter((proceso) => !proceso.areaTrabajoCodigo);
  if (sinArea.length > 0) {
    pendientes.push({
      clave: 'procesos-sin-area',
      titulo: 'Procesos sin área de trabajo',
      detalle: `${nombres(sinArea.map((proceso) => proceso.nombre))} no tiene área de trabajo. Planeación la necesita para ubicar la operación; asígnala en el proceso.`,
      enlace: ENLACE_CATALOGOS_RUTEO,
    });
  }

  const areaInactiva = procesos.filter(
    (proceso) => proceso.areaTrabajoCodigo && !codigosArea.has(proceso.areaTrabajoCodigo),
  );
  if (areaInactiva.length > 0) {
    pendientes.push({
      clave: 'areas-inactivas',
      titulo: 'Áreas de trabajo no disponibles',
      detalle: `${nombres(areaInactiva.map((proceso) => proceso.nombre))} usa un área de trabajo que no está activa. Actívala o crea una nueva.`,
      enlace: ENLACE_AREAS_RUTEO,
    });
  }

  const idsGrupos = new Set(gruposUsados);
  const grupos = catalogos.gruposEquipo.filter((grupo) => idsGrupos.has(grupo.id));
  const sinTarifa = grupos.filter((grupo) => grupo.sinTarifa);
  if (sinTarifa.length > 0) {
    pendientes.push({
      clave: 'grupos-sin-tarifa',
      titulo: 'Grupos sin tarifa estándar por hora',
      detalle: `${nombres(sinTarifa.map((grupo) => grupo.nombre))} no tiene tarifa estándar. El costeo usaría la tarifa de respaldo y quedaría marcado con una advertencia; si no hay respaldo configurado, no se podrá costear.`,
      enlace: ENLACE_TARIFAS_RUTEO,
    });
  }

  const gruposInexistentes = gruposUsados.filter(
    (id) => !catalogos.gruposEquipo.some((grupo) => grupo.id === id),
  );
  if (gruposInexistentes.length > 0) {
    pendientes.push({
      clave: 'grupos-inactivos',
      titulo: 'Grupos de equipo no disponibles',
      detalle: 'Una fila del ruteo usa un grupo de equipo que ya no está activo. Elige otro grupo o reactívalo.',
      enlace: ENLACE_TARIFAS_RUTEO,
    });
  }

  if (hayItemsActivos && catalogos.materiales.length === 0) {
    pendientes.push({
      clave: 'sin-materiales',
      titulo: 'No hay materiales activos',
      detalle:
        'Los ítems nuevos y sus espesores salen del catálogo de materiales. Crea o activa al menos un material para completar la configuración.',
      enlace: ENLACE_CATALOGOS_RUTEO,
    });
  } else if (hayItemsActivos && catalogos.espesores.length === 0) {
    pendientes.push({
      clave: 'sin-espesores',
      titulo: 'Materiales sin espesores',
      detalle:
        'Los materiales activos no tienen espesores capturados. Agrega al menos un espesor por material para poder elegirlo en los ítems.',
      enlace: ENLACE_CATALOGOS_RUTEO,
    });
  }

  return pendientes;
}
