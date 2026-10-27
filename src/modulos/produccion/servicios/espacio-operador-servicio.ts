import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/compartido/tipos/supabase';
import { listarArchivosFichaOrden } from '@/modulos/ordenes/servicios/archivos-ficha-servicio';
import { esSnapshotOrdenSii } from '@/modulos/ordenes/tipos/orden-sii';
import { COLUMNAS_ORDEN_OPERATIVA, filaAOrdenOperativa, filaAPartida } from '@/modulos/ordenes/tipos/ordenes';
import {
  COLUMNAS_SESION_TRABAJO_OPERATIVA,
  filaASesionTrabajo,
  type SesionTrabajo,
} from '@/modulos/produccion/tipos/produccion';
import {
  filaAProgramacionArea,
  type ProgramacionArea,
} from '@/modulos/planeacion/tipos/indice';
import {
  ETIQUETAS_URGENCIA,
  agruparProcesosPorArea,
  construirDiasCalendario,
  derivarColumnaProceso,
  derivarUrgenciaProceso,
  diasEntreFechas,
  etiquetasProceso,
  filaAReclamoProceso,
  inicioSemana,
  resumirEspacioOperador,
  resolverAreaRaiz,
  sumarDias,
  type AreaEspacioOperador,
  type ArchivoProceso,
  type DiaCalendarioOperador,
  type MaterialProceso,
  type ProcesoEspacioOperador,
  type ProcesoRuteoResumen,
  type ReclamoProcesoOperador,
  type ResumenEspacioOperador,
  type SesionProceso,
} from '@/modulos/produccion/tipos/espacio-operador';
import { obtenerMotivosPausaServicio, type MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';

type Admin = SupabaseClient<Database>;
type FilaPartida = Tables<'partidas_orden_produccion'>;
type FilaMeta = Tables<'metas_proceso_partida'>;
type FilaRecursoResumen = { id: string; codigo: string; nombre: string };

export interface DatosEspacioOperador {
  procesos: ProcesoEspacioOperador[];
  areas: AreaEspacioOperador[];
  motivosPausa: MotivoPausaCatalogo[];
  responsables: Record<string, string>;
  resumen: ResumenEspacioOperador;
  hoy: string;
  /** DÃ­as de la semana visible (lunes a domingo) con la carga reclamada. */
  dias: DiaCalendarioOperador[];
  gruposArea: ReturnType<typeof agruparProcesosPorArea>;
}

const TAMANO_PAGINA = 500;

function fechaIsoLocal(ahora: Date = new Date()): string {
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Horas de una operaciÃ³n: programaciÃ³n vigente o reparto del tiempo estimado. */
export function estimarHorasProceso(
  partida: Pick<FilaPartida, 'tiempo_estimado_minutos'>,
  programacion: Pick<ProgramacionArea, 'horasEstimadas'> | null,
  totalMetas: number,
  tieneMeta: boolean,
): number {
  if (programacion && programacion.horasEstimadas > 0) {
    return Math.round(programacion.horasEstimadas * 100) / 100;
  }
  const horasPartida = Number(partida.tiempo_estimado_minutos) / 60;
  const horas = tieneMeta ? horasPartida / Math.max(totalMetas, 1) : horasPartida;
  return Math.max(Math.round(horas * 100) / 100, 0.25);
}

async function obtenerFilasEnLotes<T>(
  ids: readonly string[],
  consulta: (lote: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tamanoLote = 150,
): Promise<T[]> {
  const filas: T[] = [];
  for (let inicio = 0; inicio < ids.length; inicio += tamanoLote) {
    const lote = ids.slice(inicio, inicio + tamanoLote);
    const { data, error } = await consulta(lote);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
  }
  return filas;
}

async function obtenerSesionesDeOrdenes(
  cliente: Admin,
  ordenIds: readonly string[],
): Promise<SesionTrabajo[]> {
  const filas: ReturnType<typeof filaASesionTrabajo>[] = [];
  const vistas = new Set<string>();
  for (let inicio = 0; inicio < ordenIds.length; inicio += 100) {
    const lote = ordenIds.slice(inicio, inicio + 100);
    for (let pagina = 0; ; pagina += TAMANO_PAGINA) {
      const { data, error } = await cliente
        .from('sesiones_trabajo')
        .select(COLUMNAS_SESION_TRABAJO_OPERATIVA)
        .in('orden_id', lote)
        .order('creado_en')
        .order('id')
        .range(pagina, pagina + TAMANO_PAGINA - 1);
      if (error) throw new Error(`No se pudieron cargar las sesiones: ${error.message}`);
      for (const fila of data ?? []) {
        if (vistas.has(fila.id)) continue;
        vistas.add(fila.id);
        filas.push(filaASesionTrabajo(fila));
      }
      if (!data || data.length < TAMANO_PAGINA) break;
    }
  }
  return filas;
}

async function obtenerAvancesDeMetas(
  cliente: Admin,
  metaIds: readonly string[],
): Promise<Map<string, number>> {
  const hechoPorMeta = new Map<string, number>();
  for (let inicio = 0; inicio < metaIds.length; inicio += 150) {
    const lote = metaIds.slice(inicio, inicio + 150);
    for (let pagina = 0; ; pagina += 1000) {
      const { data, error } = await cliente
        .from('registros_avance_partida')
        .select('meta_proceso_id, cantidad_producida')
        .in('meta_proceso_id', lote)
        .order('id')
        .range(pagina, pagina + 999);
      if (error) throw new Error(`No se pudo cargar el avance por proceso: ${error.message}`);
      for (const avance of data ?? []) {
        if (!avance.meta_proceso_id) continue;
        hechoPorMeta.set(
          avance.meta_proceso_id,
          (hechoPorMeta.get(avance.meta_proceso_id) ?? 0) + Number(avance.cantidad_producida),
        );
      }
      if (!data || data.length < 1000) break;
    }
  }
  return hechoPorMeta;
}

// Únicamente adjuntos originales del RFQ o de la propuesta aceptada.
// Los PDF y documentos generados no tienen una clase técnica permitida.
const CLASES_ADJUNTOS_OPERATIVOS = new Set([
  'CAD', 'DIBUJO', 'IMAGEN', 'ESPECIFICACIONES', 'OTROS', 'TECNICO', 'TÉCNICO',
]);

async function obtenerArchivosDeOrdenes(
  cliente: Admin,
  ordenIds: readonly string[],
): Promise<Map<string, ArchivoProceso[]>> {
  const porOrden = new Map<string, ArchivoProceso[]>();
  if (ordenIds.length === 0) return porOrden;

  // La lista de documentos autorizados proviene de la revisión congelada,
  // no de una carpeta RFQ o propuesta que pudo cambiar después de aprobarse.
  const ordenes = await obtenerFilasEnLotes<
    Pick<Tables<'ordenes_produccion'>, 'id' | 'snapshot_json' | 'propuesta_revision_id'>
  >(ordenIds, async (lote) => {
    const { data, error } = await cliente
      .from('ordenes_produccion')
      .select('id, snapshot_json, propuesta_revision_id')
      .in('id', lote);
    return { data, error };
  });

  const archivosAprobados = await Promise.all(
    ordenes.map(async (orden) => {
      const snapshot = esSnapshotOrdenSii(orden.snapshot_json)
        ? orden.snapshot_json
        : null;
      const archivos = await listarArchivosFichaOrden(cliente, {
        snapshot,
        propuestaRevisionId: orden.propuesta_revision_id,
      });
      return {
        ordenId: orden.id,
        archivos: archivos.filter((archivo) =>
          archivo.disponible &&
          (archivo.origen === 'RFQ' || archivo.origen.startsWith('Propuesta')) &&
          archivo.tipo !== '-',
        ),
      };
    }),
  );

  const ids = [...new Set(
    archivosAprobados.flatMap(({ archivos }) => archivos.map((archivo) => archivo.archivoId)),
  )];
  if (ids.length === 0) return porOrden;

  // Consulta en lista blanca: no se transmiten rutas de Storage ni buckets.
  const filas = await obtenerFilasEnLotes<
    Pick<Tables<'archivos'>,
      'id' | 'nombre_original' | 'mime' | 'tamano_bytes' | 'clase' | 'creado_en'
    >
  >(ids, async (lote) => {
    const { data, error } = await cliente
      .from('archivos')
      .select('id, nombre_original, mime, tamano_bytes, clase, creado_en')
      .in('id', lote)
      .eq('vigente', true)
      .is('retirado_en', null);
    return { data, error };
  });
  const porId = new Map(filas.map((fila) => [fila.id, fila] as const));

  for (const { ordenId, archivos } of archivosAprobados) {
    const resultado: ArchivoProceso[] = [];
    for (const archivo of archivos) {
      const fila = porId.get(archivo.archivoId);
      if (!fila || !CLASES_ADJUNTOS_OPERATIVOS.has((fila.clase ?? '').trim().toUpperCase())) {
        continue;
      }
      resultado.push({
        id: fila.id,
        nombre: archivo.nombreOriginal ?? fila.nombre_original ?? 'Archivo adjunto',
        mime: fila.mime,
        tamanoBytes: Number(fila.tamano_bytes),
        clase: fila.clase,
        creadoEn: fila.creado_en,
      });
    }
    porOrden.set(ordenId, resultado);
  }
  return porOrden;
}

function sesionResumen(
  sesion: SesionTrabajo,
  responsables: Readonly<Record<string, string>>,
): SesionProceso {
  return {
    id: sesion.id,
    operadorId: sesion.operadorId,
    operadorNombre: responsables[sesion.operadorId] ?? 'Operador',
    estadoSesion: sesion.estadoSesion,
    fechaInicio: sesion.fechaInicio,
    fechaFin: sesion.fechaFin,
    piezasProducidas: sesion.piezasProducidas,
    horasNetas: sesion.horasNetas,
    motivoPausa: sesion.motivoPausaCodigo ?? sesion.motivoPausa,
    motivoPausaNota: sesion.motivoPausaNota,
    notas: sesion.notas,
    verificacionCompleta: sesion.verificacionInicio !== null,
  };
}

/**
 * Carga y deriva el espacio de operador completo sin N+1. El servidor es la
 * Ãºnica fuente de verdad: la UI no inventa columnas ni capacidades.
 */
export async function obtenerEspacioOperadorServicio(
  cliente: Admin,
  operadorId: string | null,
  hoy: string = fechaIsoLocal(),
): Promise<DatosEspacioOperador> {
  const [
    resultadoOrdenes,
    resultadoReclamos,
    resultadoAreas,
    resultadoRecursos,
    resultadoClientes,
    motivosPausa,
  ] = await Promise.all([
    cliente
      .from('ordenes_produccion')
      .select(COLUMNAS_ORDEN_OPERATIVA)
      .neq('estado', 'cancelada')
      .is('archivada_en', null)
      .order('fecha_compromiso'),
    cliente.from('reclamos_proceso_operador').select('*').eq('estado', 'activo'),
    cliente
      .from('areas_trabajo_config')
      .select('codigo, nombre, padre_codigo, area_planeacion, color_hex')
      .order('orden')
      .order('nombre'),
    cliente.from('recursos_planeacion').select('id, codigo, nombre').order('codigo'),
    cliente.from('clientes').select('id, razon_social, nombre_comercial'),
    obtenerMotivosPausaServicio(cliente),
  ]);

  const error = [
    resultadoOrdenes.error,
    resultadoReclamos.error,
    resultadoAreas.error,
    resultadoRecursos.error,
    resultadoClientes.error,
  ].find((actual) => actual !== null);
  if (error) {
    throw new Error(`No se pudo cargar el espacio de operador: ${error.message}`);
  }

  const ordenes = (resultadoOrdenes.data ?? []).map(filaAOrdenOperativa);
  const ordenIds = ordenes.map((orden) => orden.id);

  // Solo se cargan partidas, metas y programaciones de las Ã³rdenes vigentes:
  // las tablas histÃ³ricas crecen con cada ciclo y no deben entrar al tablero.
  const filasPartidas = await obtenerFilasEnLotes<FilaPartida>(ordenIds, async (lote) => {
    const { data, error: errorLote } = await cliente
      .from('partidas_orden_produccion')
      .select('*')
      .in('orden_id', lote)
      .order('creado_en');
    return { data, error: errorLote };
  });
  const partidaIds = filasPartidas.map((partida) => partida.id);

  const [filasMetas, filasProgramaciones] = await Promise.all([
    obtenerFilasEnLotes<FilaMeta>(partidaIds, async (lote) => {
      const { data, error: errorLote } = await cliente
        .from('metas_proceso_partida')
        .select('*')
        .in('partida_id', lote)
        .order('secuencia');
      return { data, error: errorLote };
    }),
    obtenerFilasEnLotes<Tables<'programacion_areas'>>(partidaIds, async (lote) => {
      const { data, error: errorLote } = await cliente
        .from('programacion_areas')
        .select('*')
        .in('partida_id', lote)
        .neq('estado_planeacion', 'cancelada')
        .order('secuencia');
      return { data, error: errorLote };
    }),
  ]);

  const partidas = filasPartidas.map(filaAPartida);
  const filasPartidasPorId = new Map(filasPartidas.map((fila) => [fila.id, fila] as const));
  const ordenesPorId = new Map(ordenes.map((orden) => [orden.id, orden]));
  const ordenesVigentes = new Set(ordenIds);
  const partidasVigentes = partidas.filter((partida) => ordenesVigentes.has(partida.ordenId));

  const metasPorPartida = new Map<string, FilaMeta[]>();
  for (const meta of filasMetas) {
    const actuales = metasPorPartida.get(meta.partida_id) ?? [];
    actuales.push(meta);
    metasPorPartida.set(meta.partida_id, actuales);
  }

  const reclamos: ReclamoProcesoOperador[] = (resultadoReclamos.data ?? []).map(filaAReclamoProceso);
  const reclamoPorOperacion = new Map<string, ReclamoProcesoOperador>();
  for (const reclamo of reclamos) {
    reclamoPorOperacion.set(`${reclamo.partidaId}:${reclamo.metaProcesoId ?? ''}`, reclamo);
  }

  const programacionesPorPartida = new Map<string, ProgramacionArea[]>();
  for (const fila of filasProgramaciones) {
    const programacion = filaAProgramacionArea(fila);
    const actuales = programacionesPorPartida.get(programacion.partidaId) ?? [];
    actuales.push(programacion);
    programacionesPorPartida.set(programacion.partidaId, actuales);
  }

  const recursosPorId = new Map<string, FilaRecursoResumen>(
    (resultadoRecursos.data ?? []).map((recurso) => [recurso.id, recurso as FilaRecursoResumen] as const),
  );
  const clientesPorId = new Map(
    (resultadoClientes.data ?? []).map((cliente) => [cliente.id, cliente] as const),
  );

  const areas: AreaEspacioOperador[] = (resultadoAreas.data ?? []).map((area) => ({
    codigo: area.codigo,
    nombre: area.nombre,
    padreCodigo: area.padre_codigo,
    areaPlaneacion: area.area_planeacion,
    colorHex: area.color_hex,
  }));
  const areasPorCodigo = new Map(areas.map((area) => [area.codigo, area]));

  const [sesiones, hechoPorMeta, archivosPorOrden] = await Promise.all([
    obtenerSesionesDeOrdenes(cliente, ordenIds),
    obtenerAvancesDeMetas(cliente, filasMetas.map((meta) => meta.id)),
    obtenerArchivosDeOrdenes(cliente, ordenIds),
  ]);

  const sesionesPorProgramacion = new Map<string, SesionTrabajo[]>();
  const sesionesPorPartida = new Map<string, SesionTrabajo[]>();
  for (const sesion of sesiones) {
    const porProgramacion = sesionesPorProgramacion.get(sesion.programacionId) ?? [];
    porProgramacion.push(sesion);
    sesionesPorProgramacion.set(sesion.programacionId, porProgramacion);
    const porPartida = sesionesPorPartida.get(sesion.partidaId) ?? [];
    porPartida.push(sesion);
    sesionesPorPartida.set(sesion.partidaId, porPartida);
  }

  const idsOperadores = [
    ...new Set([
      ...reclamos.map((reclamo) => reclamo.operadorId),
      ...sesiones.map((sesion) => sesion.operadorId),
      ...partidas.map((partida) => partida.operadorAsignadoId).filter((id): id is string => id !== null),
    ]),
  ];
  const responsables: Record<string, string> = {};
  if (idsOperadores.length > 0) {
    const operadores = await obtenerFilasEnLotes<Pick<Tables<'usuarios'>, 'id' | 'nombre_completo'>>(
      idsOperadores,
      async (lote) => {
        const { data, error } = await cliente
          .from('usuarios')
          .select('id, nombre_completo')
          .in('id', lote);
        return { data, error };
      },
    );
    for (const operador of operadores) responsables[operador.id] = operador.nombre_completo;
  }

  const idsMateriales = [
    ...new Set(
      partidasVigentes
        .map((partida) => partida.materialId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const materialesPorId = new Map<string, MaterialProceso>();
  if (idsMateriales.length > 0) {
    const materiales = await obtenerFilasEnLotes<Pick<Tables<'catalogo_materiales'>, 'id' | 'codigo' | 'nombre' | 'unidad_base' | 'ancho_mm' | 'largo_mm'>>(
      idsMateriales,
      async (lote) => {
        const { data, error } = await cliente
          .from('catalogo_materiales')
          .select('id, codigo, nombre, unidad_base, ancho_mm, largo_mm')
          .in('id', lote);
        return { data, error };
      },
    );
    for (const material of materiales) {
      materialesPorId.set(material.id, {
        id: material.id,
        codigo: material.codigo,
        nombre: material.nombre,
        unidadBase: material.unidad_base,
        anchoMm: material.ancho_mm === null ? null : Number(material.ancho_mm),
        largoMm: material.largo_mm === null ? null : Number(material.largo_mm),
      });
    }
  }

  const procesos: ProcesoEspacioOperador[] = [];

  for (const partida of partidasVigentes) {
    const orden = ordenesPorId.get(partida.ordenId);
    const filaPartida = filasPartidasPorId.get(partida.id);
    if (!orden || !filaPartida) continue;

    const metas = metasPorPartida.get(partida.id) ?? [];
    const programaciones = [...(programacionesPorPartida.get(partida.id) ?? [])]
      .sort((primera, segunda) => segunda.actualizadoEn.localeCompare(primera.actualizadoEn));
    const programacionHeredada = programaciones.find(
      (programacion) => programacion.metaProcesoId === null,
    ) ?? null;
    const areaCodigo = partida.areaTrabajoCodigo ?? null;
    const area = areaCodigo ? areasPorCodigo.get(areaCodigo) ?? null : null;
    const areaRaiz = resolverAreaRaiz(areas, areaCodigo);
    const cliente = clientesPorId.get(orden.clienteId);
    const archivos = archivosPorOrden.get(orden.id) ?? [];
    const sesionesPartida = sesionesPorPartida.get(partida.id) ?? [];

    const operaciones = metas.length > 0
      ? metas.map((meta) => ({ meta, nombre: meta.nombre, secuencia: Number(meta.secuencia), metaPiezas: Number(meta.meta_piezas) }))
      : [{
        meta: null as FilaMeta | null,
        nombre: 'Proceso completo',
        secuencia: 1,
        metaPiezas: partida.cantidadSolicitada,
      }];

    const ultimaSecuencia = operaciones.reduce(
      (maxima, operacion) => Math.max(maxima, operacion.secuencia),
      0,
    );

    const procesosRuteo: ProcesoRuteoResumen[] = operaciones.map((operacion) => {
      const hecho = operacion.meta ? (hechoPorMeta.get(operacion.meta.id) ?? 0) : partida.cantidadProducida;
      return {
        id: operacion.meta?.id ?? `${partida.id}:sin-proceso`,
        secuencia: operacion.secuencia,
        nombre: operacion.nombre,
        metaPiezas: operacion.metaPiezas,
        hechoPiezas: hecho,
        completado: hecho >= operacion.metaPiezas,
      };
    });

    for (const operacion of operaciones) {
      const metaProcesoId = operacion.meta?.id ?? null;
      const claveOperacion = `${partida.id}:${metaProcesoId ?? ''}`;
      const programacionOperacion = metaProcesoId
        ? programaciones.find((actual) => actual.metaProcesoId === metaProcesoId) ?? null
        : null;
      // C9.0: la fila heredada (sin operaciÃ³n) sigue siendo vÃ¡lida mientras la
      // partida tenga una sola operaciÃ³n; el reclamo la adopta al preparar.
      const programacion = programacionOperacion
        ?? (metaProcesoId === null || metas.length === 1 ? programacionHeredada : null);
      const sesionesOperacion = programacion
        ? sesionesPorProgramacion.get(programacion.id) ?? []
        : sesionesPartida;
      const sesionesOrdenadas = [...sesionesOperacion].sort((primera, segunda) => (
        segunda.fechaInicio.localeCompare(primera.fechaInicio)
        || segunda.id.localeCompare(primera.id)
      ));
      const sesionActiva = sesionesOrdenadas.find((sesion) => sesion.estadoSesion === 'activa') ?? null;
      const ultimaSesion = sesionesOrdenadas[0] ?? null;
      const sesionPausada = ultimaSesion?.estadoSesion === 'pausada';
      const reclamo = reclamoPorOperacion.get(claveOperacion) ?? null;
      const reclamadoPorMi = operadorId !== null && reclamo?.operadorId === operadorId;
      const hechoPiezas = operacion.meta
        ? (hechoPorMeta.get(operacion.meta.id) ?? 0)
        : partida.cantidadProducida;
      const pendientePiezas = Math.max(operacion.metaPiezas - hechoPiezas, 0);
      const procesoCompleto = operacion.meta
        ? hechoPiezas >= operacion.metaPiezas
        : partida.cantidadProducida >= partida.cantidadSolicitada;
      const porcentaje = operacion.metaPiezas > 0
        ? Math.min((hechoPiezas / operacion.metaPiezas) * 100, 100)
        : 0;
      const horasEstimadas = estimarHorasProceso(
        filaPartida,
        programacion,
        operaciones.length,
        metaProcesoId !== null,
      );
      const columna = derivarColumnaProceso({
        estadoOrden: orden.estado,
        estadoSii: orden.estadoSii,
        procesoCompleto,
        sesionActiva: sesionActiva !== null,
        sesionPausada,
        programacionEstado: programacion?.estadoPlaneacion ?? null,
      });
      const urgencia = derivarUrgenciaProceso(orden.fechaCompromiso, orden.prioridad, hoy);
      const ordenIniciable = orden.estado === 'programada'
        || orden.estado === 'pausada'
        || orden.estado === 'en_proceso';
      const pausado = sesionPausada || programacion?.estadoPlaneacion === 'bloqueada';

      let motivoNoInicia: string | null = null;
      if (procesoCompleto) motivoNoInicia = 'Proceso completado';
      else if (operadorId === null) motivoNoInicia = 'Vista de solo lectura';
      else if (!reclamo) motivoNoInicia = 'Reclama el proceso para iniciar';
      else if (!reclamadoPorMi) motivoNoInicia = 'Otro operador tiene el proceso';
      else if (orden.estado === 'borrador' || orden.estadoSii === 'CONFIRMADA') {
        motivoNoInicia = 'La orden aÃºn no se libera a Bandeja';
      } else if (!ordenIniciable) motivoNoInicia = 'La orden ya no estÃ¡ activa';
      else if (sesionActiva) motivoNoInicia = 'Ya hay una sesiÃ³n activa en este proceso';
      else if (pausado) motivoNoInicia = 'Proceso pausado: reanuda la sesiÃ³n';

      const puedeReanudar = operadorId !== null
        && reclamadoPorMi
        && sesionPausada
        && programacion?.estadoPlaneacion === 'bloqueada'
        && (orden.estado === 'pausada' || orden.estado === 'en_proceso');

      const proceso: ProcesoEspacioOperador = {
        id: claveOperacion,
        ordenId: orden.id,
        folioOrden: orden.folioSii ?? orden.folio,
        folioSii: orden.folioSii,
        estadoOrden: orden.estado,
        estadoSii: orden.estadoSii,
        prioridad: orden.prioridad,
        clienteNombre: cliente?.nombre_comercial || cliente?.razon_social || 'Cliente',
        fechaCompromiso: orden.fechaCompromiso,
        fechaOperativa: orden.fechaOperativa ?? orden.fechaCompromiso,
        notas: orden.notas,
        partidaId: partida.id,
        codigoPieza: partida.codigoPieza,
        descripcion: partida.descripcion,
        cantidadSolicitada: partida.cantidadSolicitada,
        cantidadProducida: partida.cantidadProducida,
        unidadMedida: partida.unidadMedida,
        esExterno: filaPartida.es_externo,
        proveedorExterno: filaPartida.proveedor_externo,
        material: partida.materialId ? materialesPorId.get(partida.materialId) ?? null : null,
        areaCodigo,
        areaNombre: area?.nombre ?? (areaCodigo ?? 'Sin Ã¡rea'),
        areaMacro: areaRaiz?.codigo ?? null,
        areaColor: area?.colorHex ?? null,
        metaProcesoId,
        procesoNombre: operacion.nombre,
        secuencia: operacion.secuencia,
        metaPiezas: operacion.metaPiezas,
        hechoPiezas,
        pendientePiezas,
        porcentaje,
        esFinal: operacion.secuencia === ultimaSecuencia,
        horasEstimadas,
        programacion: programacion
          ? {
            id: programacion.id,
            fecha: programacion.fechaProgramada,
            turno: programacion.turno,
            estadoPlaneacion: programacion.estadoPlaneacion,
            horasEstimadas: programacion.horasEstimadas,
            recursoId: programacion.recursoId,
            recursoCodigo: recursosPorId.get(programacion.recursoId)?.codigo ?? null,
            recursoNombre: recursosPorId.get(programacion.recursoId)?.nombre ?? null,
            actualizadoEn: programacion.actualizadoEn,
          }
          : null,
        reclamo,
        reclamadoPorMi,
        nombreReclamante: reclamo ? responsables[reclamo.operadorId] ?? 'Operador' : null,
        sesionActiva: sesionActiva ? sesionResumen(sesionActiva, responsables) : null,
        ultimaSesion: ultimaSesion ? sesionResumen(ultimaSesion, responsables) : null,
        sesiones: sesionesOrdenadas.map((sesion) => sesionResumen(sesion, responsables)),
        procesosRuteo,
        archivos,
        columna,
        urgencia,
        etiquetas: [],
        puedeIniciar: motivoNoInicia === null,
        puedeReanudar,
        motivoNoInicia,
      };
      proceso.etiquetas = etiquetasProceso(proceso);
      procesos.push(proceso);
    }
  }

  // Orden estable: urgencia, fecha compromiso y secuencia del ruteo.
  const pesoUrgencia = { vencida: 0, urgente: 1, proxima: 2, normal: 3 } as const;
  procesos.sort((primero, segundo) => (
    pesoUrgencia[primero.urgencia] - pesoUrgencia[segundo.urgencia]
    || primero.fechaCompromiso.localeCompare(segundo.fechaCompromiso)
    || primero.folioOrden.localeCompare(segundo.folioOrden)
    || primero.secuencia - segundo.secuencia
  ));

  const fechasSemana = Array.from({ length: 7 }, (_, indice) => sumarDias(inicioSemana(hoy), indice));
  // La jornada de 8 h es por operador: las reservas de otros no consumen su dÃ­a.
  // En la vista de administrador (operadorId null) se muestra la carga completa.
  const procesosParaJornada = operadorId === null
    ? procesos
    : procesos.filter((proceso) => proceso.reclamo === null || proceso.reclamadoPorMi);
  const dias = construirDiasCalendario(fechasSemana, procesosParaJornada, hoy);
  const gruposArea = agruparProcesosPorArea(procesos, areas);
  const resumen = resumirEspacioOperador(procesos, hoy);
  resumen.horasReclamadasHoy = Math.round(
    procesosParaJornada.reduce(
      (total, proceso) => (
        proceso.reclamo?.fecha === hoy ? total + proceso.reclamo.horasEstimadas : total
      ),
      0,
    ) * 100,
  ) / 100;

  return {
    procesos,
    areas,
    motivosPausa,
    responsables,
    resumen,
    hoy,
    dias,
    gruposArea,
  };
}

/** Etiqueta legible de urgencia para la UI y las pruebas. */
export function etiquetaUrgencia(urgencia: keyof typeof ETIQUETAS_URGENCIA): string {
  return ETIQUETAS_URGENCIA[urgencia];
}

/** DÃ­as restantes para la fecha compromiso (negativo = vencida). */
export function diasParaCompromiso(fechaCompromiso: string, hoy: string): number {
  return diasEntreFechas(hoy, fechaCompromiso);
}

