'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { generarFolioOp } from '@/modulos/pipeline/servicios/generar-folio-op';
import { obtenerClienteParaRfq } from '@/modulos/pipeline/servicios/obtener-cliente-para-rfq';
import { esquemaCrearProspecto } from '@/modulos/pipeline/validaciones/esquemas-prospecto';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Crea un prospecto nuevo en la etapa inicial del pipeline.
 *
 * El folio OP se genera SIEMPRE vía RPC atómica (nunca contando filas ni en
 * cliente). El prospecto queda asignado al vendedor autenticado. Escribe con
 * cliente admin: el folio y las columnas controladas (etapa/folio) están
 * protegidas de escritura directa por trigger/RLS; la autorización ya se hizo
 * arriba (`obtenerUsuarioServidor`) y `vendedor_id` se fija al usuario actual.
 *
 * RFQ-02/03: admite `clienteId` para que la RFQ nazca ligada a un cliente del
 * catálogo, heredando sus condiciones de pago si la captura no fijó otras.
 */
export async function crearProspectoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string; folioOp: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaCrearProspecto.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = analisis.data;

  // RFQ-02/03: si la RFQ nace ligada a un cliente, se verifica BAJO RLS que el
  // usuario pueda verlo y se heredan sus condiciones de pago cuando la captura
  // no las fijó a mano (lo capturado por el vendedor siempre manda).
  let clienteId: string | null = null;
  let condicionesPago = datos.condicionesPago ?? null;
  if (datos.clienteId) {
    const servidor = await crearClienteSupabaseServidor();
    const clienteRfq = await obtenerClienteParaRfq(servidor, datos.clienteId);
    if (!clienteRfq) {
      return { exito: false, error: 'Cliente no válido' };
    }
    clienteId = clienteRfq.id;
    condicionesPago = condicionesPago ?? clienteRfq.condicionesPago;
  }

  const admin = crearClienteSupabaseAdmin();

  let folioOp: string;
  try {
    folioOp = await generarFolioOp(admin);
  } catch {
    return { exito: false, error: 'No se pudo generar el folio' };
  }

  const { data: fila, error } = await admin
    .from('pipeline')
    .insert({
      folio_op: folioOp,
      etapa: 'prospecto',
      nombre_contacto: datos.nombreContacto,
      empresa: datos.empresa,
      // Correo opcional: cadena vacía se normaliza a null.
      correo: datos.correo ? datos.correo : null,
      telefono: datos.telefono ?? null,
      vendedor_id: usuario.id,
      cliente_id: clienteId,
      moneda: datos.moneda,
      condiciones_pago: condicionesPago,
      prioridad: datos.prioridad,
      iva_porcentaje: datos.ivaPorcentaje,
      etiquetas: datos.etiquetas,
      es_orden_interna: datos.esOrdenInterna,
      // RFQ-01: datos de captura de la solicitud (cadenas vacías → null).
      po_cliente: datos.poCliente?.trim() ? datos.poCliente.trim() : null,
      fecha_requerida: datos.fechaRequerida ? datos.fechaRequerida : null,
      horas_estimadas: datos.horasEstimadas ?? null,
      notas: datos.notas?.trim() ? datos.notas.trim() : null,
    })
    .select('id')
    .single();

  if (error || !fila) {
    return { exito: false, error: 'No se pudo crear el prospecto' };
  }

  await registrarLog(usuario, 'crear', 'pipeline', fila.id, { folioOp, clienteId });

  return { exito: true, datos: { id: fila.id, folioOp } };
}
