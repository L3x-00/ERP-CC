'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerEntregasDeOrden,
  obtenerPendientesDeOrden,
  type EntregaConRenglones,
} from '@/modulos/entregas/servicios/obtener-entregas';
import type { PendienteEntregaItem } from '@/modulos/entregas/tipos/indice';
import { esquemaOrdenEntrega } from '@/modulos/entregas/validaciones/esquemas-entregas';

export type ContactoEntrega = {
  id: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  esPrincipal: boolean;
};

export type PreparacionEntrega = {
  orden: {
    id: string;
    folio: string;
    folioSii: string | null;
    estadoSii: string;
    clienteId: string;
    clienteRazonSocial: string | null;
    condicionesPago: string | null;
  };
  pendientes: PendienteEntregaItem[];
  entregas: EntregaConRenglones[];
  contactos: ContactoEntrega[];
};

/**
 * SII-B7.1: prepara la captura de una entrega: orden, pendientes agrupados por
 * ITxx, entregas previas y contactos del cliente para "quién recibe". Lectura
 * bajo RLS (`orden_vista`/`entrega_generar`/`ver_finanzas`/producción).
 */
export async function prepararEntregaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<PreparacionEntrega>> {
  const analisis = esquemaOrdenEntrega.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };

  const [puedeGenerar, puedeVerOrden, puedeVerFinanzas] = await Promise.all([
    can(usuario, 'entrega_generar'),
    can(usuario, 'orden_vista'),
    can(usuario, 'ver_finanzas'),
  ]);
  if (!puedeGenerar && !puedeVerOrden && !puedeVerFinanzas) {
    return { exito: false, error: 'Sin permiso para ver entregas' };
  }

  const { crearClienteSupabaseServidor } = await import('@/nucleo/supabase/servidor');
  const servidor = await crearClienteSupabaseServidor();

  const { data: orden, error } = await servidor
    .from('ordenes_produccion')
    .select('id, folio, folio_sii, estado_sii, cliente_id, clientes(razon_social, condiciones_pago)')
    .eq('id', analisis.data.ordenId)
    .maybeSingle();
  if (error) {
    return { exito: false, error: 'No se pudo cargar la orden' };
  }
  if (!orden) {
    return { exito: false, error: 'La orden no existe' };
  }

  const cliente = orden.clientes as { razon_social: string; condiciones_pago: string | null } | null;

  const [pendientes, entregas, contactos] = await Promise.all([
    obtenerPendientesDeOrden(servidor, analisis.data.ordenId),
    obtenerEntregasDeOrden(servidor, analisis.data.ordenId),
    servidor
      .from('contactos_cliente')
      .select('id, nombre, correo, telefono, es_principal')
      .eq('cliente_id', orden.cliente_id)
      .eq('activo', true)
      .order('es_principal', { ascending: false })
      .order('nombre', { ascending: true }),
  ]);

  return {
    exito: true,
    datos: {
      orden: {
        id: orden.id,
        folio: orden.folio,
        folioSii: orden.folio_sii ?? null,
        estadoSii: orden.estado_sii,
        clienteId: orden.cliente_id,
        clienteRazonSocial: cliente?.razon_social ?? null,
        condicionesPago: cliente?.condiciones_pago ?? null,
      },
      pendientes,
      entregas,
      contactos: (contactos.data ?? []).map((contacto) => ({
        id: contacto.id,
        nombre: contacto.nombre,
        correo: contacto.correo,
        telefono: contacto.telefono,
        esPrincipal: contacto.es_principal,
      })),
    },
  };
}
