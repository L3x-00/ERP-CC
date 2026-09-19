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

/**
 * Compone el documento de una orden con lo que se va a fabricar (partidas) y el
 * detalle comercial de su cotización de origen (líneas con precio, descuentos
 * restados, IVA de la oportunidad). La orden y sus vínculos se leen bajo RLS del
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
    .select('folio, estado, prioridad, fecha_compromiso, es_interna, cliente_id, cotizacion_id, creado_en')
    .eq('id', ordenId)
    .maybeSingle();
  if (errorOrden) throw new Error(`No se pudo leer la orden: ${errorOrden.message}`);
  if (!orden) return null;

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
  if (orden.cotizacion_id) {
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
  }
  ivaPorcentaje = Number(cotizacionResultado.data?.iva_porcentaje ?? 16);

  const entradas: LineaCotizacionEntrada[] = lineas.map((linea) => ({
    descripcion: linea.descripcion,
    cantidad: linea.cantidad,
    precioUnitario: linea.precioUnitario,
    esDescuento: linea.esDescuento,
  }));
  const totales = calcularTotalesCotizacion(entradas, ivaPorcentaje, moneda === 'USD' ? 'USD' : 'MXN');

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
      folioCotizacion: cotizacionResultado.data?.folio_cnc ?? null,
      poCliente: cotizacionResultado.data?.po_cliente ?? null,
      notas: cotizacionResultado.data?.notas ?? null,
      nombreContacto: cotizacionResultado.data?.nombre_contacto ?? null,
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
