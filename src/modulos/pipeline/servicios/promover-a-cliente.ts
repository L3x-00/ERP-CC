import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

/** Datos con los que se crea (o localiza) un cliente al ganar una oportunidad. */
export type DatosPromocion = {
  nombreComercial: string;
  rfc?: string | null;
  contacto?: string | null;
  correo?: string | null;
  telefono?: string | null;
};

/**
 * Crea el cliente derivado de una oportunidad ganada, o devuelve el existente.
 *
 * Deduplica para no generar clientes repetidos: primero por RFC (identificador
 * fiscal único) y, si no hay RFC, por correo. Recibe un cliente ADMIN (service
 * role) porque la promoción ocurre al ganar y debe resolver clientes que el
 * vendedor quizá no ve por RLS.
 *
 * @param clienteAdmin Cliente Supabase con service role (sin RLS).
 * @param datos Datos del cliente a promover.
 * @returns Id del cliente existente o recién creado.
 * @throws Error si la verificación o el insert fallan.
 */
export async function promoverAClienteSiNoExiste(
  clienteAdmin: SupabaseClient<Database>,
  datos: DatosPromocion,
): Promise<string> {
  const rfc = datos.rfc?.trim() || null;
  // Correo normalizado a minúsculas para coincidir con el índice único
  // lower(correo) y para que la deduplicación sea case-insensitive.
  const correo = datos.correo?.trim().toLowerCase() || null;

  if (rfc) {
    const existente = await buscarClientePor(clienteAdmin, 'rfc', rfc);
    if (existente) return existente;
  } else if (correo) {
    const existente = await buscarClientePor(clienteAdmin, 'correo', correo);
    if (existente) return existente;
  }

  const { data, error } = await clienteAdmin
    .from('clientes')
    .insert({
      nombre_comercial: datos.nombreComercial,
      rfc,
      contacto: datos.contacto ?? null,
      correo,
      telefono: datos.telefono ?? null,
    })
    .select('id')
    .single();

  if (error) {
    // Carrera: otra promoción concurrente insertó el mismo cliente. El índice
    // único (rfc / lower(correo)) lo rechaza; reconsultar y devolver el ganador.
    if (error.code === '23505') {
      if (rfc) {
        const existente = await buscarClientePor(clienteAdmin, 'rfc', rfc);
        if (existente) return existente;
      }
      if (correo) {
        const existente = await buscarClientePor(clienteAdmin, 'correo', correo);
        if (existente) return existente;
      }
    }
    throw new Error('No se pudo crear el cliente');
  }
  if (!data) {
    throw new Error('No se pudo crear el cliente');
  }
  return data.id;
}

/** Busca el id de un cliente por una columna única (rfc o correo). */
async function buscarClientePor(
  clienteAdmin: SupabaseClient<Database>,
  columna: 'rfc' | 'correo',
  valor: string,
): Promise<string | null> {
  const { data, error } = await clienteAdmin
    .from('clientes')
    .select('id')
    .eq(columna, valor)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo verificar el cliente por ${columna}`);
  }
  return data?.id ?? null;
}
