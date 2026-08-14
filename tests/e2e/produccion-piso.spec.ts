import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

function cargarEntornoLocal(): void {
  if (!existsSync('.env.local')) return;
  for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    process.env[coincidencia[1]] = coincidencia[2].replace(/^['"]|['"]$/g, '');
  }
}

cargarEntornoLocal();

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correoAdministrador: string;
  contrasenaAdministrador: string;
  pinOperador: string;
  administradorId: string;
  operadorId: string;
  clienteId: string;
  recursoId: string;
  ordenId: string;
  partidaId: string;
  programacionId: string;
};

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} para las pruebas E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  return createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function crearUsuario(
  admin: SupabaseClient<Database>,
  correo: string,
  contrasena: string,
  nombreCompleto: string,
  rol: 'admin' | 'operador',
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: nombreCompleto },
  });
  if (error || !data.user) throw new Error(`No se pudo crear usuario E2E: ${error?.message ?? 'sin usuario'}`);
  const { error: errorPerfil } = await admin
    .from('usuarios')
    .update({ rol, activo: true, nombre_completo: nombreCompleto })
    .eq('id', data.user.id);
  if (errorPerfil) throw new Error(`No se pudo preparar perfil E2E: ${errorPerfil.message}`);
  return data.user.id;
}

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = crearAdmin();
  const sufijo = randomUUID().slice(0, 8);
  const correoAdministrador = `e2e-prd-admin-${sufijo}@orca.local`;
  const contrasenaAdministrador = `E2e!${randomUUID()}Aa9`;
  const pinOperador = '4826';
  const administradorId = await crearUsuario(
    admin, correoAdministrador, contrasenaAdministrador, `Administrador Producción ${sufijo}`, 'admin',
  );
  const operadorId = await crearUsuario(
    admin, `e2e-prd-operador-${sufijo}@orca.local`, `E2e!${randomUUID()}Bb9`, `Operador Producción ${sufijo}`, 'operador',
  );
  const { error: errorPin } = await admin
    .from('usuarios')
    .update({ pin_operador: await bcrypt.hash(pinOperador, 10) })
    .eq('id', operadorId);
  if (errorPin) throw new Error(`No se pudo configurar PIN E2E: ${errorPin.message}`);

  const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
    codigo: `E2E-PRD-${sufijo.toUpperCase()}`,
    nombre: `Recurso E2E Producción ${sufijo}`,
    area: 'taller',
    activo: true,
  }).select('id').single();
  if (errorRecurso || !recurso) throw new Error(`No se pudo crear recurso E2E: ${errorRecurso?.message ?? 'sin recurso'}`);
  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `Cliente Producción ${sufijo}`,
    razon_social: `Cliente E2E Producción ${sufijo} SA de CV`,
    estado: 'activo',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`No se pudo crear cliente E2E: ${errorCliente?.message ?? 'sin cliente'}`);

  const { error: errorCapacidad } = await admin.from('capacidades_recurso_turno').insert([
    { recurso_id: recurso.id, turno: 'matutino', horas_capacidad: 8 },
    { recurso_id: recurso.id, turno: 'vespertino', horas_capacidad: 8 },
  ]);
  if (errorCapacidad) throw new Error(`No se pudo crear capacidad E2E: ${errorCapacidad.message}`);

  const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
  if (errorFolio || !folio) throw new Error(`No se pudo generar folio E2E: ${errorFolio?.message ?? 'sin folio'}`);
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio,
    cliente_id: cliente.id,
    estado: 'programada',
    prioridad: 'alta',
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`No se pudo crear orden E2E: ${errorOrden?.message ?? 'sin orden'}`);

  const { data: partida, error: errorPartida } = await admin.from('partidas_orden_produccion').insert({
    orden_id: orden.id,
    codigo_pieza: `E2E-PRD-${sufijo}`,
    descripcion: 'Partida temporal para comprobar sesiones y entregas',
    cantidad_solicitada: 5,
    cantidad_producida: 0,
    cantidad_scrap: 0,
    unidad_medida: 'pieza',
    tiempo_estimado_minutos: 120,
    tiempo_real_minutos: 0,
    operador_asignado_id: operadorId,
  }).select('id').single();
  if (errorPartida || !partida) throw new Error(`No se pudo crear partida E2E: ${errorPartida?.message ?? 'sin partida'}`);

  const { data: programacion, error: errorProgramacion } = await admin.rpc('programar_partida_recurso', {
    p_orden_id: orden.id,
    p_partida_id: partida.id,
    p_recurso_id: recurso.id,
    p_secuencia: 1,
    p_fecha_programada: '2099-12-30',
    p_turno: 'matutino',
    p_horas_estimadas: 2,
    p_orden_prioridad: 1,
  });
  if (errorProgramacion || !programacion?.[0]) throw new Error(`No se pudo programar partida E2E: ${errorProgramacion?.message ?? 'sin programación'}`);
  const { data: preparada, error: errorPreparada } = await admin.rpc('activar_modo_preparacion', {
    p_programacion_id: programacion[0].id,
    p_actualizado_en_esperado: programacion[0].actualizado_en,
  });
  if (errorPreparada || !preparada?.[0]) throw new Error(`No se pudo preparar recurso E2E: ${errorPreparada?.message ?? 'sin respuesta'}`);

  return {
    admin, correoAdministrador, contrasenaAdministrador, pinOperador, administradorId, operadorId,
    clienteId: cliente.id, recursoId: recurso.id, ordenId: orden.id, partidaId: partida.id,
    programacionId: preparada[0].id,
  };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  const { data: notas } = await admin.from('notas_entrega').select('id').eq('orden_id', contexto.ordenId);
  const notasIds = (notas ?? []).map((nota) => nota.id);
  if (notasIds.length > 0) await admin.from('partidas_nota_entrega').delete().in('nota_entrega_id', notasIds);
  await admin.from('notas_entrega').delete().eq('orden_id', contexto.ordenId);
  await admin.from('registros_avance_partida').delete().eq('partida_id', contexto.partidaId);
  await admin.from('registros_tiempo_operador').delete().eq('partida_id', contexto.partidaId);
  await admin.from('sesiones_trabajo').delete().eq('partida_id', contexto.partidaId);
  await admin.from('programacion_areas').delete().eq('id', contexto.programacionId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('capacidades_recurso_turno').delete().eq('recurso_id', contexto.recursoId);
  await admin.from('recursos_planeacion').delete().eq('id', contexto.recursoId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().in('usuario_id', [contexto.administradorId, contexto.operadorId]);
  await admin.from('usuarios').delete().in('id', [contexto.administradorId, contexto.operadorId]);
  await admin.auth.admin.deleteUser(contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.operadorId);
}

async function iniciarSesionAdministrador(page: import('@playwright/test').Page, contexto: ContextoE2E): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(contexto.correoAdministrador);
  await page.getByLabel('Contraseña').fill(contexto.contrasenaAdministrador);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL('**/tablero');
}

test.describe.serial('piso de Producción y entregas', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase remoto.',
  );

  let contexto: ContextoE2E | null = null;

  test.beforeAll(async () => {
    contexto = await prepararContexto();
  });

  test.afterAll(async () => {
    if (contexto) await limpiarContexto(contexto);
  });

  test('inicia con PIN, completa la partida y genera entregas parcial y total sincronizadas', async ({ page, browser }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const contextoPrueba = contexto;
    await iniciarSesionAdministrador(page, contextoPrueba);
    const observador = await browser.newPage();
    await iniciarSesionAdministrador(observador, contextoPrueba);
    await observador.goto('/produccion');
    await expect(observador.getByTestId(`tarjeta-produccion-${contextoPrueba.ordenId}`)).toContainText('Bandeja');
    await expect(observador.getByTestId('sincronizador-produccion')).toHaveAttribute('data-conectado', 'true');

    await page.goto('/operador');
    for (const digito of contextoPrueba.pinOperador) {
      await page.getByRole('button', { name: digito, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Confirmar PIN' }).click();
    await page.waitForURL('**/produccion-piso');
    await page.goto('/produccion');
    await expect(page.getByTestId('operacion-produccion')).toBeVisible();

    const tarjeta = page.getByTestId(`tarjeta-produccion-${contextoPrueba.ordenId}`);
    await tarjeta.getByRole('button', { name: 'Operar orden' }).click();
    await page.getByTestId('iniciar-sesion-produccion').click();
    await expect(page.getByRole('status')).toContainText('Sesión iniciada');
    await expect(observador.getByTestId(`tarjeta-produccion-${contextoPrueba.ordenId}`)).toContainText('En proceso');

    await page.getByLabel('Piezas producidas ahora').fill('5');
    await page.getByLabel('Confirmar PIN').fill(contextoPrueba.pinOperador);
    await page.getByTestId('cerrar-sesion-produccion').click();
    await expect(page.getByRole('status')).toContainText('Sesión registrada');

    await expect.poll(async () => {
      const { data } = await contextoPrueba.admin
        .from('partidas_orden_produccion')
        .select('cantidad_producida')
        .eq('id', contextoPrueba.partidaId)
        .single();
      return Number(data?.cantidad_producida ?? 0);
    }).toBe(5);
    const { data: programacion } = await contextoPrueba.admin
      .from('programacion_areas')
      .select('estado_planeacion')
      .eq('id', contextoPrueba.programacionId)
      .single();
    expect(programacion?.estado_planeacion).toBe('completada');

    await page.getByLabel('Recibido por').fill('Almacén E2E');
    await page.getByLabel(/Cantidad entregada E2E-PRD-/).fill('2');
    await page.getByTestId('generar-nota-entrega').click();
    await expect(page.getByTestId('panel-nota-entrega').getByRole('status')).toContainText(/^Nota NE-\d{6} generada$/);
    await expect(observador.getByTestId(`tarjeta-produccion-${contextoPrueba.ordenId}`)).toContainText('Lista');

    await page.getByLabel('Recibido por').fill('Almacén E2E');
    await page.getByLabel(/Cantidad entregada E2E-PRD-/).fill('3');
    await page.getByTestId('generar-nota-entrega').click();
    await expect(page.getByTestId('panel-nota-entrega').getByRole('status')).toContainText(/^Nota NE-\d{6} generada$/);
    await expect(observador.getByTestId(`tarjeta-produccion-${contextoPrueba.ordenId}`)).toContainText('Entregada');

    const { data: notas, error: errorNotas } = await contextoPrueba.admin
      .from('notas_entrega')
      .select('*')
      .eq('orden_id', contextoPrueba.ordenId)
      .order('creado_en');
    expect(errorNotas).toBeNull();
    expect(notas).toHaveLength(2);
    expect(notas?.map((nota) => nota.es_parcial)).toEqual([true, false]);
    expect(Object.keys(notas?.[0] ?? {})).not.toContain('precio');

    const { data: logs } = await contextoPrueba.admin
      .from('logs')
      .select('accion')
      .eq('modulo', 'produccion')
      .in('usuario_id', [contextoPrueba.administradorId, contextoPrueba.operadorId]);
    const acciones = new Set((logs ?? []).map((log) => log.accion));
    for (const accion of ['iniciar_sesion_trabajo', 'cerrar_sesion_trabajo', 'generar_nota_entrega']) {
      expect(acciones.has(accion)).toBe(true);
    }
    await observador.close();
  });
});
