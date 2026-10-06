import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { filaAFactura, type Factura } from '@/modulos/facturacion/tipos/indice';

/** Factura de la cola con el contexto de su entrega, orden y cliente. */
export type FacturaCola = Factura & {
  clienteNombre: string | null;
  ordenFolio: string;
  ordenFolioSii: string | null;
  entregaFolio: string;
  entregaFolioSii: string | null;
};

/** Entrega aún sin factura activa, lista para preparar su borrador. */
export type EntregaFacturable = {
  entregaId: string;
  folio: string;
  folioSii: string | null;
  creadoEn: string;
  ordenId: string;
  ordenFolio: string;
  ordenFolioSii: string | null;
  clienteId: string;
  clienteNombre: string | null;
  arSubtotal: number | null;
  arIva: number | null;
  arTotal: number | null;
};

export type ColaFacturas = {
  facturas: FacturaCola[];
  entregasFacturables: EntregaFacturable[];
};

type ClienteEmbed = {
  razon_social: string;
  nombre_comercial: string | null;
  condiciones_pago: string | null;
};

type OrdenEmbed = {
  id: string;
  folio: string;
  folio_sii: string | null;
  cliente_id: string;
  clientes: ClienteEmbed | null;
};

function nombreCliente(orden: OrdenEmbed | null | undefined): string | null {
  if (!orden?.clientes) return null;
  return orden.clientes.nombre_comercial || orden.clientes.razon_social;
}

/** SII-B8 F2: cola de facturación (notas recientes + facturas con su contexto). */
export async function obtenerColaFacturas(
  cliente: SupabaseClient<Database>,
  limite = 200,
): Promise<ColaFacturas> {
  const { data: filas, error } = await cliente
    .from('facturas')
    .select('*')
    .order('creado_en', { ascending: false })
    .limit(limite);
  if (error) {
    throw new Error('No se pudieron cargar las facturas');
  }
  const facturasBase = (filas ?? []).map(filaAFactura);

  const ordenIds = [...new Set(facturasBase.map((factura) => factura.ordenId))];
  const entregaIds = [...new Set(facturasBase.map((factura) => factura.entregaId))];
  const clienteIds = [...new Set(facturasBase.map((factura) => factura.clienteId))];

  const [ordenesResp, entregasResp, clientesResp] = await Promise.all([
    ordenIds.length > 0
      ? cliente.from('ordenes_produccion').select('id, folio, folio_sii').in('id', ordenIds)
      : Promise.resolve({ data: [] as { id: string; folio: string; folio_sii: string | null }[] }),
    entregaIds.length > 0
      ? cliente.from('notas_entrega').select('id, folio, folio_sii').in('id', entregaIds)
      : Promise.resolve({ data: [] as { id: string; folio: string; folio_sii: string | null }[] }),
    clienteIds.length > 0
      ? cliente.from('clientes').select('id, razon_social, nombre_comercial').in('id', clienteIds)
      : Promise.resolve({ data: [] as { id: string; razon_social: string; nombre_comercial: string | null }[] }),
  ]);

  const ordenPorId = new Map((ordenesResp.data ?? []).map((orden) => [orden.id, orden]));
  const entregaPorId = new Map((entregasResp.data ?? []).map((entrega) => [entrega.id, entrega]));
  const clientePorId = new Map((clientesResp.data ?? []).map((registro) => [registro.id, registro]));

  const facturas: FacturaCola[] = facturasBase.map((factura) => {
    const orden = ordenPorId.get(factura.ordenId);
    const entrega = entregaPorId.get(factura.entregaId);
    const registroCliente = clientePorId.get(factura.clienteId);
    return {
      ...factura,
      clienteNombre: registroCliente
        ? registroCliente.nombre_comercial || registroCliente.razon_social
        : null,
      ordenFolio: orden?.folio ?? '—',
      ordenFolioSii: orden?.folio_sii ?? null,
      entregaFolio: entrega?.folio ?? '—',
      entregaFolioSii: entrega?.folio_sii ?? null,
    };
  });

  const { data: notas, error: errorNotas } = await cliente
    .from('notas_entrega')
    .select('id, folio, folio_sii, creado_en, orden_id')
    .order('creado_en', { ascending: false })
    .limit(100);
  if (errorNotas) {
    throw new Error('No se pudieron cargar las entregas facturables');
  }

  const conFacturaActiva = new Set(
    facturasBase.filter((factura) => factura.estado !== 'CANCELADA').map((factura) => factura.entregaId),
  );

  const ordenesDeNotas = [...new Set((notas ?? []).map((nota) => nota.orden_id))];
  const [ordenesNotasResp, cuentasResp] = await Promise.all([
    ordenesDeNotas.length > 0
      ? cliente
        .from('ordenes_produccion')
        .select('id, folio, folio_sii, cliente_id, clientes(razon_social, nombre_comercial)')
        .in('id', ordenesDeNotas)
      : Promise.resolve({ data: [] as unknown[] }),
    ordenesDeNotas.length > 0
      ? cliente
        .from('cuentas_por_cobrar')
        .select('orden_id, monto_subtotal, monto_iva, monto_total')
        .in('orden_id', ordenesDeNotas)
      : Promise.resolve({
        data: [] as { orden_id: string; monto_subtotal: number | null; monto_iva: number | null; monto_total: number }[],
      }),
  ]);

  const ordenNotaPorId = new Map(
    (ordenesNotasResp.data ?? []).map((orden) => [(orden as unknown as OrdenEmbed).id, orden as unknown as OrdenEmbed]),
  );
  const cuentaPorOrden = new Map((cuentasResp.data ?? []).map((cuenta) => [cuenta.orden_id, cuenta]));

  const entregasFacturables: EntregaFacturable[] = (notas ?? [])
    .filter((nota) => !conFacturaActiva.has(nota.id))
    .map((nota) => {
      const orden = ordenNotaPorId.get(nota.orden_id) ?? null;
      const cuenta = orden ? cuentaPorOrden.get(orden.id) : undefined;
      return {
        entregaId: nota.id,
        folio: nota.folio,
        folioSii: nota.folio_sii ?? null,
        creadoEn: nota.creado_en,
        ordenId: orden?.id ?? '',
        ordenFolio: orden?.folio ?? '—',
        ordenFolioSii: orden?.folio_sii ?? null,
        clienteId: orden?.cliente_id ?? '',
        clienteNombre: nombreCliente(orden),
        arSubtotal: cuenta?.monto_subtotal === null || cuenta?.monto_subtotal === undefined
          ? null
          : Number(cuenta.monto_subtotal),
        arIva: cuenta?.monto_iva === null || cuenta?.monto_iva === undefined
          ? null
          : Number(cuenta.monto_iva),
        arTotal: cuenta?.monto_total === undefined ? null : Number(cuenta.monto_total),
      };
    });

  return { facturas, entregasFacturables };
}

/** Contexto para preparar/editar el borrador de una entrega concreta. */
export type PreparacionFactura = {
  entrega: {
    id: string;
    folio: string;
    folioSii: string | null;
    esParcial: boolean;
    creadoEn: string;
    recibidoPor: string;
  };
  orden: { id: string; folio: string; folioSii: string | null };
  cliente: { id: string; nombre: string; condicionesPago: string | null };
  ar: {
    id: string;
    subtotal: number | null;
    iva: number | null;
    total: number;
    folioFacturaRemision: string | null;
    estado: string;
    cobrable: boolean;
  } | null;
  facturaActiva: Factura | null;
};

/** SII-B8 F2: datos para precargar el borrador (montos de la AR y factura activa). */
export async function prepararFacturaEntrega(
  cliente: SupabaseClient<Database>,
  entregaId: string,
): Promise<PreparacionFactura | null> {
  const { data: nota, error } = await cliente
    .from('notas_entrega')
    .select('id, folio, folio_sii, es_parcial, creado_en, recibido_por, orden_id, ordenes_produccion(id, folio, folio_sii, cliente_id, clientes(razon_social, nombre_comercial, condiciones_pago))')
    .eq('id', entregaId)
    .maybeSingle();
  if (error) {
    throw new Error('No se pudo cargar la entrega');
  }
  if (!nota) return null;

  const orden = nota.ordenes_produccion as unknown as OrdenEmbed | null;
  const [cuentaResp, facturaResp] = await Promise.all([
    orden
      ? cliente
        .from('cuentas_por_cobrar')
        .select('id, monto_subtotal, monto_iva, monto_total, folio_factura_remision, estado, cobrable_desde')
        .eq('orden_id', orden.id)
        .maybeSingle()
      : Promise.resolve({ data: null }),
    cliente
      .from('facturas')
      .select('*')
      .eq('entrega_id', entregaId)
      .neq('estado', 'CANCELADA')
      .maybeSingle(),
  ]);

  const cuenta = cuentaResp.data;

  return {
    entrega: {
      id: nota.id,
      folio: nota.folio,
      folioSii: nota.folio_sii ?? null,
      esParcial: nota.es_parcial,
      creadoEn: nota.creado_en,
      recibidoPor: nota.recibido_por,
    },
    orden: {
      id: orden?.id ?? '',
      folio: orden?.folio ?? '—',
      folioSii: orden?.folio_sii ?? null,
    },
    cliente: {
      id: orden?.cliente_id ?? '',
      nombre: nombreCliente(orden) ?? '—',
      condicionesPago: orden?.clientes?.condiciones_pago ?? null,
    },
    ar: cuenta
      ? {
        id: cuenta.id,
        subtotal: cuenta.monto_subtotal === null ? null : Number(cuenta.monto_subtotal),
        iva: cuenta.monto_iva === null ? null : Number(cuenta.monto_iva),
        total: Number(cuenta.monto_total),
        folioFacturaRemision: cuenta.folio_factura_remision ?? null,
        estado: cuenta.estado,
        cobrable: cuenta.cobrable_desde !== null,
      }
      : null,
    facturaActiva: facturaResp.data ? filaAFactura(facturaResp.data) : null,
  };
}
