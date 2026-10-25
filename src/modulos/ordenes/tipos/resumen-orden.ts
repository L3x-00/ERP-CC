import type {
  ArchivoFicha,
  OrigenComercialFicha,
  TotalesSnapshot,
} from '@/modulos/ordenes/tipos/ficha-orden';
import type { EstadoSiiOrden } from '@/modulos/ordenes/tipos/orden-sii';

/** C10.5: resumen de una orden para el modal de la cola (sin salir de /ordenes). */

export interface SesionResumenOrden {
  id: string;
  operadorNombre: string;
  fechaInicio: string;
  fechaFin: string | null;
  estadoSesion: 'activa' | 'pausada' | 'finalizada';
  horasNetas: number;
  piezasProducidas: number;
  partidaCodigo: string;
  proceso: string;
  motivoPausa: string | null;
  notas: string | null;
}

export interface PartidaResumenOrden {
  id: string;
  codigoPieza: string;
  descripcion: string | null;
  cantidadSolicitada: number;
  cantidadProducida: number;
  unidadMedida: string;
  areaTrabajoCodigo: string | null;
  procesos: string[];
}

export interface PermisosResumenOrden {
  verRfq: boolean;
  verPropuesta: boolean;
  verTotales: boolean;
}

export interface ResumenOrden {
  orden: {
    id: string;
    folio: string;
    folioSii: string | null;
    estadoSii: EstadoSiiOrden;
    estadoLegacy: string;
    prioridad: string;
    clienteNombre: string | null;
    esInterna: boolean;
    /** Compromiso comercial; si falta, la fecha operativa. */
    fechaRequerida: string | null;
    /** Alta de la orden (aceptación de la propuesta). */
    fechaAprobacion: string;
    notas: string | null;
    archivadaEn: string | null;
  };
  origen: OrigenComercialFicha | null;
  partidas: PartidaResumenOrden[];
  horas: {
    estimadas: number;
    reales: number;
    eficiencia: number | null;
    sesiones: number;
  };
  archivos: ArchivoFicha[];
  sesiones: SesionResumenOrden[];
  /** Última nota de entrega (la más reciente) para el acceso directo. */
  entrega: { id: string; folio: string; esParcial: boolean; creadoEn: string } | null;
  totales: TotalesSnapshot | null;
  permisos: PermisosResumenOrden;
}
