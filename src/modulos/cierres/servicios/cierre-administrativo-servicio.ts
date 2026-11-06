import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import type {
  CierreOrdenDetalle,
  CierreOrdenResumen,
  ItemCierre,
  MaterialComparativo,
  PanelCierreAdministrativo,
  ProcesoComparativo,
  TendenciaCierre,
} from '@/modulos/cierres/tipos/indice';
import {
  nivelDesviacion,
  porcentajeDesviacion,
  porcentajeMargen,
  promedio,
  redondear,
} from '@/modulos/cierres/utilidades/indice';

type Admin = SupabaseClient<Database>;

const MAX_ORDENES = 200;
const LOTE = 120;

function numero(valor: unknown): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

function lotes<T>(valores: readonly T[], tamano = LOTE): T[][] {
  const resultado: T[][] = [];
  for (let inicio = 0; inicio < valores.length; inicio += tamano) {
    resultado.push(valores.slice(inicio, inicio + tamano));
  }
  return resultado;
}

async function consultarEnLotes<Fila>(
  ids: readonly string[],
  consulta: (lote: string[]) => PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>,
): Promise<Fila[]> {
  const filas: Fila[] = [];
  for (const lote of lotes(ids)) {
    const { data, error } = await consulta(lote);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
  }
  return filas;
}

type FilaOrden = {
  id: string;
  folio: string;
  cliente_id: string | null;
  estado: string;
  estado_sii: string;
  es_interna: boolean;
  fecha_fin: string | null;
  actualizado_en: string;
  propuesta_revision_id: string | null;
};

type FilaPartida = {
  id: string;
  orden_id: string;
  codigo_pieza: string;
  descripcion: string | null;
  cantidad_solicitada: number;
  cantidad_producida: number;
};

type FilaSesion = {
  id: string;
  orden_id: string;
  partida_id: string;
  corrida_id: string | null;
  horas_netas: number;
};

type FilaConsumo = {
  partida_id: string;
  material_id: string | null;
  catalogo_material_id: string | null;
  unidad_base: string | null;
  cantidad_usada: number;
  cantidad_scrap: number;
  costo_unitario_momento: number;
};

type FilaRetrabajo = {
  orden_id: string;
  partida_id: string;
  sesion_id: string | null;
  material_id: string;
  cantidad_usada: number;
  cantidad_scrap: number;
  costo_unitario_momento: number;
  minutos: number;
};

type FilaItemRevision = {
  id: string;
  revision_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  es_descuento: boolean;
};

type FilaRuteo = {
  item_id: string;
  proceso_id: string;
  total_horas: number;
  tarifa_hora: number | null;
  costo_total: number | null;
  secuencia: number;
};

type FilaCostoRevision = {
  revision_id: string;
  categoria: string;
  monto: number;
};

type FilaNota = {
  id: string;
  orden_id: string;
  folio: string;
  es_parcial: boolean;
  fecha_entrega: string;
};

type FilaPartidaNota = {
  nota_entrega_id: string;
  partida_id: string;
  cantidad_entregada: number;
};

type FilaTiempoItem = {
  sesion_id: string;
  partida_id: string;
  piezas: number;
  minutos: number;
};

/** Datos crudos de una orden, ya agrupados, para calcular su cierre. */
export interface DatosOrden {
  orden: FilaOrden;
  cliente: string;
  partidas: FilaPartida[];
  sesiones: FilaSesion[];
  consumos: FilaConsumo[];
  retrabajos: FilaRetrabajo[];
  items: FilaItemRevision[];
  ruteo: FilaRuteo[];
  costos: FilaCostoRevision[];
  entregadoPorPartida: Map<string, number>;
  tiemposPorSesion: Map<string, FilaTiempoItem[]>;
  procesoPorCorrida: Map<string, string>;
  nombreProceso: Map<string, string>;
  nombreMaterial: Map<string, string>;
  unidadMaterial: Map<string, string>;
}

function etiquetaProceso(nombre: string | undefined): string {
  return nombre && nombre.trim().length > 0 ? nombre : 'Proceso';
}

function tarifaDeProceso(ruteo: readonly FilaRuteo[], procesoId: string | null): number {
  if (!procesoId) return 0;
  const filas = ruteo.filter((fila) => fila.proceso_id === procesoId && fila.tarifa_hora !== null);
  if (filas.length === 0) return 0;
  return numero(filas[0]?.tarifa_hora);
}

/** Calcula el cierre comparativo de una orden con sus datos ya cargados. */
export function calcularCierreOrden(datos: DatosOrden): CierreOrdenDetalle {
  const { orden, partidas, sesiones, consumos, retrabajos, items, ruteo, costos } = datos;

  const ruteoPorItem = new Map<string, FilaRuteo[]>();
  for (const fila of ruteo) {
    const lista = ruteoPorItem.get(fila.item_id) ?? [];
    lista.push(fila);
    ruteoPorItem.set(fila.item_id, lista);
  }

  const horasEstimadas = redondear(ruteo.reduce((total, fila) => total + numero(fila.total_horas), 0), 2);
  const costoRuteoEstimado = redondear(
    ruteo.reduce((total, fila) => total + numero(fila.costo_total), 0),
    2,
  );
  const costoMaterialEstimado = redondear(
    costos.filter((costo) => costo.categoria === 'material').reduce((total, costo) => total + numero(costo.monto), 0),
    2,
  );
  const costoOtros = redondear(
    costos.filter((costo) => costo.categoria !== 'material').reduce((total, costo) => total + numero(costo.monto), 0),
    2,
  );
  const costoEstimado = redondear(costoRuteoEstimado + costoMaterialEstimado + costoOtros, 2);
  const venta = redondear(
    items.reduce((total, item) => total + numero(item.cantidad) * numero(item.precio_unitario), 0),
    2,
  );

  // Horas y costo real por sesión. Si la sesión declara tiempos por ítem
  // (corrida integrada), se reparten por ítem y se usa la tarifa de su ruteo.
  const horasPorPartida = new Map<string, number>();
  const costoManoObraPorPartida = new Map<string, number>();
  const horasPorProceso = new Map<string, number>();
  let costoManoObraReal = 0;

  for (const sesion of sesiones) {
    const procesoId = sesion.corrida_id
      ? datos.procesoPorCorrida.get(sesion.corrida_id) ?? null
      : null;
    const tiempos = datos.tiemposPorSesion.get(sesion.id) ?? [];
    if (tiempos.length > 0) {
      let minutosSesion = 0;
      for (const tiempo of tiempos) {
        const horas = numero(tiempo.minutos) / 60;
        minutosSesion += numero(tiempo.minutos);
        const partida = partidas.find((fila) => fila.id === tiempo.partida_id);
        const item = partida
          ? items.find((fila) => fila.codigo === partida.codigo_pieza)
          : undefined;
        const filasItem = item ? ruteoPorItem.get(item.id) ?? [] : [];
        const tarifa = filasItem.length > 0
          ? numero(filasItem[0]?.tarifa_hora)
          : tarifaDeProceso(ruteo, procesoId);
        horasPorPartida.set(tiempo.partida_id, (horasPorPartida.get(tiempo.partida_id) ?? 0) + horas);
        costoManoObraPorPartida.set(
          tiempo.partida_id,
          (costoManoObraPorPartida.get(tiempo.partida_id) ?? 0) + horas * tarifa,
        );
        costoManoObraReal += horas * tarifa;
      }
      if (procesoId) {
        horasPorProceso.set(
          procesoId,
          (horasPorProceso.get(procesoId) ?? 0) + minutosSesion / 60,
        );
      }
    } else {
      const horas = numero(sesion.horas_netas);
      const tarifa = tarifaDeProceso(ruteo, procesoId);
      horasPorPartida.set(sesion.partida_id, (horasPorPartida.get(sesion.partida_id) ?? 0) + horas);
      costoManoObraPorPartida.set(
        sesion.partida_id,
        (costoManoObraPorPartida.get(sesion.partida_id) ?? 0) + horas * tarifa,
      );
      costoManoObraReal += horas * tarifa;
      if (procesoId) {
        horasPorProceso.set(
          procesoId,
          (horasPorProceso.get(procesoId) ?? 0) + horas,
        );
      }
    }
  }

  // Material real por partida (costo congelado) y por material.
  // AUD-07: se agrupa por id resuelto (catálogo nuevo o legado), nunca por
  // nombre; así dos materiales distintos no comparten una etiqueta genérica.
  const materiales = new Map<string, MaterialComparativo>();
  const costoMaterialPorPartida = new Map<string, number>();
  let costoMaterialReal = 0;

  function acumularMaterial(
    clave: string,
    cantidad: number,
    costo: number,
    unidad: string | undefined,
  ): void {
    const actual = materiales.get(clave) ?? {
      clave,
      nombre: datos.nombreMaterial.get(clave) ?? 'Material sin catálogo',
      unidad: datos.unidadMaterial.get(clave) ?? unidad ?? '',
      cantidadReal: 0,
      costoReal: 0,
    };
    actual.cantidadReal += cantidad;
    actual.costoReal += costo;
    materiales.set(clave, actual);
  }

  for (const consumo of consumos) {
    const cantidad = numero(consumo.cantidad_usada) + numero(consumo.cantidad_scrap);
    const costo = cantidad * numero(consumo.costo_unitario_momento);
    const clave = consumo.catalogo_material_id ?? consumo.material_id ?? 'sin-material';
    acumularMaterial(clave, cantidad, costo, consumo.unidad_base ?? undefined);
    costoMaterialPorPartida.set(
      consumo.partida_id,
      (costoMaterialPorPartida.get(consumo.partida_id) ?? 0) + costo,
    );
    costoMaterialReal += costo;
  }

  const horasRetrabajo = redondear(
    retrabajos.reduce((total, fila) => total + numero(fila.minutos) / 60, 0),
    2,
  );
  let costoRetrabajo = 0;

  // AUD-08: el retrabajo suma material (costo congelado) y mano de obra a la
  // tarifa histórica que ya usa C14 para la partida. Se contabiliza una sola vez.
  for (const retrabajo of retrabajos) {
    const cantidad = numero(retrabajo.cantidad_usada) + numero(retrabajo.cantidad_scrap);
    const costoMaterial = cantidad * numero(retrabajo.costo_unitario_momento);
    acumularMaterial(retrabajo.material_id, cantidad, costoMaterial, undefined);
    costoMaterialPorPartida.set(
      retrabajo.partida_id,
      (costoMaterialPorPartida.get(retrabajo.partida_id) ?? 0) + costoMaterial,
    );
    costoMaterialReal += costoMaterial;

    const horas = numero(retrabajo.minutos) / 60;
    const partida = partidas.find((fila) => fila.id === retrabajo.partida_id);
    const item = partida ? items.find((fila) => fila.codigo === partida.codigo_pieza) : undefined;
    const filasItem = item ? ruteoPorItem.get(item.id) ?? [] : [];
    const sesion = retrabajo.sesion_id
      ? sesiones.find((fila) => fila.id === retrabajo.sesion_id)
      : undefined;
    const procesoId = sesion?.corrida_id
      ? datos.procesoPorCorrida.get(sesion.corrida_id) ?? null
      : null;
    const tarifa = filasItem.length > 0
      ? numero(filasItem[0]?.tarifa_hora)
      : tarifaDeProceso(ruteo, procesoId);
    const costoManoObra = horas * tarifa;

    costoManoObraReal += costoManoObra;
    horasPorPartida.set(
      retrabajo.partida_id,
      (horasPorPartida.get(retrabajo.partida_id) ?? 0) + horas,
    );
    costoManoObraPorPartida.set(
      retrabajo.partida_id,
      (costoManoObraPorPartida.get(retrabajo.partida_id) ?? 0) + costoManoObra,
    );
    if (procesoId) {
      horasPorProceso.set(procesoId, (horasPorProceso.get(procesoId) ?? 0) + horas);
    }

    costoRetrabajo += costoMaterial + costoManoObra;
  }

  const horasReales = redondear(
    sesiones.reduce((total, sesion) => total + numero(sesion.horas_netas), 0) + horasRetrabajo,
    2,
  );
  const costoReal = redondear(costoManoObraReal + costoMaterialReal, 2);

  const solicitado = redondear(partidas.reduce((total, partida) => total + numero(partida.cantidad_solicitada), 0), 3);
  const producido = redondear(partidas.reduce((total, partida) => total + numero(partida.cantidad_producida), 0), 3);
  const entregado = redondear(
    partidas.reduce((total, partida) => total + (datos.entregadoPorPartida.get(partida.id) ?? 0), 0),
    3,
  );

  const itemsCierre: ItemCierre[] = items.map((item) => {
    const partida = partidas.find((fila) => fila.codigo_pieza === item.codigo);
    const filasRuteo = ruteoPorItem.get(item.id) ?? [];
    const horasItem = filasRuteo.reduce((total, fila) => total + numero(fila.total_horas), 0);
    const costoItem = filasRuteo.reduce((total, fila) => total + numero(fila.costo_total), 0);
    const horasRealesItem = partida ? horasPorPartida.get(partida.id) ?? 0 : 0;
    const costoRealItem = partida
      ? (costoManoObraPorPartida.get(partida.id) ?? 0)
        + (costoMaterialPorPartida.get(partida.id) ?? 0)
      : 0;
    return {
      codigo: item.codigo,
      descripcion: item.descripcion,
      cantidad: numero(item.cantidad),
      producida: partida ? numero(partida.cantidad_producida) : 0,
      entregada: partida ? datos.entregadoPorPartida.get(partida.id) ?? 0 : 0,
      precioUnitario: numero(item.precio_unitario),
      venta: redondear(numero(item.cantidad) * numero(item.precio_unitario), 2),
      horasEstimadas: redondear(horasItem, 2),
      horasReales: redondear(horasRealesItem, 2),
      costoEstimado: redondear(costoItem, 2),
      costoReal: redondear(costoRealItem, 2),
      desviacionCosto: porcentajeDesviacion(costoRealItem, costoItem),
    };
  });

  const procesosMap = new Map<string, ProcesoComparativo>();
  for (const fila of ruteo) {
    const nombre = etiquetaProceso(datos.nombreProceso.get(fila.proceso_id));
    const actual = procesosMap.get(nombre) ?? {
      nombre,
      horasEstimadas: 0,
      horasReales: 0,
      costoEstimado: 0,
      costoReal: 0,
      desviacionTiempo: null,
    };
    actual.horasEstimadas += numero(fila.total_horas);
    actual.costoEstimado += numero(fila.costo_total);
    procesosMap.set(nombre, actual);
  }
  for (const [procesoId, horas] of horasPorProceso) {
    const nombre = etiquetaProceso(datos.nombreProceso.get(procesoId));
    const actual = procesosMap.get(nombre) ?? {
      nombre,
      horasEstimadas: 0,
      horasReales: 0,
      costoEstimado: 0,
      costoReal: 0,
      desviacionTiempo: null,
    };
    actual.horasReales += horas;
    actual.costoReal += horas * tarifaDeProceso(ruteo, procesoId);
    procesosMap.set(nombre, actual);
  }
  const procesos = [...procesosMap.values()]
    .map((proceso) => ({
      ...proceso,
      horasEstimadas: redondear(proceso.horasEstimadas, 2),
      horasReales: redondear(proceso.horasReales, 2),
      costoEstimado: redondear(proceso.costoEstimado, 2),
      costoReal: redondear(proceso.costoReal, 2),
      desviacionTiempo: porcentajeDesviacion(proceso.horasReales, proceso.horasEstimadas),
    }))
    .sort((primero, segundo) => Math.abs(segundo.costoEstimado) - Math.abs(primero.costoEstimado));

  const desviacionCosto = porcentajeDesviacion(costoReal, costoEstimado);
  const desviacionTiempo = porcentajeDesviacion(horasReales, horasEstimadas);
  const margen = porcentajeMargen(venta, costoReal);
  const cumplimientoEntrega = porcentajeCumplimiento(entregado, solicitado);

  const puntosCriticos: string[] = [];
  if (desviacionTiempo !== null) {
    puntosCriticos.push(
      desviacionTiempo > 0
        ? `Tiempo: ${horasReales.toFixed(1)} h reales contra ${horasEstimadas.toFixed(1)} h cotizadas (${desviacionTiempo.toFixed(0)} % más).`
        : `Tiempo: ${horasReales.toFixed(1)} h reales contra ${horasEstimadas.toFixed(1)} h cotizadas (${Math.abs(desviacionTiempo).toFixed(0)} % menos; estás cotizando de más).`,
    );
  }
  if (costoMaterialEstimado > 0 || costoMaterialReal > 0) {
    const desviacionMaterial = porcentajeDesviacion(costoMaterialReal, costoMaterialEstimado);
    if (desviacionMaterial !== null) {
      puntosCriticos.push(
        desviacionMaterial > 0
          ? `Material: gastaste ${costoMaterialReal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} contra ${costoMaterialEstimado.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} estimados (${desviacionMaterial.toFixed(0)} % más).`
          : `Material: gastaste ${costoMaterialReal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} contra ${costoMaterialEstimado.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} estimados (${Math.abs(desviacionMaterial).toFixed(0)} % menos).`,
      );
    }
  }
  if (margen !== null) {
    puntosCriticos.push(
      margen >= 0
        ? `Margen real: ${margen.toFixed(1)} % sobre la venta.`
        : `Margen real negativo: ${margen.toFixed(1)} %; la orden costó más de lo que se vendió.`,
    );
  }

  return {
    ordenId: orden.id,
    folio: orden.folio,
    cliente: datos.cliente,
    esInterna: orden.es_interna,
    fechaCierre: orden.fecha_fin ?? orden.actualizado_en,
    venta,
    costoEstimado,
    costoReal,
    desviacionCosto,
    horasEstimadas,
    horasReales,
    desviacionTiempo,
    margen,
    solicitado,
    producido,
    entregado,
    cumplimientoEntrega,
    nivel: nivelDesviacion(desviacionCosto),
    items: itemsCierre,
    procesos,
    materiales: [...materiales.values()]
      .map((material) => ({
        ...material,
        cantidadReal: redondear(material.cantidadReal, 3),
        costoReal: redondear(material.costoReal, 2),
      }))
      .sort((primero, segundo) => segundo.costoReal - primero.costoReal),
    horasRetrabajo,
    costoRetrabajo: redondear(costoRetrabajo, 2),
    costoManoObraEstimado: costoRuteoEstimado,
    costoManoObraReal: redondear(costoManoObraReal, 2),
    costoMaterialEstimado,
    costoMaterialReal: redondear(costoMaterialReal, 2),
    costoOtros,
    puntosCriticos,
  };
}

function porcentajeCumplimiento(entregado: number, solicitado: number): number | null {
  if (!Number.isFinite(solicitado) || solicitado <= 0) return null;
  return redondear(Math.min((entregado / solicitado) * 100, 999), 1);
}

/** Carga el cierre comparativo de todas las órdenes terminadas. */
async function cargarCierres(
  admin: Admin,
  opciones: { ordenId?: string; limite?: number } = {},
): Promise<{ panel: PanelCierreAdministrativo; detalles: CierreOrdenDetalle[] }> {
  let consulta = admin
    .from('ordenes_produccion')
    .select('id, folio, cliente_id, estado, estado_sii, es_interna, fecha_fin, actualizado_en, propuesta_revision_id')
    .or('estado.eq.completada,estado_sii.eq.PRODUCCION_COMPLETADA,estado_sii.eq.CERRADA')
    .order('fecha_fin', { ascending: false, nullsFirst: false })
    .limit(opciones.limite ?? MAX_ORDENES);
  if (opciones.ordenId) consulta = consulta.eq('id', opciones.ordenId);
  const { data: ordenesData, error: errorOrdenes } = await consulta;
  if (errorOrdenes) throw new Error(errorOrdenes.message);
  const ordenes = (ordenesData ?? []) as FilaOrden[];
  if (ordenes.length === 0) {
    return {
      panel: {
        resumenes: [],
        tendencia: [],
        promedios: {
          desviacionCosto: null,
          desviacionTiempo: null,
          margen: null,
          ordenesConSobrecosto: 0,
          totalOrdenes: 0,
        },
      },
      detalles: [],
    };
  }

  const ordenIds = ordenes.map((orden) => orden.id);
  const clienteIds = [...new Set(ordenes.map((orden) => orden.cliente_id).filter((id): id is string => Boolean(id)))];
  const revisionIds = [...new Set(ordenes.map((orden) => orden.propuesta_revision_id).filter((id): id is string => Boolean(id)))];

  const [partidas, sesiones, retrabajos, notas, clientes, items, costos] = await Promise.all([
    consultarEnLotes<FilaPartida>(ordenIds, async (lote) => {
      const { data, error } = await admin
        .from('partidas_orden_produccion')
        .select('id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, cantidad_producida')
        .in('orden_id', lote);
      return { data: data as FilaPartida[] | null, error };
    }),
    consultarEnLotes<FilaSesion>(ordenIds, async (lote) => {
      const { data, error } = await admin
        .from('sesiones_trabajo')
        .select('id, orden_id, partida_id, corrida_id, horas_netas')
        .in('orden_id', lote);
      return { data: data as FilaSesion[] | null, error };
    }),
    consultarEnLotes<FilaRetrabajo>(ordenIds, async (lote) => {
      const { data, error } = await admin
        .from('retrabajos_produccion')
        .select('orden_id, partida_id, sesion_id, material_id, cantidad_usada, cantidad_scrap, costo_unitario_momento, minutos')
        .in('orden_id', lote);
      return { data: data as FilaRetrabajo[] | null, error };
    }),
    consultarEnLotes<FilaNota>(ordenIds, async (lote) => {
      const { data, error } = await admin
        .from('notas_entrega')
        .select('id, orden_id, folio, es_parcial, fecha_entrega')
        .in('orden_id', lote);
      return { data: data as FilaNota[] | null, error };
    }),
    consultarEnLotes<{ id: string; nombre_comercial: string }>(clienteIds, async (lote) => {
      const { data, error } = await admin
        .from('clientes')
        .select('id, nombre_comercial')
        .in('id', lote);
      return { data, error };
    }),
    consultarEnLotes<FilaItemRevision>(revisionIds, async (lote) => {
      const { data, error } = await admin
        .from('propuesta_items')
        .select('id, revision_id, codigo, descripcion, cantidad, precio_unitario, es_descuento')
        .in('revision_id', lote);
      return { data: data as FilaItemRevision[] | null, error };
    }),
    consultarEnLotes<FilaCostoRevision>(revisionIds, async (lote) => {
      const { data, error } = await admin
        .from('propuesta_revision_costos')
        .select('revision_id, categoria, monto')
        .in('revision_id', lote);
      return { data: data as FilaCostoRevision[] | null, error };
    }),
  ]);

  const partidaIds = partidas.map((partida) => partida.id);
  const [consumosReales, tiemposReales, partidasNota] = await Promise.all([
    consultarEnLotes<FilaConsumo>(partidaIds, async (lote) => {
      const { data, error } = await admin
        .from('registros_consumo_material')
        .select('partida_id, material_id, catalogo_material_id, unidad_base, cantidad_usada, cantidad_scrap, costo_unitario_momento')
        .in('partida_id', lote);
      return { data: data as FilaConsumo[] | null, error };
    }),
    consultarEnLotes<FilaTiempoItem>(sesiones.map((sesion) => sesion.id), async (lote) => {
      const { data, error } = await admin
        .from('sesion_item_tiempos')
        .select('sesion_id, partida_id, piezas, minutos')
        .in('sesion_id', lote);
      return { data: data as FilaTiempoItem[] | null, error };
    }),
    consultarEnLotes<FilaPartidaNota>(notas.map((nota) => nota.id), async (lote) => {
      const { data, error } = await admin
        .from('partidas_nota_entrega')
        .select('nota_entrega_id, partida_id, cantidad_entregada')
        .in('nota_entrega_id', lote);
      return { data: data as FilaPartidaNota[] | null, error };
    }),
  ]);

  const consumosPorPartida = new Map<string, FilaConsumo[]>();
  for (const consumo of consumosReales) {
    const lista = consumosPorPartida.get(consumo.partida_id) ?? [];
    lista.push(consumo);
    consumosPorPartida.set(consumo.partida_id, lista);
  }
  const tiemposPorSesion = new Map<string, FilaTiempoItem[]>();
  for (const tiempo of tiemposReales) {
    const lista = tiemposPorSesion.get(tiempo.sesion_id) ?? [];
    lista.push(tiempo);
    tiemposPorSesion.set(tiempo.sesion_id, lista);
  }
  const entregadoPorPartida = new Map<string, number>();
  for (const partidaNota of partidasNota) {
    entregadoPorPartida.set(
      partidaNota.partida_id,
      (entregadoPorPartida.get(partidaNota.partida_id) ?? 0) + numero(partidaNota.cantidad_entregada),
    );
  }

  const corridaIds = [...new Set(sesiones.map((sesion) => sesion.corrida_id).filter((id): id is string => Boolean(id)))];
  const corridas = await consultarEnLotes<{ id: string; proceso_id: string }>(corridaIds, async (lote) => {
    const { data, error } = await admin.from('corridas').select('id, proceso_id').in('id', lote);
    return { data: data as { id: string; proceso_id: string }[] | null, error };
  });
  const procesoPorCorrida = new Map(corridas.map((corrida) => [corrida.id, corrida.proceso_id]));

  const ruteo = await consultarEnLotes<FilaRuteo>(items.map((item) => item.id), async (lote) => {
    const { data, error } = await admin
      .from('propuesta_item_ruteo')
      .select('item_id, proceso_id, total_horas, tarifa_hora, costo_total, secuencia')
      .in('item_id', lote);
    return { data: data as FilaRuteo[] | null, error };
  });
  const ruteoPorItem = new Map<string, FilaRuteo[]>();
  for (const fila of ruteo) {
    const lista = ruteoPorItem.get(fila.item_id) ?? [];
    lista.push(fila);
    ruteoPorItem.set(fila.item_id, lista);
  }

  const procesoIds = [...new Set([
    ...corridas.map((corrida) => corrida.proceso_id),
    ...ruteo.map((fila) => fila.proceso_id),
  ])].filter((id): id is string => typeof id === 'string');
  const procesosCatalogo = await consultarEnLotes<{ id: string; nombre: string }>(procesoIds, async (lote) => {
    const { data, error } = await admin.from('catalogo_procesos').select('id, nombre').in('id', lote);
    return { data: data as { id: string; nombre: string }[] | null, error };
  });
  const nombreProceso = new Map(procesosCatalogo.map((proceso) => [proceso.id, proceso.nombre]));

  // AUD-07: resolver el material por su id real. Los consumos nuevos apuntan a
  // catalogo_materiales; los legados y los retrabajos, a materiales. Se
  // consultan ambos catálogos para no depender del origen de la fila.
  const materialIds = [...new Set(
    [
      ...consumosReales.flatMap((consumo) => [consumo.catalogo_material_id, consumo.material_id]),
      ...retrabajos.map((retrabajo) => retrabajo.material_id),
    ].filter((id): id is string => Boolean(id)),
  )];
  const [catalogoMateriales, materialesLegado] = await Promise.all([
    consultarEnLotes<{ id: string; nombre: string; codigo: string; unidad_base: string }>(materialIds, async (lote) => {
      const { data, error } = await admin
        .from('catalogo_materiales')
        .select('id, nombre, codigo, unidad_base')
        .in('id', lote);
      return { data, error };
    }),
    consultarEnLotes<{ id: string; nombre: string; codigo: string; unidad_control: string }>(materialIds, async (lote) => {
      const { data, error } = await admin
        .from('materiales')
        .select('id, nombre, codigo, unidad_control')
        .in('id', lote);
      return { data, error };
    }),
  ]);

  const nombreMaterial = new Map<string, string>();
  const unidadMaterial = new Map<string, string>();
  for (const material of catalogoMateriales) {
    nombreMaterial.set(material.id, `${material.codigo} · ${material.nombre}`);
    unidadMaterial.set(material.id, material.unidad_base);
  }
  for (const material of materialesLegado) {
    if (nombreMaterial.has(material.id)) continue;
    nombreMaterial.set(material.id, `${material.codigo} · ${material.nombre}`);
    unidadMaterial.set(material.id, material.unidad_control);
  }
  const clientePorId = new Map(clientes.map((cliente) => [cliente.id, cliente.nombre_comercial]));

  const detalles: CierreOrdenDetalle[] = ordenes.map((orden) => {
    const partidasOrden = partidas.filter((partida) => partida.orden_id === orden.id);
    const itemsOrden = items.filter((item) => item.revision_id === orden.propuesta_revision_id);
    const idsItems = new Set(itemsOrden.map((item) => item.id));
    return calcularCierreOrden({
      orden,
      cliente: orden.cliente_id ? clientePorId.get(orden.cliente_id) ?? 'Cliente' : 'Sin cliente',
      partidas: partidasOrden,
      sesiones: sesiones.filter((sesion) => sesion.orden_id === orden.id),
      consumos: partidasOrden.flatMap((partida) => consumosPorPartida.get(partida.id) ?? []),
      retrabajos: retrabajos.filter((retrabajo) => retrabajo.orden_id === orden.id),
      items: itemsOrden,
      ruteo: [...idsItems].flatMap((id) => ruteoPorItem.get(id) ?? []),
      costos: costos.filter((costo) => costo.revision_id === orden.propuesta_revision_id),
      entregadoPorPartida,
      tiemposPorSesion,
      procesoPorCorrida,
      nombreProceso,
      nombreMaterial,
      unidadMaterial,
    });
  });

  const resumenes: CierreOrdenResumen[] = detalles.map((detalle) => ({
    ordenId: detalle.ordenId,
    folio: detalle.folio,
    cliente: detalle.cliente,
    esInterna: detalle.esInterna,
    fechaCierre: detalle.fechaCierre,
    venta: detalle.venta,
    costoEstimado: detalle.costoEstimado,
    costoReal: detalle.costoReal,
    desviacionCosto: detalle.desviacionCosto,
    horasEstimadas: detalle.horasEstimadas,
    horasReales: detalle.horasReales,
    desviacionTiempo: detalle.desviacionTiempo,
    margen: detalle.margen,
    solicitado: detalle.solicitado,
    producido: detalle.producido,
    entregado: detalle.entregado,
    cumplimientoEntrega: detalle.cumplimientoEntrega,
    nivel: detalle.nivel,
  }));

  const tendencia: TendenciaCierre[] = [...resumenes]
    .sort((primero, segundo) => (segundo.fechaCierre ?? '').localeCompare(primero.fechaCierre ?? ''))
    .slice(0, 20)
    .reverse()
    .map((resumen) => ({
      folio: resumen.folio,
      fechaCierre: resumen.fechaCierre,
      desviacionCosto: resumen.desviacionCosto,
      desviacionTiempo: resumen.desviacionTiempo,
      margen: resumen.margen,
      costoEstimado: resumen.costoEstimado,
      costoReal: resumen.costoReal,
    }));

  const panel: PanelCierreAdministrativo = {
    resumenes,
    tendencia,
    promedios: {
      desviacionCosto: promedio(resumenes.slice(0, 20).map((resumen) => resumen.desviacionCosto)),
      desviacionTiempo: promedio(resumenes.slice(0, 20).map((resumen) => resumen.desviacionTiempo)),
      margen: promedio(resumenes.slice(0, 20).map((resumen) => resumen.margen)),
      ordenesConSobrecosto: resumenes.filter((resumen) => resumen.nivel === 'sobrecosto').length,
      totalOrdenes: resumenes.length,
    },
  };
  return { panel, detalles };
}

/** Carga el cierre comparativo de todas las órdenes terminadas. */
export async function obtenerPanelCierresServicio(
  admin: Admin,
  opciones: { ordenId?: string; limite?: number } = {},
): Promise<PanelCierreAdministrativo> {
  return (await cargarCierres(admin, opciones)).panel;
}

/** Cierre comparativo de una sola orden. */
export async function obtenerCierreOrdenServicio(
  admin: Admin,
  ordenId: string,
): Promise<CierreOrdenDetalle | null> {
  const resultado = await cargarCierres(admin, { ordenId, limite: 1 });
  return resultado.detalles[0] ?? null;
}
