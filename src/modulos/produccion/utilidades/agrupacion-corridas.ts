import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';

/** Sugerencia de lote: ítems de una misma orden con material, calibre y proceso inicial iguales. */
export interface SugerenciaCorrida {
  clave: string;
  ordenId: string;
  materialCodigo: string;
  espesorMm: number;
  procesoNombre: string;
  procesos: ProcesoEspacioOperador[];
  mensaje: string;
}

/** Motivo por el que un proceso no puede entrar en una sugerencia, o null si puede. */
export function motivoNoAgrupable(proceso: ProcesoEspacioOperador): string | null {
  if (proceso.secuencia !== 1) return 'no es el proceso inicial del ítem';
  if (!proceso.material) return 'el ítem no tiene material';
  if (proceso.material.espesorMm == null) return 'no se pudo confirmar el calibre del material';
  if (proceso.procesoCompleto || proceso.pendientePiezas <= 0) return 'no hay piezas pendientes';
  if (proceso.sesionActiva) return 'ya tiene una sesión activa';
  if (proceso.reclamo) return 'ya está reclamado';
  return null;
}

function listaItems(procesos: readonly ProcesoEspacioOperador[]): string {
  const nombres = procesos.map(
    (proceso) => `${proceso.codigoPieza} (${proceso.descripcion ?? 'pieza'})`,
  );
  if (nombres.length <= 2) return nombres.join(' y ');
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/**
 * Sugerencias para agrupar el proceso inicial de varios ítems en una corrida.
 * El cliente decide: esto solo lee el tablero, no escribe en la base.
 */
export function sugerenciasDeAgrupacion(
  procesos: readonly ProcesoEspacioOperador[],
): SugerenciaCorrida[] {
  const elegibles = procesos.filter((proceso) => motivoNoAgrupable(proceso) === null);
  const grupos = new Map<string, ProcesoEspacioOperador[]>();
  for (const proceso of elegibles) {
    const material = proceso.material!;
    const clave = [proceso.ordenId, material.id, material.espesorMm, proceso.procesoNombre].join('|');
    const actuales = grupos.get(clave) ?? [];
    actuales.push(proceso);
    grupos.set(clave, actuales);
  }

  return [...grupos.entries()]
    .filter(([, agrupados]) => agrupados.length >= 2)
    .map(([clave, agrupados]) => {
      const primero = agrupados[0]!;
      const material = primero.material!;
      return {
        clave,
        ordenId: primero.ordenId,
        materialCodigo: material.codigo,
        espesorMm: material.espesorMm!,
        procesoNombre: primero.procesoNombre,
        procesos: agrupados,
        mensaje: `El ${listaItems(agrupados)} comparten el proceso de ${primero.procesoNombre} en el mismo material (${material.codigo}, calibre ${material.espesorMm} mm). Puede iniciarlos en una misma corrida.`,
      };
    });
}
