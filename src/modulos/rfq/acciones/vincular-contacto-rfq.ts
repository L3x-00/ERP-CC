'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import {
  resolverContactoVigenteCliente,
  retirarContactoRecienCreado,
} from '../servicios/contacto-vigente-cliente';
import { registrarVersionRfq } from '../servicios/registrar-version-rfq';
import { ESTADOS_RFQ, type EstadoRfq } from '../tipos/indice';
import { esDefinicionRfqEditable } from '../utilidades/estados';
import { esquemaVincularContactoRfq } from '../validaciones/esquemas-rfq';

/** Estados en los que el RFQ sigue siendo editable (excluye los terminales). */
const ESTADOS_VINCULABLES: EstadoRfq[] = ESTADOS_RFQ.filter(esDefinicionRfqEditable);

export type MotivoSinVinculoContacto =
  | 'estado_no_editable'
  | 'sin_cliente'
  | 'ya_tiene_contacto'
  | 'sin_datos'
  | 'sin_permiso_crear_contacto'
  | 'concurrencia';

export type ResultadoVinculoContactoRfq =
  | { vinculado: true; contactoId: string }
  | { vinculado: false; motivo: MotivoSinVinculoContacto };

/**
 * Server Action (escritura explícita; nunca se invoca al leer): liga a un RFQ
 * existente y editable el contacto vigente de su cliente cuando aún no tiene
 * ninguno, para que «contacto vigente del cliente» no quede como faltante a la
 * espera de un paso manual.
 *
 * - Exige `rfq_editar`. Ligar un contacto ya registrado no requiere más; crearlo
 *   a partir de los datos del cliente (o del nombre ya capturado en el RFQ) escribe
 *   con service role, así que además exige `cliente_editar`, el permiso con que se
 *   crean contactos a mano. Sin él solo se liga uno ya registrado.
 * - Conserva la selección existente: la escritura es condicional (`contacto_id IS
 *   NULL`, mismo cliente y estado aún editable), de modo que una elección o un
 *   cambio concurrente nunca se pisan. Si pierde esa carrera no deja el contacto
 *   recién creado huérfano.
 * - Audita el vínculo (y la creación del contacto, si la hubo) y registra la
 *   versión de cabecera del RFQ. Estados terminales y RFQ sin cliente no se tocan.
 */
export async function vincularContactoVigenteRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ResultadoVinculoContactoRfq>> {
  const analisis = esquemaVincularContactoRfq.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_editar'))) {
    return { exito: false, error: 'Sin permiso para editar el RFQ' };
  }

  const rfqId = analisis.data.rfqId;
  const admin = crearClienteSupabaseAdmin();

  const { data: rfq, error: errorRfq } = await admin
    .from('pipeline')
    .select('id, estado_rfq, cliente_id, contacto_id, nombre_contacto, correo, telefono')
    .eq('id', rfqId)
    .maybeSingle();
  if (errorRfq || !rfq) {
    return { exito: false, error: 'El RFQ no existe' };
  }

  // Comparación con el valor crudo: un estado desconocido nunca cuenta como editable.
  if (!(ESTADOS_VINCULABLES as string[]).includes(rfq.estado_rfq)) {
    return { exito: true, datos: { vinculado: false, motivo: 'estado_no_editable' } };
  }
  if (!rfq.cliente_id) {
    return { exito: true, datos: { vinculado: false, motivo: 'sin_cliente' } };
  }
  if (rfq.contacto_id) {
    return { exito: true, datos: { vinculado: false, motivo: 'ya_tiene_contacto' } };
  }
  const clienteId = rfq.cliente_id;

  const puedeCrear = await can(usuario, 'cliente_editar');
  const resolucion = await resolverContactoVigenteCliente(admin, {
    clienteId,
    actorId: usuario.id,
    puedeCrear,
    capturado: {
      nombre: rfq.nombre_contacto,
      correo: rfq.correo,
      telefono: rfq.telefono,
    },
  });

  if (resolucion.estado === 'error') {
    return { exito: false, error: 'No se pudo vincular el contacto del cliente' };
  }
  if (resolucion.estado === 'sin_datos') {
    return { exito: true, datos: { vinculado: false, motivo: 'sin_datos' } };
  }
  if (resolucion.estado === 'sin_permiso') {
    return { exito: true, datos: { vinculado: false, motivo: 'sin_permiso_crear_contacto' } };
  }

  // Escritura condicional: solo si nadie eligió un contacto, el cliente sigue
  // siendo el mismo y el RFQ continúa editable. Así no se pisa nada concurrente.
  const { data: actualizado, error: errorEscritura } = await admin
    .from('pipeline')
    .update({ contacto_id: resolucion.id })
    .eq('id', rfqId)
    .is('contacto_id', null)
    .eq('cliente_id', clienteId)
    .in('estado_rfq', ESTADOS_VINCULABLES)
    .select('id')
    .maybeSingle();

  if (errorEscritura || !actualizado) {
    // El contacto que acabamos de crear no queda huérfano.
    if (resolucion.creado) {
      await retirarContactoRecienCreado(admin, resolucion.id);
    }
    if (errorEscritura) {
      console.error('[RFQ] No se pudo vincular el contacto del RFQ:', errorEscritura.message);
      return { exito: false, error: 'No se pudo vincular el contacto del cliente' };
    }
    return { exito: true, datos: { vinculado: false, motivo: 'concurrencia' } };
  }

  const correlationId = nuevoCorrelationId();
  if (resolucion.creado) {
    await registrarLog(
      usuario,
      'crear',
      'clientes',
      clienteId,
      { contactoId: resolucion.id, origen: 'rfq_vinculo_automatico', rfqId },
      correlationId,
    );
  }
  await registrarVersionRfq(admin, {
    rfqId,
    causa: 'CABECERA',
    actorId: usuario.id,
    correlationId,
  });
  await registrarLog(
    usuario,
    'vincular_contacto_rfq',
    'pipeline',
    rfqId,
    {
      clienteId,
      contactoId: resolucion.id,
      origen: resolucion.creado ? 'creado_desde_datos' : 'registrado',
    },
    correlationId,
  );

  return { exito: true, datos: { vinculado: true, contactoId: resolucion.id } };
}
