import type { Json } from '@/compartido/tipos/supabase';

/** Tablas de catálogo versionadas (coinciden con `versiones_catalogo.entidad`). */
export const ENTIDADES_CATALOGO = [
  'catalogo_materiales',
  'catalogo_espesores',
  'catalogo_procesos',
  'grupos_equipo',
  'grupos_planeados',
  'catalogo_proximas_acciones',
  'catalogo_canales',
] as const;
export type EntidadCatalogo = (typeof ENTIDADES_CATALOGO)[number];

export interface MaterialCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
  metadata: Record<string, unknown>;
  creadoEn: string;
  actualizadoEn: string;
}

export interface EspesorCatalogo {
  id: string;
  materialId: string;
  etiqueta: string;
  espesorMm: number;
  activo: boolean;
  orden: number;
  creadoEn: string;
}

export interface ProcesoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  prefijoCorrida: string;
  grupoPlaneadoId: string | null;
  areaTrabajoCodigo: string | null;
  requiereArchivoTecnico: boolean;
  requierePrimeraPieza: boolean;
  intervaloInspeccionLote: number | null;
  activo: boolean;
  orden: number;
  creadoEn: string;
}

export interface GrupoEquipoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
  creadoEn: string;
}

export interface GrupoPlaneadoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
  creadoEn: string;
}

export interface ProximaAccionCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  esOtro: boolean;
  activo: boolean;
  orden: number;
  creadoEn: string;
}

/** Canal de origen del RFQ (DC-02); solo uno puede ser "Otro". */
export interface CanalCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  esOtro: boolean;
  activo: boolean;
  orden: number;
  creadoEn: string;
}

export interface VersionCatalogo {
  id: string;
  entidad: EntidadCatalogo;
  entidadId: string;
  version: number;
  datos: Record<string, unknown>;
  actorId: string | null;
  creadoEn: string;
}

/** Opción del catálogo de taller para enlazar un proceso (solo lectura). */
export interface AreaTrabajoOpcion {
  codigo: string;
  nombre: string;
  activo: boolean;
}

/** Datos completos de la pestaña Configuración → Catálogos base. */
export interface CatalogosBase {
  materiales: MaterialCatalogo[];
  espesores: EspesorCatalogo[];
  procesos: ProcesoCatalogo[];
  gruposEquipo: GrupoEquipoCatalogo[];
  gruposPlaneados: GrupoPlaneadoCatalogo[];
  proximasAcciones: ProximaAccionCatalogo[];
  canales: CanalCatalogo[];
  areasTrabajo: AreaTrabajoOpcion[];
  /** El usuario puede mutar (permiso `catalogo_editar` o admin). */
  puedeEditar: boolean;
}

/** Fila cruda de Supabase (snake_case). */
export interface FilaMaterialCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
  metadata: Json;
  creado_en: string;
  actualizado_en: string;
}

export interface FilaEspesorCatalogo {
  id: string;
  material_id: string;
  etiqueta: string;
  espesor_mm: number | string;
  activo: boolean;
  orden: number;
  creado_en: string;
}

export interface FilaProcesoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  prefijo_corrida: string;
  grupo_planeado_id: string | null;
  area_trabajo_codigo: string | null;
  requiere_archivo_tecnico: boolean;
  requiere_primera_pieza: boolean;
  intervalo_inspeccion_lote: number | null;
  activo: boolean;
  orden: number;
  creado_en: string;
}

export interface FilaGrupoEquipoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
  creado_en: string;
}

export interface FilaGrupoPlaneadoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
  creado_en: string;
}

export interface FilaProximaAccionCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  es_otro: boolean;
  activo: boolean;
  orden: number;
  creado_en: string;
}

export interface FilaCanalCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  es_otro: boolean;
  activo: boolean;
  orden: number;
  creado_en: string;
}

export interface FilaVersionCatalogo {
  id: string;
  entidad: string;
  entidad_id: string;
  version: number;
  datos: Json;
  actor_id: string | null;
  creado_en: string;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

export function filaAMaterial(fila: FilaMaterialCatalogo): MaterialCatalogo {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    activo: fila.activo,
    orden: fila.orden,
    metadata: esObjeto(fila.metadata) ? fila.metadata : {},
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function filaAEspesor(fila: FilaEspesorCatalogo): EspesorCatalogo {
  return {
    id: fila.id,
    materialId: fila.material_id,
    etiqueta: fila.etiqueta,
    espesorMm: typeof fila.espesor_mm === 'string' ? Number(fila.espesor_mm) : fila.espesor_mm,
    activo: fila.activo,
    orden: fila.orden,
    creadoEn: fila.creado_en,
  };
}

export function filaAProceso(fila: FilaProcesoCatalogo): ProcesoCatalogo {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    prefijoCorrida: fila.prefijo_corrida,
    grupoPlaneadoId: fila.grupo_planeado_id,
    areaTrabajoCodigo: fila.area_trabajo_codigo,
    requiereArchivoTecnico: fila.requiere_archivo_tecnico,
    requierePrimeraPieza: fila.requiere_primera_pieza,
    intervaloInspeccionLote: fila.intervalo_inspeccion_lote,
    activo: fila.activo,
    orden: fila.orden,
    creadoEn: fila.creado_en,
  };
}

export function filaAGrupoEquipo(fila: FilaGrupoEquipoCatalogo): GrupoEquipoCatalogo {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    activo: fila.activo,
    orden: fila.orden,
    creadoEn: fila.creado_en,
  };
}

export function filaAGrupoPlaneado(fila: FilaGrupoPlaneadoCatalogo): GrupoPlaneadoCatalogo {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    activo: fila.activo,
    orden: fila.orden,
    creadoEn: fila.creado_en,
  };
}

export function filaAProximaAccion(fila: FilaProximaAccionCatalogo): ProximaAccionCatalogo {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    esOtro: fila.es_otro,
    activo: fila.activo,
    orden: fila.orden,
    creadoEn: fila.creado_en,
  };
}

export function filaACanal(fila: FilaCanalCatalogo): CanalCatalogo {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    esOtro: fila.es_otro,
    activo: fila.activo,
    orden: fila.orden,
    creadoEn: fila.creado_en,
  };
}

export function filaAVersion(fila: FilaVersionCatalogo): VersionCatalogo {
  return {
    id: fila.id,
    entidad: fila.entidad as EntidadCatalogo,
    entidadId: fila.entidad_id,
    version: fila.version,
    datos: esObjeto(fila.datos) ? fila.datos : {},
    actorId: fila.actor_id,
    creadoEn: fila.creado_en,
  };
}
