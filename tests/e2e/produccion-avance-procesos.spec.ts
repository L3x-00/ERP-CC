import { randomInt, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correoAdministrador: string;
  contrasenaAdministrador: string;
  pinOperador: string;
  administradorId: string;
  operadorId: string;
  clienteId: string;
  ordenId: string;
  partidaId: string;
  metaCorteId: string;
  metaDobladoId: string;
  recursoIds: string[];
};

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} para las pruebas E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  const url = requerirVariable('NEXT_PUBLIC_SUPABASE_URL');
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('La E2E de avance por proceso exige loopback explícito.');
  }
  return createClient<Database>(url, requerirVariable('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
  const correoAdministrador = `e2e-prd09-admin-${sufijo}@orca.local`;
  const contrasenaAdministrador = `E2e!${randomUUID()}Aa9`;
  const pinOperador = String(randomInt(100000, 1000000));
  const administradorId = await crearUsuario(
    admin, correoAdministrador, contrasenaAdministrador, `Administrador PRD09 ${sufijo}`, 'admin',
  );
  const operadorId = await crearUsuario(
    admin, `e2e-prd09-operador-${sufijo}@orca.local`, `E2e!${randomUUID()}Bb9`, `Operador PRD09 ${sufijo}`, 'operador',
  );
  const { error: errorPin } = await admin
    .from('usuarios')
    .update({ pin_operador: await bcrypt.hash(pinOperador, 10) })
    .eq('id', operadorId);
  if (errorPin) throw new Error(`No se pudo configurar PIN E2E: ${errorPin.message}`);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `Cliente PRD09 ${sufijo}`,
    razon_social: `Cliente E2E PRD09 ${sufijo} SA de CV`,
    estado: 'activo',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`No se pudo crear cliente E2E: ${errorCliente?.message ?? 'sin fila'}`);

  const recursoIds: string[] = [];
  for (let indice = 0; indice < 3; indice++) {
    const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
      codigo: `E2E-PRD09-${sufijo.toUpperCase()}-${indice}`,
      nombre: `Recurso E2E PRD09 ${sufijo} ${indice}`,
      area: 'taller',
      activo: true,
    }).select('id').single();
    if (errorRecurso || !recurso) throw new Error(`No se pudo crear recurso E2E: ${errorRecurso?.message ?? 'sin fila'}`);
    recursoIds.push(recurso.id);
    const { error: errorCapacidad } = await admin.from('capacidades_recurso_turno').insert({
      recurso_id: recurso.id, turno: 'matutino', horas_capacidad: 8,
    });
    if (errorCapacidad) throw new Error(`No se pudo crear capacidad E2E: ${errorCapacidad.message}`);
  }

  const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
  if (errorFolio || !folio) throw new Error(`No se pudo generar folio E2E: ${errorFolio?.message ?? 'sin folio'}`);
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio,
    cliente_id: cliente.id,
    estado: 'programada',
    prioridad: 'alta',
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`No se pudo crear orden E2E: ${errorOrden?.message ?? 'sin fila'}`);

  const { data: partida, error: errorPartida } = await admin.from('partidas_orden_produccion').insert({
    orden_id: orden.id,
    codigo_pieza: `E2E-PRD09-${sufijo}`,
    descripcion: 'Partida E2E para avance por proceso',
    cantidad_solicitada: 10,
    cantidad_producida: 0,
    cantidad_scrap: 0,
    unidad_medida: 'pieza',
    procesos: ['Corte', 'Doblado'],
    operador_asignado_id: operadorId,
  }).select('id').single();
  if (errorPartida || !partida) throw new Error(`No se pudo crear partida E2E: ${errorPartida?.message ?? 'sin fila'}`);

  for (let indice = 0; indice < 3; indice++) {
    const { data: programacion, error: errorProgramacion } = await admin.rpc('programar_partida_recurso', {
      p_orden_id: orden.id,
      p_partida_id: partida.id,
      p_recurso_id: recursoIds[indice]!,
      p_secuencia: indice + 1,
      p_fecha_programada: '2099-12-30',
      p_turno: 'matutino',
      p_horas_estimadas: 2,
      p_orden_prioridad: 1,
    });
    if (errorProgramacion || !programacion?.[0]) {
      throw new Error(`No se pudo programar partida E2E: ${errorProgramacion?.message ?? 'sin respuesta'}`);
    }
    const { data: preparada, error: errorPreparada } = await admin.rpc('activar_modo_preparacion', {
      p_programacion_id: programacion[0].id,
      p_actualizado_en_esperado: programacion[0].actualizado_en,
    });
    if (errorPreparada || !preparada?.[0]) {
      throw new Error(`No se pudo preparar recurso E2E: ${errorPreparada?.message ?? 'sin respuesta'}`);
    }
  }

  const { data: metas, error: errorMetas } = await admin.from('metas_proceso_partida')
    .select('id, secuencia').eq('partida_id', partida.id).order('secuencia');
  if (errorMetas || metas?.length !== 2) throw new Error(`No se pudieron leer las metas E2E: ${errorMetas?.message ?? 'sin metas'}`);

  return {
    admin,
    correoAdministrador,
    contrasenaAdministrador,
    pinOperador,
    administradorId,
    operadorId,
    clienteId: cliente.id,
    ordenId: orden.id,
    partidaId: partida.id,
    metaCorteId: metas[0]!.id,
    metaDobladoId: metas[1]!.id,
    recursoIds,
  };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  await admin.from('registros_avance_partida').delete().eq('partida_id', contexto.partidaId);
  await admin.from('registros_tiempo_operador').delete().eq('partida_id', contexto.partidaId);
  await admin.from('sesiones_trabajo').delete().eq('partida_id', contexto.partidaId);
  await admin.from('programacion_areas').delete().eq('partida_id', contexto.partidaId);
  await admin.from('partidas_orden_produccion').delete().eq('id', contexto.partidaId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('capacidades_recurso_turno').delete().in('recurso_id', contexto.recursoIds);
  await admin.from('recursos_planeacion').delete().in('id', contexto.recursoIds);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().in('usuario_id', [contexto.administradorId, contexto.operadorId]);
  await admin.from('usuarios').delete().in('id', [contexto.administradorId, contexto.operadorId]);
  await admin.auth.admin.deleteUser(contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.operadorId);
}

async function iniciarSesionAdministrador(
  page: import('@playwright/test').Page,
  contexto: ContextoE2E,
): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(contexto.correoAdministrador);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasenaAdministrador);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
}

async function entrarComoOperador(
  page: import('@playwright/test').Page,
  contexto: ContextoE2E,
): Promise<void> {
  await page.goto('/operador');
  for (const digito of contexto.pinOperador) {
    await page.getByRole('button', { name: digito, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Confirmar PIN' }).click();
  await page.waitForURL('**/produccion-piso');
  await page.goto('/produccion');
  await expect(page.getByTestId('operacion-produccion')).toBeVisible();
}

test.describe.serial('avance por proceso en producción (PRD-09/E2E-19)', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase local.',
  );

  let contexto: ContextoE2E | null = null;

  test.beforeAll(async () => {
    contexto = await prepararContexto();
  });

  test.afterAll(async () => {
    if (contexto) await limpiarContexto(contexto);
  });

  test('acumula Corte 4, Corte 6 y Doblado 10 sin pasar a Lista antes de tiempo', async ({ page }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const caso = contexto;
    await iniciarSesionAdministrador(page, caso);
    await entrarComoOperador(page, caso);

    const tarjeta = page.getByTestId(`tarjeta-produccion-${caso.ordenId}`);
    await expect(tarjeta).toContainText('Bandeja');
    const bloqueProcesos = page.getByTestId(`avance-procesos-${caso.partidaId}`);
    await expect(bloqueProcesos).toContainText('Corte: 0.00/10.00 · 10.00 pend · 0%');
    await expect(bloqueProcesos).toContainText('Doblado: 0.00/10.00 · 10.00 pend · 0%');

    // Sesión 1: Corte 4.
    await tarjeta.getByRole('button', { name: 'Operar orden' }).click();
    await page.getByTestId('iniciar-sesion-produccion').click();
    await expect(page.getByRole('status')).toContainText('Sesión iniciada');
    await page.getByLabel('Piezas producidas ahora').fill('4');
    await page.getByTestId('meta-proceso-cierre').selectOption(caso.metaCorteId);
    await page.getByLabel('Confirmar PIN').fill(caso.pinOperador);
    await page.getByTestId('cerrar-sesion-produccion').click();
    await expect(page.getByRole('status')).toContainText('Sesión registrada');

    await expect(bloqueProcesos).toContainText('Corte: 4.00/10.00 · 6.00 pend · 40%');
    await expect(tarjeta).toContainText('0/10 piezas');
    await expect(tarjeta).not.toContainText('Lista');
    await expect(tarjeta).toContainText('En proceso');
    if (process.env.E2E_CAPTURAR_VISUAL === 'si') {
      await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-prd09-parcial-escritorio.png', fullPage: true });
    }

    // Sesión 2: Corte 6.
    await page.getByTestId('iniciar-sesion-produccion').click();
    await expect(page.getByRole('status')).toContainText('Sesión iniciada');
    await page.getByLabel('Piezas producidas ahora').fill('6');
    await page.getByTestId('meta-proceso-cierre').selectOption(caso.metaCorteId);
    await page.getByLabel('Confirmar PIN').fill(caso.pinOperador);
    await page.getByTestId('cerrar-sesion-produccion').click();
    await expect(page.getByRole('status')).toContainText('Sesión registrada');

    await expect(bloqueProcesos).toContainText('Corte: 10.00/10.00 · 0.00 pend · 100%');
    await expect(bloqueProcesos).toContainText('Doblado: 0.00/10.00 · 10.00 pend · 0%');
    await expect(tarjeta).toContainText('0/10 piezas');
    await expect(tarjeta).not.toContainText('Lista');

    // Sesión 3: Doblado 10; solo ahora la orden pasa a Lista.
    await page.getByTestId('iniciar-sesion-produccion').click();
    await expect(page.getByRole('status')).toContainText('Sesión iniciada');
    await page.getByLabel('Piezas producidas ahora').fill('10');
    await page.getByTestId('meta-proceso-cierre').selectOption(caso.metaDobladoId);
    await page.getByLabel('Confirmar PIN').fill(caso.pinOperador);
    await page.getByTestId('cerrar-sesion-produccion').click();
    await expect(page.getByRole('status')).toContainText('Sesión registrada');

    await expect(bloqueProcesos).toContainText('Doblado: 10.00/10.00 · 0.00 pend · 100%');
    await expect(tarjeta).toContainText('10/10 piezas');
    await expect(tarjeta).toContainText('Lista');
    if (process.env.E2E_CAPTURAR_VISUAL === 'si') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('html').evaluate((nodo) => nodo.classList.add('dark'));
      await page.waitForTimeout(200);
      await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-prd09-final-movil-oscuro.png', fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.locator('html').evaluate((nodo) => nodo.classList.remove('dark'));
    }

    const { data: partida } = await caso.admin.from('partidas_orden_produccion')
      .select('cantidad_producida').eq('id', caso.partidaId).single();
    expect(Number(partida?.cantidad_producida)).toBe(10);
    const { data: avances } = await caso.admin.from('registros_avance_partida')
      .select('cantidad_producida, meta_proceso_id').eq('partida_id', caso.partidaId).order('creado_en');
    expect(avances ?? []).toHaveLength(3);
    expect((avances ?? []).map((avance) => Number(avance.cantidad_producida))).toEqual([4, 6, 10]);
  });
});
