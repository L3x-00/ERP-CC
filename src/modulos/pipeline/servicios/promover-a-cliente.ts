import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

/** Datos con los que se crea (o localiza y enriquece) un cliente al ganar. */
export type DatosPromocion = {
  nombreComercial: string;
  /** Razón social. Si no llega, se usa el nombre comercial (dedup/NOT NULL). */
  razonSocial?: string | null;
  rfc?: string | null;
  contacto?: string | null;
  correo?: string | null;
  telefono?: string | null;
};

/** Columnas únicas por las que se deduplica, en orden de prioridad. */
type ColumnaDedup = 'rfc' | 'razon_social' | 'correo';

/**
 * Crea el cliente derivado de una oportunidad ganada, o localiza el existente y
 * lo enriquece sin perder datos.
 *
 * Deduplica en orden: RFC (identificador fiscal), razón social (case-insensitive)
 * y correo. Si el cliente ya existe, rellena SOLO los campos vacíos con los datos
 * entrantes (nunca sobrescribe lo ya capturado). Recibe un cliente ADMIN (service
 * role) porque la promoción resuelve clientes que el vendedor quizá no ve por RLS.
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
  const razonSocial = datos.razonSocial?.trim() || datos.nombreComercial.trim();

  const existente = await localizarExistente(clienteAdmin, { rfc, razonSocial, correo });
  if (existente) {
    await enriquecerCliente(clienteAdmin, existente, {
      nombre_comercial: datos.nombreComercial,
      rfc,
      contacto: datos.contacto ?? null,
      correo,
      telefono: datos.telefono ?? null,
    });
    return existente;
  }

  const { data, error } = await clienteAdmin
    .from('clientes')
    .insert({
      razon_social: razonSocial,
      nombre_comercial: datos.nombreComercial,
      rfc,
      contacto: datos.contacto ?? null,
      correo,
      telefono: datos.telefono ?? null,
      // Una oportunidad ganada es un cliente real, no un prospecto.
      estado: 'activo',
    })
    .select('id')
    .single();

  if (error) {
    // Carrera: otra promoción concurrente insertó el mismo cliente. El índice
    // único (rfc / lower(razon_social) / lower(correo)) lo rechaza; reconsultar.
    if (error.code === '23505') {
      const ganador = await localizarExistente(clienteAdmin, { rfc, razonSocial, correo });
      if (ganador) return ganador;
    }
    throw new Error('No se pudo crear el cliente');
  }
  if (!data) {
    throw new Error('No se pudo crear el cliente');
  }
  return data.id;
}

/** Busca un cliente existente por RFC, luego razón social, luego correo. */
async function localizarExistente(
  clienteAdmin: SupabaseClient<Database>,
  claves: { rfc: string | null; razonSocial: string; correo: string | null },
): Promise<string | null> {
  if (claves.rfc) {
    const id = await buscarClientePor(clienteAdmin, 'rfc', claves.rfc);
    if (id) return id;
  }
  const porRazon = await buscarClientePor(clienteAdmin, 'razon_social', claves.razonSocial);
  if (porRazon) return porRazon;
  if (claves.correo) {
    const id = await buscarClientePor(clienteAdmin, 'correo', claves.correo);
    if (id) return id;
  }
  return null;
}

/** Busca el id de un cliente por una columna única (case-insensitive). */
async function buscarClientePor(
  clienteAdmin: SupabaseClient<Database>,
  columna: ColumnaDedup,
  valor: string,
): Promise<string | null> {
  const { data, error } = await clienteAdmin
    .from('clientes')
    .select('id')
    .ilike(columna, valor)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo verificar el cliente por ${columna}`);
  }
  return data?.id ?? null;
}

/**
 * Rellena en el cliente existente solo los campos hoy vacíos con los datos
 * entrantes. No sobrescribe información ya capturada (evita pérdida de datos al
 * volver a promover una oportunidad del mismo cliente).
 */
async function enriquecerCliente(
  clienteAdmin: SupabaseClient<Database>,
  clienteId: string,
  entrantes: {
    nombre_comercial: string;
    rfc: string | null;
    contacto: string | null;
    correo: string | null;
    telefono: string | null;
  },
): Promise<void> {
  const { data: actual } = await clienteAdmin
    .from('clientes')
    .select('rfc, contacto, correo, telefono')
    .eq('id', clienteId)
    .maybeSingle();
  if (!actual) return;

  const parche: Database['public']['Tables']['clientes']['Update'] = {};
  if (!actual.rfc && entrantes.rfc) parche.rfc = entrantes.rfc;
  if (!actual.contacto && entrantes.contacto) parche.contacto = entrantes.contacto;
  if (!actual.correo && entrantes.correo) parche.correo = entrantes.correo;
  if (!actual.telefono && entrantes.telefono) parche.telefono = entrantes.telefono;

  if (Object.keys(parche).length === 0) return;

  // Enriquecer es best-effort: si otra escritura concurrente choca con un índice
  // único, no debe romper la promoción (el cliente ya quedó localizado).
  await clienteAdmin.from('clientes').update(parche).eq('id', clienteId);
}
