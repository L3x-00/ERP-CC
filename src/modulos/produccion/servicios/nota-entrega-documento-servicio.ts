import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { obtenerConfiguracionGeneral } from '@/modulos/configuracion/servicios/configuracion-servicio';

/**
 * Documento imprimible de una nota de entrega (OBS-13): conforma el registro
 * persistido (`notas_entrega` + `partidas_nota_entrega`) con los datos del
 * cliente y de la empresa. Sin precios, como la nota misma. La composición de
 * líneas es una función pura para poder probarla sin base de datos.
 */

export interface RenglonNotaCrudo {
  partidaId: string;
  cantidadEntregada: number;
  codigoPieza: string;
  descripcion: string | null;
  unidadMedida: string;
  cantidadSolicitada: number;
}

export interface LineaNotaEntrega {
  codigoPieza: string;
  descripcion: string | null;
  unidadMedida: string;
  cantidadNota: number;
  entregadoAcumulado: number;
  cantidadSolicitada: number;
}

export interface DocumentoNotaEntrega {
  empresa: {
    nombre: string;
    razonSocial: string;
    rfc: string;
    direccion: string;
    telefono: string;
    email: string;
  };
  nota: {
    folio: string;
    esParcial: boolean;
    recibidoPor: string;
    firmaClienteUrl: string | null;
    creadoEn: string;
  };
  orden: { folio: string; clienteRazonSocial: string | null; clienteRfc: string | null };
  lineas: LineaNotaEntrega[];
  totalNota: number;
  totalAcumulado: number;
  totalSolicitado: number;
}

/** Conforma las líneas de la nota con el acumulado entregado por partida. */
export function resumirLineasNota(
  renglones: readonly RenglonNotaCrudo[],
  acumulados: ReadonlyMap<string, number>,
): LineaNotaEntrega[] {
  return renglones.map((renglon) => ({
    codigoPieza: renglon.codigoPieza,
    descripcion: renglon.descripcion,
    unidadMedida: renglon.unidadMedida,
    cantidadNota: renglon.cantidadEntregada,
    entregadoAcumulado: acumulados.get(renglon.partidaId) ?? renglon.cantidadEntregada,
    cantidadSolicitada: renglon.cantidadSolicitada,
  }));
}

export interface NotaEntregaResumen {
  id: string;
  folio: string;
  esParcial: boolean;
  recibidoPor: string;
  creadoEn: string;
  piezas: number;
}

export async function listarNotasEntregaOrden(
  admin: SupabaseClient<Database>,
  ordenId: string,
): Promise<NotaEntregaResumen[]> {
  const { data, error } = await admin
    .from('notas_entrega')
    .select('id, folio, es_parcial, recibido_por, creado_en, partidas_nota_entrega(cantidad_entregada)')
    .eq('orden_id', ordenId)
    .order('creado_en', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((nota) => ({
    id: nota.id,
    folio: nota.folio,
    esParcial: nota.es_parcial,
    recibidoPor: nota.recibido_por,
    creadoEn: nota.creado_en,
    piezas: (nota.partidas_nota_entrega ?? []).reduce(
      (suma, renglon) => suma + Number(renglon.cantidad_entregada),
      0,
    ),
  }));
}

interface FilaRenglonNota {
  partida_id: string;
  cantidad_entregada: number;
  partidas_orden_produccion:
    | { codigo_pieza: string; descripcion: string | null; unidad_medida: string; cantidad_solicitada: number }
    | null;
}

/** Compone el documento completo de la nota para imprimir o guardar como PDF. */
export async function obtenerDocumentoNotaEntrega(
  admin: SupabaseClient<Database>,
  notaId: string,
): Promise<DocumentoNotaEntrega | null> {
  const { data: nota, error: errorNota } = await admin
    .from('notas_entrega')
    .select('id, folio, es_parcial, recibido_por, firma_cliente_url, creado_en, orden_id')
    .eq('id', notaId)
    .maybeSingle();
  if (errorNota) throw errorNota;
  if (!nota) return null;

  const { data: orden, error: errorOrden } = await admin
    .from('ordenes_produccion')
    .select('folio, clientes(razon_social, rfc)')
    .eq('id', nota.orden_id)
    .maybeSingle();
  if (errorOrden) throw errorOrden;

  const { data: filas, error: errorRenglones } = await admin
    .from('partidas_nota_entrega')
    .select(
      'partida_id, cantidad_entregada, partidas_orden_produccion(codigo_pieza, descripcion, unidad_medida, cantidad_solicitada)',
    )
    .eq('nota_entrega_id', notaId)
    .order('partida_id', { ascending: true });
  if (errorRenglones) throw errorRenglones;

  const renglones: RenglonNotaCrudo[] = ((filas ?? []) as FilaRenglonNota[]).flatMap((fila) => {
    const partida = fila.partidas_orden_produccion;
    if (!partida) return [];
    return [{
      partidaId: fila.partida_id,
      cantidadEntregada: Number(fila.cantidad_entregada),
      codigoPieza: partida.codigo_pieza,
      descripcion: partida.descripcion,
      unidadMedida: partida.unidad_medida,
      cantidadSolicitada: Number(partida.cantidad_solicitada),
    }];
  });

  const acumulados = new Map<string, number>();
  const idsPartida = [...new Set(renglones.map((renglon) => renglon.partidaId))];
  if (idsPartida.length > 0) {
    const { data: historicas, error: errorAcumulados } = await admin
      .from('partidas_nota_entrega')
      .select('partida_id, cantidad_entregada')
      .in('partida_id', idsPartida);
    if (errorAcumulados) throw errorAcumulados;
    for (const fila of historicas ?? []) {
      acumulados.set(
        fila.partida_id,
        (acumulados.get(fila.partida_id) ?? 0) + Number(fila.cantidad_entregada),
      );
    }
  }

  const lineas = resumirLineasNota(renglones, acumulados);
  const configuracion = await obtenerConfiguracionGeneral();

  return {
    empresa: {
      nombre: configuracion.empresa.nombre,
      razonSocial: configuracion.empresa.razonSocial,
      rfc: configuracion.empresa.rfc,
      direccion: configuracion.empresa.direccion,
      telefono: configuracion.empresa.telefono,
      email: configuracion.empresa.email,
    },
    nota: {
      folio: nota.folio,
      esParcial: nota.es_parcial,
      recibidoPor: nota.recibido_por,
      firmaClienteUrl: nota.firma_cliente_url,
      creadoEn: nota.creado_en,
    },
    orden: {
      folio: orden?.folio ?? 'Orden no disponible',
      clienteRazonSocial: orden?.clientes?.razon_social ?? null,
      clienteRfc: orden?.clientes?.rfc ?? null,
    },
    lineas,
    totalNota: lineas.reduce((suma, linea) => suma + linea.cantidadNota, 0),
    totalAcumulado: lineas.reduce((suma, linea) => suma + linea.entregadoAcumulado, 0),
    totalSolicitado: lineas.reduce((suma, linea) => suma + linea.cantidadSolicitada, 0),
  };
}
