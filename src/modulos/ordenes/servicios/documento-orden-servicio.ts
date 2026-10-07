import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { calcularTotalesCotizacion } from '@/modulos/pipeline/servicios/calcular-totales-cotizacion';
import { obtenerConfiguracionGeneral } from '@/modulos/configuracion/servicios/configuracion-servicio';
import type { LineaCotizacionEntrada } from '@/modulos/pipeline/tipos/indice';

/** Documento de orden (ORD-03) y Orden de Servicio imprimible (DOC-01/03). */
export type DocumentoOrden = {
  empresa: {
    nombre: string;
    razonSocial: string;
    rfc: string;
    direccion: string;
    telefono: string;
    email: string;
  };
  orden: {
    folio: string;
    estado: string;
    prioridad: string;
    fechaCompromiso: string;
    esInterna: boolean;
    folioCotizacion: string | null;
    poCliente: string | null;
    notas: string | null;
    nombreContacto: string | null;
    creadoEn: string;
  };
  cliente: { razonSocial: string; rfc: string | null } | null;
  partidas: {
    codigoPieza: string;
    descripcion: string | null;
    cantidadSolicitada: number;
    cantidadProducida: number;
    unidadMedida: string;
    areaTrabajoCodigo: string | null;
    procesos: string[];
    tiempoEstimadoMinutos: number;
    tiempoRealMinutos: number;
  }[];
  lineas: { descripcion: string; cantidad: number; precioUnitario: number; esDescuento: boolean }[];
  totales: { subtotal: number; descuento: number; iva: number; ivaPorcentaje: number; total: number; moneda: 'MXN' | 'USD' };
};

/** Detalle comercial congelado en `ordenes_produccion.snapshot_json` (§5.4). */
export type ComercialSnapshot = {
  lineas: DocumentoOrden['lineas'];
  totales: DocumentoOrden['totales'];
  folioCotizacion: string | null;
  nombreContacto: string | null;
  poCliente: string | null;
  notas: string | null;
};

function aNumero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
  }
  return null;
}

function aTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null;
}

/**
 * Lee el detalle comercial desde el snapshot de la orden (B5 §5.4.3). Devuelve
 * `null` cuando la orden no tiene snapshot (histórica): el llamador conserva la
 * lectura viva de la cotización como grandfathering.
 *
 * Las cantidades/precios/IVA/moneda salen del snapshot congelado al aceptar la
 * revisión; `poCliente` se incluye cuando el snapshot lo trae (pipeline es
 * inmutable tras CONVERTED, por lo que el respaldo vivo no puede divergir).
 */
export function comercialDesdeSnapshot(snapshot: unknown): ComercialSnapshot | null {
  if (typeof snapshot !== 'object' || snapshot === null) return null;
  const raiz = snapshot as {
    items?: unknown;
    totales?: Record<string, unknown>;
    cabecera?: Record<string, unknown>;
    origen?: Record<string, unknown>;
    observaciones?: unknown;
  };
  if (!Array.isArray(raiz.items) || raiz.items.length === 0) return null;

  const items = raiz.items.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  );

  const lineas: DocumentoOrden['lineas'] = [];
  for (const item of items) {
    const precioUnitario = aNumero(item.precio_unitario);
    if (precioUnitario === null) continue;
    lineas.push({
      descripcion: aTexto(item.descripcion) ?? aTexto(item.codigo) ?? aTexto(item.codigo_item) ?? '',
      cantidad: aNumero(item.cantidad) ?? 0,
      precioUnitario,
      esDescuento: item.es_descuento === true,
    });
  }

  const totalesSnapshot = raiz.totales ?? {};
  const cabecera = raiz.cabecera ?? {};
  const origen = raiz.origen ?? {};
  const monedaSnapshot = aTexto(totalesSnapshot.moneda) ?? aTexto(cabecera.moneda) ?? 'MXN';
  const moneda: 'MXN' | 'USD' = monedaSnapshot === 'USD' ? 'USD' : 'MXN';
  const ivaPorcentaje =
    aNumero(totalesSnapshot.iva_porcentaje) ?? aNumero(cabecera.iva_porcentaje) ?? 16;

  const subtotal = aNumero(totalesSnapshot.subtotal);
  const descuento = aNumero(totalesSnapshot.descuento);
  const iva = aNumero(totalesSnapshot.iva);
  const total = aNumero(totalesSnapshot.total);
  const totales: DocumentoOrden['totales'] =
    subtotal !== null && descuento !== null && iva !== null && total !== null
      ? { subtotal, descuento, iva, total, ivaPorcentaje, moneda }
      : calcularTotalesCotizacion(
          lineas.map<LineaCotizacionEntrada>((linea) => ({ ...linea })),
          ivaPorcentaje,
          moneda,
        );

  const contacto = typeof cabecera.contacto === 'object' && cabecera.contacto !== null
    ? (cabecera.contacto as Record<string, unknown>)
    : null;

  return {
    lineas,
    totales,
    folioCotizacion: aTexto(cabecera.folio_legacy) ?? aTexto(origen.propuesta_folio),
    nombreContacto: aTexto(contacto?.nombre),
    poCliente: aTexto(cabecera.po_cliente),
    notas: aTexto(raiz.observaciones),
  };
}

/**
 * Compone el documento de una orden con lo que se va a fabricar (partidas) y el
 * detalle comercial **congelado en el snapshot** de la aceptación (B5 §5.4.3);
 * las órdenes históricas sin snapshot conservan la lectura viva de su
 * cotización como grandfathering. La orden y sus vínculos se leen bajo RLS del
 * usuario; la empresa sale de la configuración (no es un secreto).
 *
 * No genera PDF: el navegador imprime el HTML (mismo patrón que el recibo de
 * cobranza); “reimprimir” es volver a abrir este documento.
 */
export async function obtenerDocumentoOrdenServicio(
  cliente: SupabaseClient<Database>,
  ordenId: string,
): Promise<DocumentoOrden | null> {
  const { data: orden, error: errorOrden } = await cliente
    .from('ordenes_produccion')
    .select('folio, estado, prioridad, fecha_compromiso, es_interna, cliente_id, cotizacion_id, snapshot_json, notas, creado_en')
    .eq('id', ordenId)
    .maybeSingle();
  if (errorOrden) throw new Error(`No se pudo leer la orden: ${errorOrden.message}`);
  if (!orden) return null;

  const comercial = comercialDesdeSnapshot(orden.snapshot_json);

  const [partidasResultado, clienteResultado, cotizacionResultado, empresa] = await Promise.all([
    cliente
      .from('partidas_orden_produccion')
      .select(
        'codigo_pieza, descripcion, cantidad_solicitada, cantidad_producida, unidad_medida, area_trabajo_codigo, procesos, tiempo_estimado_minutos, tiempo_real_minutos',
      )
      .eq('orden_id', ordenId)
      .order('codigo_pieza', { ascending: true }),
    orden.cliente_id
      ? cliente.from('clientes').select('razon_social, rfc').eq('id', orden.cliente_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    orden.cotizacion_id
      ? cliente
          .from('pipeline')
          .select('folio_cnc, po_cliente, notas, iva_porcentaje, nombre_contacto')
          .eq('id', orden.cotizacion_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    obtenerConfiguracionGeneral(),
  ]);

  if (partidasResultado.error) throw new Error(`No se pudieron leer las partidas: ${partidasResultado.error.message}`);
  if (clienteResultado.error) throw new Error(`No se pudo leer el cliente: ${clienteResultado.error.message}`);
  if (cotizacionResultado.error) throw new Error(`No se pudo leer la cotización: ${cotizacionResultado.error.message}`);

  let lineas: DocumentoOrden['lineas'] = [];
  let ivaPorcentaje = 16;
  let moneda = 'MXN';
  let totales: DocumentoOrden['totales'] = {
    subtotal: 0,
    descuento: 0,
    iva: 0,
    ivaPorcentaje: 16,
    total: 0,
    moneda: 'MXN',
  };
  let folioCotizacion: string | null = null;
  let nombreContacto: string | null = null;
  let poCliente: string | null = null;
  let notas: string | null = orden.notas ?? null;

  if (comercial) {
    lineas = comercial.lineas;
    totales = comercial.totales;
    folioCotizacion = comercial.folioCotizacion;
    nombreContacto = comercial.nombreContacto;
    // El snapshot actual no incluye el PO del cliente; el pipeline no es
    // editable después de CONVERTED, por lo que el respaldo vivo es estable.
    poCliente = comercial.poCliente ?? cotizacionResultado.data?.po_cliente ?? null;
    notas = orden.notas ?? comercial.notas ?? null;
  } else if (orden.cotizacion_id) {
    const { data: filasLineas, error: errorLineas } = await cliente
      .from('cotizacion_lineas')
      .select('descripcion, cantidad, precio_unitario, es_descuento')
      .eq('pipeline_id', orden.cotizacion_id)
      .order('orden', { ascending: true });
    if (errorLineas) throw new Error(`No se pudieron leer las líneas: ${errorLineas.message}`);
    lineas = (filasLineas ?? []).map((linea) => ({
      descripcion: linea.descripcion,
      cantidad: Number(linea.cantidad),
      precioUnitario: Number(linea.precio_unitario),
      esDescuento: linea.es_descuento,
    }));

    const { data: oportunidad } = await cliente
      .from('pipeline')
      .select('moneda')
      .eq('id', orden.cotizacion_id)
      .maybeSingle();
    moneda = oportunidad?.moneda ?? 'MXN';
    ivaPorcentaje = Number(cotizacionResultado.data?.iva_porcentaje ?? 16);

    const entradas: LineaCotizacionEntrada[] = lineas.map((linea) => ({
      descripcion: linea.descripcion,
      cantidad: linea.cantidad,
      precioUnitario: linea.precioUnitario,
      esDescuento: linea.esDescuento,
    }));
    totales = calcularTotalesCotizacion(entradas, ivaPorcentaje, moneda === 'USD' ? 'USD' : 'MXN');
    folioCotizacion = cotizacionResultado.data?.folio_cnc ?? null;
    nombreContacto = cotizacionResultado.data?.nombre_contacto ?? null;
    poCliente = cotizacionResultado.data?.po_cliente ?? null;
    notas = orden.notas ?? cotizacionResultado.data?.notas ?? null;
  }

  return {
    empresa: {
      nombre: empresa.empresa.nombre,
      razonSocial: empresa.empresa.razonSocial,
      rfc: empresa.empresa.rfc,
      direccion: empresa.empresa.direccion,
      telefono: empresa.empresa.telefono,
      email: empresa.empresa.email,
    },
    orden: {
      folio: orden.folio,
      estado: orden.estado,
      prioridad: orden.prioridad,
      fechaCompromiso: orden.fecha_compromiso,
      esInterna: orden.es_interna,
      folioCotizacion,
      poCliente,
      notas,
      nombreContacto,
      creadoEn: orden.creado_en,
    },
    cliente: clienteResultado.data
      ? { razonSocial: clienteResultado.data.razon_social, rfc: clienteResultado.data.rfc }
      : null,
    partidas: (partidasResultado.data ?? []).map((partida) => ({
      codigoPieza: partida.codigo_pieza,
      descripcion: partida.descripcion,
      cantidadSolicitada: Number(partida.cantidad_solicitada),
      cantidadProducida: Number(partida.cantidad_producida),
      unidadMedida: partida.unidad_medida,
      areaTrabajoCodigo: partida.area_trabajo_codigo,
      procesos: partida.procesos ?? [],
      tiempoEstimadoMinutos: Number(partida.tiempo_estimado_minutos),
      tiempoRealMinutos: Number(partida.tiempo_real_minutos),
    })),
    lineas,
    totales: {
      subtotal: totales.subtotal,
      descuento: totales.descuento,
      iva: totales.iva,
      ivaPorcentaje: totales.ivaPorcentaje,
      total: totales.total,
      moneda: totales.moneda,
    },
  };
}
