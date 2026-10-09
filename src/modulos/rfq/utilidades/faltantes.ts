/**
 * Traduce los faltantes de `validar_rfq_listo` (mensajes del servidor) a
 * banderas por campo y clases compartidas, para que la ficha marque con borde
 * rojo suave exactamente los campos pendientes y con asterisco los obligatorios.
 */

/** Borde rojo suave para un campo con dato faltante (Input/Select/Textarea). */
export const CLASE_CAMPO_FALTANTE =
  'border-peligro/50 focus:border-peligro focus:ring-peligro/15';

/**
 * Asterisco de campo obligatorio como pseudo-elemento: no altera el texto del
 * label, así las consultas por etiqueta (accesibles, pruebas y E2E) no cambian.
 */
export const CLASE_OBLIGATORIO = "after:content-['*'] after:ml-0.5 after:text-peligro-texto";

export type FaltantesCliente = { cliente: boolean; contacto: boolean };

export function analizarFaltantesCliente(faltantes: readonly string[]): FaltantesCliente {
  return {
    cliente: faltantes.includes('cliente ligado') || faltantes.includes('cliente activo'),
    contacto: faltantes.includes('contacto vigente del cliente'),
  };
}

export type FaltantesGenerales = {
  descripcionGeneral: boolean;
  canal: boolean;
  fechaSolicitud: boolean;
  responsable: boolean;
};

export function analizarFaltantesGenerales(faltantes: readonly string[]): FaltantesGenerales {
  return {
    descripcionGeneral: faltantes.includes('descripción general'),
    canal: faltantes.includes('canal'),
    fechaSolicitud: faltantes.includes('fecha de solicitud'),
    responsable: faltantes.includes('responsable'),
  };
}

export type FaltantesSeguimiento = {
  proximaAccion: boolean;
  detalleProximaAccion: boolean;
  fechaProximaAccion: boolean;
  responsableProximaAccion: boolean;
};

export function analizarFaltantesSeguimiento(
  faltantes: readonly string[],
): FaltantesSeguimiento {
  return {
    proximaAccion: faltantes.includes('próxima acción'),
    detalleProximaAccion: faltantes.includes('detalle de la próxima acción (Otro)'),
    fechaProximaAccion: faltantes.includes('fecha de próxima acción'),
    responsableProximaAccion: faltantes.includes('responsable de próxima acción'),
  };
}

export type FaltantesItem = { material: boolean; espesor: boolean; operaciones: boolean };

export function analizarFaltantesItem(
  faltantes: readonly string[],
  codigo: string,
): FaltantesItem {
  const prefijo = `ítem ${codigo}: `;
  return {
    material: faltantes.includes(`${prefijo}material`),
    espesor:
      faltantes.includes(`${prefijo}espesor`) ||
      faltantes.includes(`${prefijo}espesor del material`),
    operaciones: faltantes.includes(`${prefijo}al menos una operación solicitada`),
  };
}

/** Etiquetas legibles de lo que le falta a un ítem, en orden canónico. */
export function etiquetasFaltantesItem(faltantes: FaltantesItem): string[] {
  const etiquetas: string[] = [];
  if (faltantes.material) etiquetas.push('material');
  if (faltantes.espesor) etiquetas.push('espesor');
  if (faltantes.operaciones) etiquetas.push('una operación');
  return etiquetas;
}

export function faltaItemActivo(faltantes: readonly string[]): boolean {
  return faltantes.includes('al menos un ítem activo');
}

export function faltaArchivoTecnico(faltantes: readonly string[]): boolean {
  return faltantes.some((faltante) => faltante.startsWith('archivo técnico'));
}
