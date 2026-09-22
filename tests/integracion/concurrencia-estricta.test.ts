import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';

/**
 * Prioriza `process.env` (override explícito del runner/CI) y cae a
 * `.env.local` solo si la variable no está definida.
 */
function leerVariableEnv(nombre: string): string | undefined {
  if (process.env[nombre]) return process.env[nombre];
  try {
    const rutaEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local');
    const contenido = readFileSync(rutaEnv, 'utf8');
    const coincidencia = contenido.match(new RegExp(`^${nombre}=([^\\r\\n]+)`, 'm'));
    if (coincidencia?.[1]) return coincidencia[1].trim();
  } catch {
    // `.env.local` ausente; se usa solo `process.env`.
  }
  return undefined;
}

const URL_SUPABASE = leerVariableEnv('NEXT_PUBLIC_SUPABASE_URL');
const CLAVE_SERVICE_ROLE = leerVariableEnv('SUPABASE_SERVICE_ROLE_KEY');

/**
 * Guardia dura: estas pruebas MUTAN datos y solo pueden correr contra un
 * Supabase local (loopback). Con la URL de producción quedan omitidas, porque
 * el `.env.local` del repo apunta al proyecto remoto.
 */
const esLocal = URL_SUPABASE !== undefined && /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(URL_SUPABASE);
const describir = esLocal && CLAVE_SERVICE_ROLE ? describe : describe.skip;

type Contexto = {
  admin: SupabaseClient<Database>;
  usuarioId: string;
  clienteId: string;
  ordenesIds: string[];
  materialId: string | null;
};

const contexto: Contexto = {
  admin: null as unknown as SupabaseClient<Database>,
  usuarioId: '',
  clienteId: '',
  ordenesIds: [],
  materialId: null,
};

async function crearUsuarioAdmin(admin: SupabaseClient<Database>, sufijo: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `e2e-concurrencia-${sufijo}@orca.local`,
    password: `E2e!${randomUUID()}Cc9`,
    email_confirm: true,
    user_metadata: { nombre_completo: `Admin Concurrencia ${sufijo}` },
  });
  if (error || !data.user) throw new Error(`No se creó el usuario E2E: ${error?.message}`);
  const { error: errorPerfil } = await admin
    .from('usuarios')
    .update({ rol: 'admin', activo: true, nombre_completo: `Admin Concurrencia ${sufijo}` })
    .eq('id', data.user.id);
  if (errorPerfil) throw new Error(`No se preparó el perfil E2E: ${errorPerfil.message}`);
  return data.user.id;
}

async function crearCliente(admin: SupabaseClient<Database>, sufijo: string): Promise<string> {
  const { data, error } = await admin
    .from('clientes')
    .insert({
      nombre_comercial: `Cliente Concurrencia ${sufijo}`,
      razon_social: `Cliente E2E Concurrencia ${sufijo} SA de CV`,
      estado: 'activo',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`No se creó el cliente E2E: ${error?.message}`);
  return data.id;
}

async function crearOrden(
  admin: SupabaseClient<Database>,
  clienteId: string,
  estado: 'programada' | 'en_proceso',
): Promise<string> {
  const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', {
    p_prefijo: 'OP',
  });
  if (errorFolio || !folio) throw new Error(`Sin folio E2E: ${errorFolio?.message}`);
  const { data, error } = await admin
    .from('ordenes_produccion')
    .insert({
      folio,
      cliente_id: clienteId,
      estado,
      prioridad: 'normal',
      fecha_compromiso: '2099-12-31T18:00:00.000Z',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`No se creó la orden E2E: ${error?.message}`);
  contexto.ordenesIds.push(data.id);
  return data.id;
}

describir('concurrencia estricta sobre RPC críticas (integración local)', () => {
  beforeAll(async () => {
    contexto.admin = createClient<Database>(URL_SUPABASE!, CLAVE_SERVICE_ROLE!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const sufijo = randomUUID().slice(0, 8);
    contexto.usuarioId = await crearUsuarioAdmin(contexto.admin, sufijo);
    contexto.clienteId = await crearCliente(contexto.admin, sufijo);
  });

  afterAll(async () => {
    const admin = contexto.admin;
    if (!admin || contexto.ordenesIds.length === 0) return;
    // Limpieza por IDs creados por la prueba; nada de borrados masivos.
    await admin.from('pagos_ar').delete().in('ar_id', await idsDeAr(admin));
    await admin.from('cuentas_por_cobrar').delete().in('orden_id', contexto.ordenesIds);
    await admin.from('registros_consumo_material').delete().in('partida_id', await idsDePartidas(admin));
    if (contexto.materialId) {
      await admin.from('movimientos_inventario').delete().eq('material_id', contexto.materialId);
      await admin.from('materiales').delete().eq('id', contexto.materialId);
    }
    await admin.from('partidas_orden_produccion').delete().in('orden_id', contexto.ordenesIds);
    await admin.from('ordenes_produccion').delete().in('id', contexto.ordenesIds);
    if (contexto.clienteId) await admin.from('clientes').delete().eq('id', contexto.clienteId);
    if (contexto.usuarioId) {
      await admin.from('logs').delete().eq('usuario_id', contexto.usuarioId);
      await admin.from('usuarios').delete().eq('id', contexto.usuarioId);
      await admin.auth.admin.deleteUser(contexto.usuarioId);
    }
  });

  async function idsDePartidas(admin: SupabaseClient<Database>): Promise<string[]> {
    const { data } = await admin
      .from('partidas_orden_produccion')
      .select('id')
      .in('orden_id', contexto.ordenesIds);
    return (data ?? []).map((fila) => fila.id);
  }

  async function idsDeAr(admin: SupabaseClient<Database>): Promise<string[]> {
    const { data } = await admin
      .from('cuentas_por_cobrar')
      .select('id')
      .in('orden_id', contexto.ordenesIds);
    return (data ?? []).map((fila) => fila.id);
  }

  it('dos aprobaciones simultáneas crean una sola orden', async () => {
    const admin = contexto.admin;
    const sufijo = randomUUID().slice(0, 8);

    const { data: folioOp, error: errorFolio } = await admin.rpc('generar_folio_op');
    if (errorFolio || !folioOp) throw new Error(`Sin folio comercial: ${errorFolio?.message}`);
    const { data: oportunidad, error: errorOportunidad } = await admin
      .from('pipeline')
      .insert({
        folio_op: folioOp,
        empresa: `Concurrencia ${sufijo}`,
        nombre_contacto: 'Contacto Concurrencia',
        vendedor_id: contexto.usuarioId,
        cliente_id: contexto.clienteId,
        etapa: 'negociacion',
        moneda: 'MXN',
        prioridad: 'normal',
      })
      .select('id')
      .single();
    if (errorOportunidad || !oportunidad) {
      throw new Error(`No se creó la oportunidad E2E: ${errorOportunidad?.message}`);
    }
    const { error: errorLinea } = await admin.from('cotizacion_lineas').insert({
      pipeline_id: oportunidad.id,
      descripcion: 'Pieza de concurrencia',
      cantidad: 1,
      precio_unitario: 1000,
      procesos: [],
      es_externo: false,
      es_descuento: false,
    });
    if (errorLinea) throw new Error(`No se creó la línea E2E: ${errorLinea.message}`);

    // Dos conexiones independientes: cada cliente HTTP abre su propia sesión.
    const clienteA = createClient<Database>(URL_SUPABASE!, CLAVE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });
    const clienteB = createClient<Database>(URL_SUPABASE!, CLAVE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });
    const argumentos = {
      p_pipeline_id: oportunidad.id,
      p_cliente_id: contexto.clienteId,
      p_fecha_compromiso: '2099-12-31T18:00:00.000Z',
    };

    try {
      const [respuestaA, respuestaB] = await Promise.all([
        clienteA.rpc('aprobar_oportunidad_y_crear_orden', argumentos),
        clienteB.rpc('aprobar_oportunidad_y_crear_orden', argumentos),
      ]);

      expect(respuestaA.error).toBeNull();
      expect(respuestaB.error).toBeNull();
      const resultados = [respuestaA.data?.[0], respuestaB.data?.[0]];
      expect(resultados[0]?.folio).toBe(resultados[1]?.folio);
      // Una de las dos respuestas representa la aprobación idempotente.
      expect(resultados.filter((fila) => fila?.ya_existia === true)).toHaveLength(1);

      const { data: ordenes } = await admin
        .from('ordenes_produccion')
        .select('id')
        .eq('cotizacion_id', oportunidad.id);
      expect(ordenes).toHaveLength(1);
    } finally {
      const { data: ordenes } = await admin
        .from('ordenes_produccion')
        .select('id')
        .eq('cotizacion_id', oportunidad.id);
      const ordenesIds = (ordenes ?? []).map((fila) => fila.id);
      if (ordenesIds.length > 0) {
        const { data: cuentas } = await admin
          .from('cuentas_por_cobrar')
          .select('id')
          .in('orden_id', ordenesIds);
        const arIds = (cuentas ?? []).map((fila) => fila.id);
        if (arIds.length > 0) {
          await admin.from('pagos_ar').delete().in('ar_id', arIds);
          await admin.from('cuentas_por_cobrar').delete().in('id', arIds);
        }
        await admin.from('partidas_orden_produccion').delete().in('orden_id', ordenesIds);
        await admin.from('ordenes_produccion').delete().in('id', ordenesIds);
      }
      await admin.from('cotizacion_lineas').delete().eq('pipeline_id', oportunidad.id);
      await admin.from('pipeline').delete().eq('id', oportunidad.id);
    }
  });

  it('dos pagos simultáneos con la misma solicitud registran un solo movimiento', async () => {
    const admin = contexto.admin;
    const ordenId = await crearOrden(admin, contexto.clienteId, 'programada');
    const { error: errorAr } = await admin.from('cuentas_por_cobrar').insert({
      orden_id: ordenId,
      cliente_id: contexto.clienteId,
      monto_total: 500,
      saldo_pendiente: 500,
      moneda: 'MXN',
      tipo_cambio_origen: 1,
      estado: 'pendiente',
      cobrable_desde: '2026-09-01T00:00:00.000Z',
      fecha_vencimiento: '2099-12-31T00:00:00.000Z',
    });
    if (errorAr) throw new Error(`No se creó la AR E2E: ${errorAr.message}`);
    const { data: ar } = await admin
      .from('cuentas_por_cobrar')
      .select('id')
      .eq('orden_id', ordenId)
      .single();
    const solicitudId = randomUUID();

    const clienteA = createClient<Database>(URL_SUPABASE!, CLAVE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });
    const clienteB = createClient<Database>(URL_SUPABASE!, CLAVE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });
    const argumentos = {
      p_ar_id: ar!.id,
      p_monto_pagado: 200,
      p_moneda_pago: 'MXN',
      p_tipo_cambio_pago: 1,
      p_metodo_pago: 'transferencia',
      p_referencia: 'E2E-CONC',
      p_usuario_id: contexto.usuarioId,
      p_solicitud_id: solicitudId,
    };

    const [respuestaA, respuestaB] = await Promise.all([
      clienteA.rpc('registrar_pago_ar_atomico', argumentos),
      clienteB.rpc('registrar_pago_ar_atomico', argumentos),
    ]);

    const errores = [respuestaA.error, respuestaB.error].filter((error) => error !== null);
    // La llave idempotente puede resolver ambas o rechazar la duplicada; en
    // ningún caso puede haber dos pagos por la misma solicitud.
    const pagos = [respuestaA.data?.[0], respuestaB.data?.[0]].filter(Boolean);
    expect(errores.length + pagos.length).toBeGreaterThanOrEqual(1);
    if (pagos.length === 2) {
      expect(pagos[0]?.pago_id).toBe(pagos[1]?.pago_id);
    }

    const { data: cuentas } = await admin
      .from('cuentas_por_cobrar')
      .select('saldo_pendiente')
      .eq('id', ar!.id)
      .single();
    expect(Number(cuentas?.saldo_pendiente)).toBe(300);

    const { count } = await admin
      .from('pagos_ar')
      .select('id', { count: 'exact', head: true })
      .eq('ar_id', ar!.id);
    expect(count).toBe(1);
  });

  it('dos consumos simultáneos no dejan stock negativo ni descuentan dos veces', async () => {
    const admin = contexto.admin;
    const ordenId = await crearOrden(admin, contexto.clienteId, 'en_proceso');
    const sufijo = randomUUID().slice(0, 6);
    const { data: partida, error: errorPartida } = await admin
      .from('partidas_orden_produccion')
      .insert({
        orden_id: ordenId,
        codigo_pieza: `E2E-CONC-${sufijo}`,
        descripcion: 'Partida de concurrencia',
        cantidad_solicitada: 1,
        unidad_medida: 'pieza',
      })
      .select('id')
      .single();
    if (errorPartida || !partida) throw new Error(`Sin partida E2E: ${errorPartida?.message}`);

    const { data: material, error: errorMaterial } = await admin
      .from('materiales')
      .insert({
        codigo: `MAT-CONC-${sufijo}`,
        nombre: `Material Concurrencia ${sufijo}`,
        categoria: 'materia_prima',
        unidad_compra: 'barra',
        unidad_control: 'kg',
        factor_conversion: 1,
        stock_actual_control: 10,
        costo_unitario_control: 10,
        costo_unitario_compra: 10,
      })
      .select('id')
      .single();
    if (errorMaterial || !material) throw new Error(`Sin material E2E: ${errorMaterial?.message}`);
    contexto.materialId = material.id;

    const clienteA = createClient<Database>(URL_SUPABASE!, CLAVE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });
    const clienteB = createClient<Database>(URL_SUPABASE!, CLAVE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });
    const argumentos = {
      p_partida_id: partida.id,
      p_material_id: material.id,
      p_cantidad_usada: 7,
      p_cantidad_scrap: 0,
    };

    const [respuestaA, respuestaB] = await Promise.all([
      clienteA.rpc('registrar_consumo_material_op', argumentos),
      clienteB.rpc('registrar_consumo_material_op', argumentos),
    ]);

    const exitos = [respuestaA, respuestaB].filter((respuesta) => respuesta.error === null);
    expect(exitos).toHaveLength(1);

    const { data: materialFinal } = await admin
      .from('materiales')
      .select('stock_actual_control')
      .eq('id', material.id)
      .single();
    expect(Number(materialFinal?.stock_actual_control)).toBe(3);

    const { count } = await admin
      .from('registros_consumo_material')
      .select('id', { count: 'exact', head: true })
      .eq('partida_id', partida.id);
    expect(count).toBe(1);
  });
});
