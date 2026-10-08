'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

/** Catálogos y actores que consume la ficha RFQ (ítems y seguimiento). */
export type CatalogosRfq = {
  materiales: { id: string; codigo: string; nombre: string }[];
  espesores: { id: string; materialId: string; etiqueta: string; espesorMm: number }[];
  procesos: { id: string; codigo: string; nombre: string; requiereArchivoTecnico: boolean }[];
  canales: { codigo: string; nombre: string; esOtro: boolean; activo: boolean }[];
  proximasAcciones: { codigo: string; nombre: string; esOtro: boolean }[];
  usuarios: { id: string; nombre: string; rol: string }[];
};

/**
 * Server Action: catálogos activos (materiales, espesores, procesos, próximas
 * acciones) y usuarios activos para los selectores de la ficha RFQ.
 */
export async function obtenerCatalogosRfqAccion(): Promise<RespuestaAccion<CatalogosRfq>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_vista'))) {
    return { exito: false, error: 'Sin permiso para ver RFQ' };
  }

  const admin = crearClienteSupabaseAdmin();
  const [materiales, espesores, procesos, canales, proximasAcciones, usuarios] = await Promise.all([
    admin
      .from('catalogo_materiales')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .order('orden'),
    admin
      .from('catalogo_espesores')
      .select('id, material_id, etiqueta, espesor_mm')
      .eq('activo', true)
      .order('orden'),
    admin
      .from('catalogo_procesos')
      .select('id, codigo, nombre, requiere_archivo_tecnico')
      .eq('activo', true)
      .order('orden'),
    admin
      .from('catalogo_canales')
      .select('codigo, nombre, es_otro, activo')
      .order('orden'),
    admin
      .from('catalogo_proximas_acciones')
      .select('codigo, nombre, es_otro')
      .eq('activo', true)
      .order('orden'),
    admin
      .from('usuarios')
      .select('id, nombre_completo, rol')
      .eq('activo', true)
      .order('nombre_completo'),
  ]);

  if (
    materiales.error ||
    espesores.error ||
    procesos.error ||
    canales.error ||
    proximasAcciones.error ||
    usuarios.error
  ) {
    console.error('[RFQ] Error al cargar catálogos:', materiales.error?.message ?? espesores.error?.message);
    return { exito: false, error: 'No se pudieron cargar los catálogos' };
  }

  return {
    exito: true,
    datos: {
      materiales: (materiales.data ?? []).map((fila) => ({
        id: fila.id,
        codigo: fila.codigo,
        nombre: fila.nombre,
      })),
      espesores: (espesores.data ?? []).map((fila) => ({
        id: fila.id,
        materialId: fila.material_id,
        etiqueta: fila.etiqueta,
        espesorMm: Number(fila.espesor_mm),
      })),
      procesos: (procesos.data ?? []).map((fila) => ({
        id: fila.id,
        codigo: fila.codigo,
        nombre: fila.nombre,
        requiereArchivoTecnico: fila.requiere_archivo_tecnico,
      })),
      canales: (canales.data ?? []).map((fila) => ({
        codigo: fila.codigo,
        nombre: fila.nombre,
        esOtro: fila.es_otro,
        activo: fila.activo,
      })),
      proximasAcciones: (proximasAcciones.data ?? []).map((fila) => ({
        codigo: fila.codigo,
        nombre: fila.nombre,
        esOtro: fila.es_otro,
      })),
      usuarios: (usuarios.data ?? []).map((fila) => ({
        id: fila.id,
        nombre: fila.nombre_completo,
        rol: fila.rol,
      })),
    },
  };
}

/** Contacto vigente de un cliente para los selectores del RFQ. */
export type ContactoRfq = { id: string; nombre: string; correo: string | null };

const esquemaContactosCliente = z.object({ clienteId: z.uuid() }).strict();

/** Server Action: contactos activos de un cliente (ficha RFQ). */
export async function obtenerContactosClienteRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ContactoRfq[]>> {
  const resultado = esquemaContactosCliente.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_vista'))) {
    return { exito: false, error: 'Sin permiso para ver RFQ' };
  }

  const { data, error } = await crearClienteSupabaseAdmin()
    .from('contactos_cliente')
    .select('id, nombre, correo')
    .eq('cliente_id', resultado.data.clienteId)
    .eq('activo', true)
    .order('es_principal', { ascending: false })
    .order('nombre');

  if (error) {
    return { exito: false, error: 'No se pudieron cargar los contactos' };
  }

  return {
    exito: true,
    datos: (data ?? []).map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      correo: fila.correo,
    })),
  };
}
