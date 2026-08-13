import { create } from 'zustand';
import type {
  AreaPlaneacion,
  EstadoPlaneacion,
  TurnoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';

/** Rango de fechas ISO (`YYYY-MM-DD`) del calendario; `null` = usar el rango de la vista. */
export interface RangoFechasPlaneacion {
  fechaInicio: string;
  fechaFin: string;
}

interface TiendaPlaneacion {
  /** Rango elegido por el usuario; `null` mientras use el rango inicial de la vista. */
  rango: RangoFechasPlaneacion | null;
  /** Área seleccionada (o `null` = todas). */
  area: AreaPlaneacion | null;
  /** Recurso seleccionado (o `null` = todos los del área). */
  recursoId: string | null;
  /** Turnos seleccionados; lista vacía = sin filtrar por turno. */
  turnos: TurnoPlaneacion[];
  /** Estados seleccionados; lista vacía = sin filtrar por estado. */
  estados: EstadoPlaneacion[];
  /** Programación abierta en el panel de asignación (o `null` si ninguna). */
  programacionSeleccionadaId: string | null;
  establecerRango: (fechaInicio: string, fechaFin: string) => void;
  limpiarRango: () => void;
  establecerArea: (area: AreaPlaneacion | null) => void;
  establecerRecurso: (recursoId: string | null) => void;
  alternarTurno: (turno: TurnoPlaneacion) => void;
  establecerTurnos: (turnos: readonly TurnoPlaneacion[]) => void;
  alternarEstado: (estado: EstadoPlaneacion) => void;
  establecerEstados: (estados: readonly EstadoPlaneacion[]) => void;
  seleccionarProgramacion: (programacionId: string | null) => void;
  limpiarFiltros: () => void;
}

/** Se construye por llamada: devolver el mismo arreglo compartiría referencia entre reinicios. */
function filtrosIniciales(): Pick<
  TiendaPlaneacion,
  'rango' | 'area' | 'recursoId' | 'turnos' | 'estados'
> {
  return { rango: null, area: null, recursoId: null, turnos: [], estados: [] };
}

/**
 * Tienda de UI de Planeación: solo filtros y selección. Las programaciones y la
 * carga de capacidad NUNCA se copian aquí — son datos de servidor gestionados por
 * TanStack Query bajo la clave `['planeacion', 'calendario']`, que el
 * sincronizador Realtime invalida. Una copia mutable en Zustand se desincroniza
 * de lo que PostgreSQL aceptó realmente (la RPC valida capacidad bajo lock).
 *
 * Sin `persist` a propósito: un turno nuevo arranca sin heredar los filtros del
 * anterior, y un rango de fechas viejo mostraría un calendario vacío al abrir.
 */
export const usarTiendaPlaneacion = create<TiendaPlaneacion>((set) => ({
  ...filtrosIniciales(),
  programacionSeleccionadaId: null,
  // Un rango invertido produce `rango_fechas_invalido` en el servidor: se
  // descarta en el origen en vez de disparar una consulta condenada a fallar.
  establecerRango: (fechaInicio, fechaFin) =>
    set((actual) =>
      fechaInicio !== '' && fechaFin !== '' && fechaInicio <= fechaFin
        ? { rango: { fechaInicio, fechaFin } }
        : { rango: actual.rango },
    ),
  limpiarRango: () => set({ rango: null }),
  // Un recurso pertenece a un área: conservarlo al cambiar de área dejaría el
  // calendario vacío sin que el filtro visible explique por qué.
  establecerArea: (area) => set({ area, recursoId: null }),
  establecerRecurso: (recursoId) => set({ recursoId }),
  alternarTurno: (turno) =>
    set((actual) => ({
      turnos: actual.turnos.includes(turno)
        ? actual.turnos.filter((seleccionado) => seleccionado !== turno)
        : [...actual.turnos, turno],
    })),
  // Copias defensivas: el arreglo recibido puede seguir mutándose fuera de la tienda.
  establecerTurnos: (turnos) => set({ turnos: [...turnos] }),
  alternarEstado: (estado) =>
    set((actual) => ({
      estados: actual.estados.includes(estado)
        ? actual.estados.filter((seleccionado) => seleccionado !== estado)
        : [...actual.estados, estado],
    })),
  establecerEstados: (estados) => set({ estados: [...estados] }),
  seleccionarProgramacion: (programacionId) =>
    set({ programacionSeleccionadaId: programacionId }),
  // La selección no se limpia aquí: el panel abierto sigue siendo válido aunque
  // el usuario cambie el filtro del calendario.
  limpiarFiltros: () => set(filtrosIniciales()),
}));
