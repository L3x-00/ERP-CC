/**
 * Consulta informativa de capacidad desde una revisión SENT/FOLLOW_UP. Solo
 * viajan agregados por grupo de equipo: nunca recursos, IDs de terceros,
 * folios, clientes, órdenes ni programaciones.
 */
export type EstadoCapacidadGrupo = 'con_capacidad' | 'sin_capacidad_configurada';

/**
 * Capacidad agregada de un día concreto para un grupo: suma de turnos y
 * recursos. Permite ofrecer «Usar este día» al confirmar la fecha compromiso.
 */
export type DisponibilidadDia = {
  fecha: string;
  horasCapacidad: number;
  horasCarga: number;
  /** Disponibilidad no negativa sumada; un turno saturado no se compensa. */
  horasDisponibles: number;
  turnosSobrecargados: number;
};

export type DisponibilidadGrupo = {
  codigo: string;
  nombre: string;
  /** Suma de `total_horas` (setup + run) del ruteo de la revisión. */
  horasRequeridas: number;
  estado: EstadoCapacidadGrupo;
  /** null cuando no hay recurso activo o turno configurado en el grupo. */
  horasCapacidad: number | null;
  horasCarga: number | null;
  /** Suma de la disponibilidad no negativa de cada turno del horizonte. */
  horasDisponibles: number | null;
  turnosSobrecargados: number;
  /** Recursos activos del grupo sin ningún turno configurado. */
  recursosSinTurno: number;
  /** Desglose por fecha del horizonte; vacío si no hay capacidad configurada. */
  dias?: DisponibilidadDia[];
};

export type ProcesoSinGrupo = { nombre: string; horasRequeridas: number };

export type ResumenDisponibilidadPropuesta = {
  revisionId: string;
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  zonaHoraria: string;
  grupos: DisponibilidadGrupo[];
  procesosSinGrupo: ProcesoSinGrupo[];
  /** Códigos de ítems activos (no descuento) de la revisión que no tienen ruteo. */
  itemsSinRuteo: string[];
  sinItemsActivos: boolean;
};
