import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '@/compartido/tipos/supabase';

type ClienteAdmin = SupabaseClient<Database>;

type DatosContacto = {
  clienteId: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  actorId: string;
};

export type ResultadoContactoCliente =
  | { exito: true; id: string; creado: boolean }
  | { exito: false; error: string };

async function insertarContacto(
  admin: ClienteAdmin,
  datos: DatosContacto,
): Promise<ResultadoContactoCliente> {
  const { data, error } = await admin
    .from('contactos_cliente')
    .insert({
      cliente_id: datos.clienteId,
      nombre: datos.nombre.trim(),
      correo: datos.correo,
      telefono: datos.telefono,
      es_principal: false,
      creado_por: datos.actorId,
    })
    .select('id')
    .single();
  if (error || !data) {
    return { exito: false, error: 'No se pudo crear el contacto del cliente' };
  }
  return { exito: true, id: data.id, creado: true };
}

/**
 * Garantiza una fila vigente en `contactos_cliente` para el contacto indicado
 * (el gate LISTO exige contacto vigente del cliente): reutiliza uno activo con
 * los mismos datos o, si no existe, lo crea. No valida permisos ni que el
 * cliente exista; eso lo hace quien llama.
 */
export async function asegurarContactoCliente(
  admin: ClienteAdmin,
  entrada: Omit<DatosContacto, 'correo' | 'telefono'> & {
    correo?: string | null;
    telefono?: string | null;
  },
): Promise<ResultadoContactoCliente> {
  const correo = entrada.correo?.trim() || null;
  const telefono = entrada.telefono?.trim() || null;

  const { data: existentes, error } = await admin
    .from('contactos_cliente')
    .select('id, nombre, correo, telefono')
    .eq('cliente_id', entrada.clienteId)
    .eq('activo', true);
  if (error) {
    return { exito: false, error: 'No se pudieron revisar los contactos del cliente' };
  }

  const nombreComparable = entrada.nombre.trim().toLowerCase();
  const existente = (existentes ?? []).find(
    (contacto) =>
      contacto.nombre.trim().toLowerCase() === nombreComparable
      && (contacto.correo ?? '').trim().toLowerCase() === (correo ?? '').toLowerCase()
      && (contacto.telefono ?? '').trim() === (telefono ?? ''),
  );
  if (existente) {
    return { exito: true, id: existente.id, creado: false };
  }

  return insertarContacto(admin, { ...entrada, correo, telefono });
}

/** Datos de contacto del propio RFQ (los que se capturaron en el alta). */
export type DatosCapturadosContacto = {
  nombre?: string | null;
  correo?: string | null;
  telefono?: string | null;
};

export type DatosContactoCreable = {
  nombre: string;
  correo: string | null;
  telefono: string | null;
};

const esquemaCorreo = z.email().max(200);

function correoCopiable(valor: string | null | undefined): string | null {
  const correo = valor?.trim() ?? '';
  return esquemaCorreo.safeParse(correo).success ? correo : null;
}

/** Misma cota que el CHECK de `contactos_cliente.telefono`. */
function telefonoCopiable(valor: string | null | undefined): string | null {
  const telefono = valor?.trim() ?? '';
  return telefono.length >= 3 && telefono.length <= 40 ? telefono : null;
}

/** Cota del CHECK de `contactos_cliente.nombre` y al menos una letra (descarta «--» o «12»). */
function nombreCopiable(valor: string | null | undefined): string | null {
  const nombre = valor?.trim() ?? '';
  return nombre.length >= 2 && nombre.length <= 120 && /\p{L}/u.test(nombre) ? nombre : null;
}

/**
 * Datos con los que se puede crear un contacto sin inventar nada: el nombre del
 * contacto del cliente o, si no lo trae (p. ej. solo teléfono o correo), el nombre
 * ya capturado en el RFQ cuando es válido. Con el nombre del cliente mandan sus
 * correo/teléfono y los capturados completan lo que falte; con el nombre capturado
 * mandan los correo/teléfono capturados junto con él y los del cliente completan.
 * Sin un nombre válido devuelve `null`.
 */
export function datosContactoCreable(
  cliente: { contacto: string | null; correo: string | null; telefono: string | null } | null,
  capturado: DatosCapturadosContacto = {},
): DatosContactoCreable | null {
  const nombreCliente = nombreCopiable(cliente?.contacto);
  const nombreCapturado = nombreCopiable(capturado.nombre);
  const nombre = nombreCliente ?? nombreCapturado;
  if (nombre === null) return null;

  const delCliente = {
    correo: correoCopiable(cliente?.correo),
    telefono: telefonoCopiable(cliente?.telefono),
  };
  const delRfq = {
    correo: correoCopiable(capturado.correo),
    telefono: telefonoCopiable(capturado.telefono),
  };
  const [primero, segundo] = nombreCliente !== null ? [delCliente, delRfq] : [delRfq, delCliente];
  return {
    nombre,
    correo: primero.correo ?? segundo.correo,
    telefono: primero.telefono ?? segundo.telefono,
  };
}

/**
 * Compensa la creación de un contacto cuando el vínculo con el RFQ no llegó a
 * escribirse, para no dejar filas huérfanas. Solo debe llamarse con el id de un
 * contacto creado en esa misma operación: si otra solicitud ya lo ligó, la FK
 * de `pipeline.contacto_id` impide el borrado y el error solo se registra.
 */
export async function retirarContactoRecienCreado(
  admin: ClienteAdmin,
  contactoId: string,
): Promise<void> {
  const { error } = await admin.from('contactos_cliente').delete().eq('id', contactoId);
  if (error) {
    console.error('[RFQ] No se pudo retirar el contacto recién creado:', error.message);
  }
}

export type ResolucionContacto =
  | { estado: 'vinculable'; id: string; creado: boolean }
  /** Nada utilizable que ligar o crear: no se inventa un contacto. */
  | { estado: 'sin_datos' }
  /** Habría que crear el contacto, pero quien llama no tiene permiso para hacerlo. */
  | { estado: 'sin_permiso' }
  | { estado: 'error' };

/**
 * Contacto vigente del cliente para ligarlo a un RFQ cuando la persona no eligió
 * uno: el principal registrado (solo lectura, no requiere permiso adicional) y,
 * si el cliente no tiene contactos, uno creado con `datosContactoCreable`.
 *
 * Crear el contacto escribe con service role, por eso solo ocurre si quien llama
 * confirma `puedeCrear` (la acción debe haber comprobado con `can()` los mismos
 * permisos que exige crear contactos a mano). Nunca lanza: un fallo de lectura
 * o de inserción se reporta en el log del servidor y deja el RFQ sin contacto.
 */
export async function resolverContactoVigenteCliente(
  admin: ClienteAdmin,
  entrada: {
    clienteId: string;
    actorId: string;
    puedeCrear: boolean;
    capturado?: DatosCapturadosContacto;
  },
): Promise<ResolucionContacto> {
  const { data: vigentes, error } = await admin
    .from('contactos_cliente')
    .select('id')
    .eq('cliente_id', entrada.clienteId)
    .eq('activo', true)
    .order('es_principal', { ascending: false })
    .order('nombre');
  if (error) {
    console.error('[RFQ] No se pudieron leer los contactos del cliente:', error.message);
    return { estado: 'error' };
  }
  const registrado = vigentes?.[0];
  if (registrado) {
    return { estado: 'vinculable', id: registrado.id, creado: false };
  }

  const { data: cliente, error: errorCliente } = await admin
    .from('clientes')
    .select('contacto, correo, telefono')
    .eq('id', entrada.clienteId)
    .maybeSingle();
  if (errorCliente) {
    console.error('[RFQ] No se pudo leer el cliente:', errorCliente.message);
    return { estado: 'error' };
  }
  if (!cliente) {
    return { estado: 'sin_datos' };
  }

  const datos = datosContactoCreable(cliente, entrada.capturado);
  if (datos === null) {
    return { estado: 'sin_datos' };
  }
  if (!entrada.puedeCrear) {
    return { estado: 'sin_permiso' };
  }

  const resultado = await asegurarContactoCliente(admin, {
    clienteId: entrada.clienteId,
    actorId: entrada.actorId,
    ...datos,
  });
  if (!resultado.exito) {
    console.error('[RFQ] No se pudo crear el contacto del cliente:', resultado.error);
    return { estado: 'error' };
  }
  return { estado: 'vinculable', id: resultado.id, creado: resultado.creado };
}
