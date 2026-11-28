import { randomInt, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

test.skip(
  process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
  'El ciclo de lotes requiere el entorno remoto de E2E habilitado.',
);

type ContextoLote = {
  admin: SupabaseClient<Database>;
  correoAdministrador: string;
  contrasenaAdministrador: string;
  pinOperador: string;
  administradorId: string;
  operadorId: string;
  clienteId: string;
  materialId: string;
  materialLegacyId: string;
  recursoId: string;
  ordenId: string;
  partidaIds: string[];
  programacionIds: string[];
};

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} para las pruebas E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  const url = requerirVariable('NEXT_PUBLIC_SUPABASE_URL');
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('La E2E de lotes exige loopback explícito.');
  }
  return createClient<Database>(url, requerirVariable('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function crearUsuario(
  admin: SupabaseClient<Database>,
  correo: string,
  contrasena: string,
  nombre: string,
  rol: 'admin' | 'operador',
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: nombre },
  });
  if (error || !data.user) throw new Error(`No se pudo crear usuario E2E: ${error?.message ?? 'sin usuario'}`);
  const { error: errorPerfil } = await admin
    .from('usuarios')
    .update({ rol, activo: true, nombre_completo: nombre })
    .eq('id', data.user.id);
  if (errorPerfil) throw new Error(`No se pudo preparar perfil E2E: ${errorPerfil.message}`);
  return data.user.id;
}

async function prepararContexto(): Promise<ContextoLote> {
  const admin = crearAdmin();
  const sufijo = randomUUID().slice(0, 8);
  const correoAdministrador = `e2e-lote-admin-${sufijo}@orca.local`;
  const contrasenaAdministrador = `E2e!${randomUUID()}Aa9`;
  const pinOperador = String(randomInt(100000, 1000000));
  const administradorId = await crearUsuario(
    admin, correoAdministrador, contrasenaAdministrador, `Admin Lote ${sufijo}`, 'admin',
  );
  const operadorId = await crearUsuario(
    admin, `e2e-lote-operador-${sufijo}@orca.local`, `E2e!${randomUUID()}Bb9`, `Operador Lote ${sufijo}`, 'operador',
  );
  const { error: errorPin } = await admin
    .from('usuarios')
    .update({ pin_operador: await bcrypt.hash(pinOperador, 10) })
    .eq('id', operadorId);
  if (errorPin) throw new Error(`No se pudo configurar PIN E2E: ${errorPin.message}`);

  const { data: materialLegacy, error: errorLegacy } = await admin.from('materiales').insert({
    codigo: `E2E-LOTE-${sufijo.toUpperCase()}`,
    nombre: `Material E2E Lote ${sufijo}`,
    categoria: 'materia_prima',
    unidad_compra: 'pieza',
    unidad_control: 'pieza',
    factor_conversion: 1,
    costo_unitario_compra: 50,
    costo_unitario_control: 50,
    stock_actual_control: 100,
    stock_minimo_control: 0,
    stock_reservado_control: 0,
  }).select('id').single();
  if (errorLegacy || !materialLegacy) throw new Error(`No se pudo crear material E2E: ${errorLegacy?.message ?? 'sin fila'}`);
  const { data: material, error: errorMaterial } = await admin.from('catalogo_materiales').insert({
    codigo: `E2EC-LOTE-${sufijo.toUpperCase()}`,
    nombre: `Material canónico E2E Lote ${sufijo}`,
    unidad_base: 'pieza',
    material_legacy_id: materialLegacy.id,
  }).select('id, actualizado_en').single();
  if (errorMaterial || !material) throw new Error(`No se pudo crear catálogo E2E: ${errorMaterial?.message ?? 'sin fila'}`);
  const { error: errorCosto } = await admin.rpc('confirmar_costo_material', {
    p_material_id: material.id,
    p_costo: 50,
    p_moneda: 'MXN',
    p_fecha_efectiva: '2099-01-01',
    p_fuente: 'MANUAL',
    p_referencia: '',
    p_actor_id: administradorId,
    p_actualizado_en: material.actualizado_en,
  });
  if (errorCosto) throw new Error(`No se confirmó costo E2E: ${errorCosto.message}`);
  const { error: errorEspesor } = await admin.from('catalogo_espesores').insert({
    material_id: material.id,
    etiqueta: '1.4 mm',
    espesor_mm: 1.4,
    activo: true,
    orden: 1,
  });
  if (errorEspesor) throw new Error(`No se pudo crear espesor E2E: ${errorEspesor.message}`);

  const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
    codigo: `E2E-LOTE-${sufijo.toUpperCase()}`,
    nombre: `Recurso E2E Lote ${sufijo}`,
    area: 'taller',
    activo: true,
  }).select('id').single();
  if (errorRecurso || !recurso) throw new Error(`No se pudo crear recurso E2E: ${errorRecurso?.message ?? 'sin fila'}`);
  const { error: errorCapacidad } = await admin.from('capacidades_recurso_turno').insert({
    recurso_id: recurso.id, turno: 'matutino', horas_capacidad: 8,
  });
  if (errorCapacidad) throw new Error(`No se pudo crear capacidad E2E: ${errorCapacidad.message}`);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `Cliente Lote ${sufijo}`,
    razon_social: `Cliente E2E Lote ${sufijo} SA de CV`,
    estado: 'activo',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`No se pudo crear cliente E2E: ${errorCliente?.message ?? 'sin fila'}`);

  const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
  if (errorFolio || !folio) throw new Error(`No se pudo generar folio E2E: ${errorFolio?.message ?? 'sin folio'}`);
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio,
    cliente_id: cliente.id,
    estado: 'programada',
    prioridad: 'normal',
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`No se pudo crear orden E2E: ${errorOrden?.message ?? 'sin fila'}`);

  const partidaIds: string[] = [];
  const programacionIds: string[] = [];
  for (const codigo of ['IT01', 'IT02']) {
    const { data: partida, error: errorPartida } = await admin.from('partidas_orden_produccion').insert({
      orden_id: orden.id,
      codigo_pieza: codigo,
      descripcion: `Pieza ${codigo} E2E Lote`,
      cantidad_solicitada: 10,
      cantidad_producida: 0,
      cantidad_scrap: 0,
      unidad_medida: 'pieza',
      catalogo_material_id: material.id,
      procesos: ['Láser fibra'],
      operador_asignado_id: operadorId,
    }).select('id').single();
    if (errorPartida || !partida) throw new Error(`No se pudo crear partida E2E: ${errorPartida?.message ?? 'sin fila'}`);
    partidaIds.push(partida.id);

    const { data: programacion, error: errorProgramacion } = await admin.rpc('programar_partida_recurso_auditada', {
      p_orden_id: orden.id,
      p_partida_id: partida.id,
      p_recurso_id: recurso.id,
      p_secuencia: 1,
      p_fecha_programada: '2099-12-30',
      p_turno: 'matutino',
      p_horas_estimadas: 2,
      p_orden_prioridad: 1,
      p_actor_id: administradorId,
      p_correlation_id: randomUUID(),
    });
    if (errorProgramacion || !programacion?.[0]) {
      throw new Error(`No se pudo programar partida E2E: ${errorProgramacion?.message ?? 'sin respuesta'}`);
    }
    const { data: preparada, error: errorPreparada } = await admin.rpc('activar_modo_preparacion', {
      p_programacion_id: programacion[0].id,
      p_actualizado_en_esperado: programacion[0].actualizado_en,
    });
    if (errorPreparada || !preparada?.[0]) {
      throw new Error(`No se pudo preparar programación E2E: ${errorPreparada?.message ?? 'sin respuesta'}`);
    }
    programacionIds.push(preparada[0].id);
  }

  return {
    admin, correoAdministrador, contrasenaAdministrador, pinOperador, administradorId, operadorId,
    clienteId: cliente.id, materialId: material.id, materialLegacyId: materialLegacy.id,
    recursoId: recurso.id, ordenId: orden.id, partidaIds, programacionIds,
  };
}

async function limpiarContexto(contexto: ContextoLote): Promise<void> {
  const { admin } = contexto;
  const { data: corridas } = await admin.from('corridas').select('id').eq('orden_id', contexto.ordenId);
  const ids = (corridas ?? []).map((corrida) => corrida.id);
  if (ids.length > 0) {
    await admin.from('sesiones_trabajo').delete().in('corrida_id', ids);
    await admin.from('registros_avance_partida').delete().in('partida_id', contexto.partidaIds);
    await admin.from('registros_tiempo_operador').delete().in('partida_id', contexto.partidaIds);
    await admin.from('registros_consumo_material').delete().in('partida_id', contexto.partidaIds);
    await admin.from('inspecciones_calidad').delete().in('corrida_id', ids);
    await admin.from('corrida_items').delete().in('corrida_id', ids);
    await admin.from('corridas').delete().in('id', ids);
  }
  await admin.from('programacion_areas').delete().in('id', contexto.programacionIds);
  await admin.from('partidas_orden_produccion').delete().in('id', contexto.partidaIds);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('catalogo_espesores').delete().eq('material_id', contexto.materialId);
  await admin.from('capacidades_recurso_turno').delete().eq('recurso_id', contexto.recursoId);
  await admin.from('recursos_planeacion').delete().eq('id', contexto.recursoId);
  await admin.from('logs').delete().in('usuario_id', [contexto.administradorId, contexto.operadorId]);
  await admin.from('catalogo_materiales').delete().eq('id', contexto.materialId);
  await admin.from('materiales').delete().eq('id', contexto.materialLegacyId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.auth.admin.deleteUser(contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.operadorId);
}

test('crear lote, iniciar con checklist y dejar la tarjeta en En proceso', async ({ page }) => {
  test.setTimeout(300_000);
  const contexto = await prepararContexto();
  try {
    await page.goto('/operador');
    for (const digito of contexto.pinOperador) {
      await page.getByRole('button', { name: digito, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Confirmar PIN' }).click();
    await page.waitForURL('**/produccion-piso');
    await expect(page.getByTestId('espacio-operador')).toBeVisible();

    const tarjetaOrden = page.getByTestId(`orden-operador-${contexto.ordenId}`);
    await expect(tarjetaOrden).toBeVisible();
    await tarjetaOrden.getByTestId(/^abrir-detalle-/).first().click();
    await expect(page.getByTestId('detalle-proceso')).toBeVisible();
    await expect(page.getByTestId(/^sugerencia-lote-detalle-/)).toBeVisible();
    await page.getByTestId(/^crear-lote-detalle-/).click();

    await expect(page.getByTestId('dialogo-confirmar-lote')).toBeVisible();
    await expect(page.getByTestId('confirmar-lote-items')).toContainText('IT01');
    await expect(page.getByTestId('confirmar-lote-items')).toContainText('IT02');
    await page.getByTestId('confirmar-crear-lote').click();
    await expect(page.getByTestId('aviso-espacio')).toContainText('creado con 2 ítems');

    const columnaBandeja = page.getByTestId('columna-bandeja');
    const tarjetaLote = columnaBandeja.getByTestId(/^tarjeta-lote-piso-/);
    await expect(tarjetaLote).toBeVisible();
    await expect(tarjetaLote).toContainText('Planificada');
    await tarjetaLote.click();

    await expect(page.getByTestId('dialogo-detalle-lote')).toBeVisible();
    await expect(page.getByTestId('item-lote-' + contexto.partidaIds[0])).toBeVisible();
    await page.getByTestId('iniciar-corrida-lote').click();

    const checklist = page.getByTestId('checklist-inicio');
    await expect(checklist).toBeVisible();
    for (const casilla of await checklist.getByRole('checkbox').all()) await casilla.check();
    await checklist.getByTestId('confirmar-checklist-inicio').click();

    await expect.poll(async () => {
      const { data } = await contexto.admin.from('corridas')
        .select('estado').eq('orden_id', contexto.ordenId).maybeSingle();
      return data?.estado ?? '';
    }).toBe('EN_PROCESO');

    await expect(page.getByTestId('columna-en_proceso').getByTestId(/^tarjeta-lote-piso-/)).toBeVisible();
    await page.getByTestId('columna-en_proceso').getByTestId(/^tarjeta-lote-piso-/).click();
    await expect(page.getByTestId('tiempo-acumulado-lote')).toBeVisible();
    await expect(page.getByTestId('contador-sesion-lote')).toBeVisible();
    await expect(page.getByTestId('pausar-lote')).toBeVisible();
    await expect(page.getByTestId('piezas-pausa-lote')).toBeVisible();
  } finally {
    await limpiarContexto(contexto);
  }
});
