import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correoAdministrador: string;
  contrasenaAdministrador: string;
  administradorId: string;
  operadorId: string;
  clienteId: string;
  clienteNombre: string;
  recursoId: string;
  ordenesCreadas: string[];
};

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} para las pruebas E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  const url = requerirVariable('NEXT_PUBLIC_SUPABASE_URL');
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('La E2E de órdenes exige loopback explícito.');
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
    email: correo, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: nombreCompleto },
  });
  if (error || !data.user) throw new Error(`No se pudo crear usuario E2E: ${error?.message ?? 'sin usuario'}`);
  const { error: errorPerfil } = await admin.from('usuarios')
    .update({ rol, activo: true, nombre_completo: nombreCompleto }).eq('id', data.user.id);
  if (errorPerfil) throw new Error(`No se pudo preparar perfil E2E: ${errorPerfil.message}`);
  return data.user.id;
}

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = crearAdmin();
  const sufijo = randomUUID().slice(0, 8);
  const correoAdministrador = `e2e-hist-admin-${sufijo}@orca.local`;
  const contrasenaAdministrador = `E2e!${randomUUID()}Aa9`;
  const administradorId = await crearUsuario(
    admin, correoAdministrador, contrasenaAdministrador, `Admin historicos ${sufijo}`, 'admin',
  );
  const operadorId = await crearUsuario(
    admin, `e2e-hist-operador-${sufijo}@orca.local`, `E2e!${randomUUID()}Bb9`, `Operador historicos ${sufijo}`, 'operador',
  );
  const clienteNombre = `Cliente heredado ${sufijo}`;
  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: clienteNombre,
    razon_social: `Cliente heredado ${sufijo} SA`,
    estado: 'activo',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`No se pudo crear cliente E2E: ${errorCliente?.message ?? 'sin fila'}`);
  const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
    codigo: `E2E-HIST-${sufijo.toUpperCase()}`,
    nombre: `Recurso histórico ${sufijo}`,
    area: 'taller',
    activo: true,
  }).select('id').single();
  if (errorRecurso || !recurso) throw new Error(`No se pudo crear recurso E2E: ${errorRecurso?.message ?? 'sin fila'}`);
  return {
    admin, correoAdministrador, contrasenaAdministrador, administradorId, operadorId,
    clienteId: cliente.id, clienteNombre, recursoId: recurso.id, ordenesCreadas: [],
  };
}

/** Crea una orden completada con sesión previa para probar la reactivación. */
async function crearCompletada(contexto: ContextoE2E): Promise<{ ordenId: string; folio: string }> {
  const { admin } = contexto;
  const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
  if (errorFolio || !folio) throw new Error(`Sin folio E2E: ${errorFolio?.message ?? ''}`);
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio, cliente_id: contexto.clienteId, estado: 'en_proceso',
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`Sin orden E2E: ${errorOrden?.message ?? ''}`);
  contexto.ordenesCreadas.push(orden.id);
  const { data: partida, error: errorPartida } = await admin.from('partidas_orden_produccion').insert({
    orden_id: orden.id, codigo_pieza: `COMPL-${randomUUID().slice(0, 6)}`,
    cantidad_solicitada: 3, unidad_medida: 'pza',
    operador_asignado_id: contexto.operadorId, procesos: ['Corte'],
  }).select('id').single();
  if (errorPartida || !partida) throw new Error(`Sin partida E2E: ${errorPartida?.message ?? ''}`);
  const { data: programacion } = await admin.from('programacion_areas').insert({
    orden_id: orden.id, partida_id: partida.id, recurso_id: contexto.recursoId,
    secuencia: 1, estado_planeacion: 'completada', fecha_programada: '2099-12-30',
    turno: 'matutino', horas_estimadas: 2,
  }).select('id').single();
  await admin.from('sesiones_trabajo').insert({
    orden_id: orden.id, partida_id: partida.id, programacion_id: programacion!.id,
    operador_id: contexto.operadorId, estado_sesion: 'finalizada',
    fecha_inicio: new Date(Date.now() - 7_200_000).toISOString(),
    fecha_fin: new Date(Date.now() - 3_600_000).toISOString(),
    horas_brutas: 1, horas_netas: 1, piezas_producidas: 3,
  });
  const avance = await admin.rpc('registrar_avance_partida_op', {
    p_partida_id: partida.id, p_operador_id: contexto.operadorId,
    p_cantidad_producida: 3, p_cantidad_scrap: 0,
  });
  if (avance.error) throw new Error(`No se completó la orden E2E: ${avance.error.message}`);
  return { ordenId: orden.id, folio };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  for (const ordenId of contexto.ordenesCreadas) {
    const { data: partidas } = await admin.from('partidas_orden_produccion').select('id').eq('orden_id', ordenId);
    const partidaIds = (partidas ?? []).map((fila) => fila.id);
    await admin.from('archivos_orden').delete().eq('orden_id', ordenId);
    if (partidaIds.length > 0) {
      await admin.from('registros_avance_partida').delete().in('partida_id', partidaIds);
    }
    await admin.from('sesiones_trabajo').delete().eq('orden_id', ordenId);
    await admin.from('programacion_areas').delete().eq('orden_id', ordenId);
    await admin.from('partidas_orden_produccion').delete().eq('orden_id', ordenId);
    await admin.from('cuentas_por_cobrar').delete().eq('orden_id', ordenId);
    await admin.from('notas_entrega').delete().eq('orden_id', ordenId);
    await admin.from('ordenes_produccion').delete().eq('id', ordenId);
  }
  await admin.from('recursos_planeacion').delete().eq('id', contexto.recursoId);
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

test.describe.serial('órdenes heredadas, repetición y reactivación (ORD-06/CLI-08/PRD-15)', () => {
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

  test('E2E-14: captura heredada con ID único y repetición con folio nuevo', async ({ page }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const caso = contexto;
    await iniciarSesionAdministrador(page, caso);
    await page.goto('/ordenes');

    const idHistorico = `E2E-HIST-${randomUUID().slice(0, 6).toUpperCase()}`;
    await page.getByTestId('abrir-orden-heredada').click();
    await page.getByTestId('historica-cliente').selectOption(caso.clienteId);
    await page.getByTestId('historica-id').fill(idHistorico);
    await page.getByTestId('historica-fecha-trabajo').fill('2026-06-15');
    await page.getByTestId('historica-fecha-compromiso').fill('2026-12-15');
    await page.getByTestId('historica-subtotal').fill('1000');
    await page.getByTestId('historica-iva').fill('160');
    await page.getByTestId('historica-partida-codigo-0').fill('HIST-PZA-1');
    await page.getByTestId('historica-partida-cantidad-0').fill('5');
    await page.getByTestId('historica-partida-procesos-0').fill('Corte, Doblado');
    await page.getByTestId('historica-crear').click();

    // El alta abre los adjuntos del folio nuevo; se cierra para ver el estado del panel.
    await expect(page.getByRole('dialog')).toContainText('Archivos de OP-');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('status').filter({ hasText: 'creada con su cuenta por cobrar' }).first()).toBeVisible();
    const mensajeAlta = await page.getByRole('status').filter({ hasText: 'creada con su cuenta por cobrar' }).first().textContent();
    const folioHistoricoVisible = /OP-\d{6}/.exec(mensajeAlta ?? '')?.[0] ?? '';
    expect(folioHistoricoVisible).not.toBe('');
    await expect(page.getByRole('row', { name: new RegExp(folioHistoricoVisible) })).toContainText('Programada');

    // ID repetido: se rechaza con mensaje explícito.
    await page.getByTestId('abrir-orden-heredada').click();
    await page.getByTestId('historica-cliente').selectOption(caso.clienteId);
    await page.getByTestId('historica-id').fill(idHistorico.toLowerCase());
    await page.getByTestId('historica-fecha-trabajo').fill('2026-06-15');
    await page.getByTestId('historica-fecha-compromiso').fill('2026-12-15');
    await page.getByTestId('historica-subtotal').fill('50');
    await page.getByTestId('historica-iva').fill('8');
    await page.getByTestId('historica-partida-codigo-0').fill('HIST-PZA-2');
    await page.getByTestId('historica-partida-cantidad-0').fill('1');
    await page.getByTestId('historica-crear').click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('ya está registrado');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

    // La orden heredada ya está en la tabla; se repite desde su fila.
    const { data: historica } = await caso.admin.from('ordenes_produccion')
      .select('id, folio').eq('id_historico', idHistorico.toLowerCase()).single();
    expect(historica?.folio).toMatch(/^OP-/);
    caso.ordenesCreadas.push(historica!.id);
    const filaHistorica = page.getByRole('row', { name: new RegExp(historica!.folio) });
    await expect(filaHistorica).toContainText('Programada');
    await page.getByTestId(`repetir-orden-${historica!.folio}`).click();
    await page.getByTestId('repetir-fecha-compromiso').fill('2027-01-20');
    await page.getByTestId('confirmar-repetir-orden').click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('Trabajo repetido en la orden');
    const mensaje = await page.getByRole('dialog').getByRole('status').textContent();
    const folioNuevo = /OP-\d{6}/.exec(mensaje ?? '')?.[0] ?? '';
    expect(folioNuevo).not.toBe('');
    expect(folioNuevo).not.toBe(historica!.folio);
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).first().click();
    await expect(page.getByRole('row', { name: new RegExp(folioNuevo) })).toContainText('Programada');

    const { data: repetida } = await caso.admin.from('ordenes_produccion')
      .select('id, estado, id_historico, orden_origen_id').eq('folio', folioNuevo).single();
    expect(repetida?.estado).toBe('programada');
    expect(repetida?.id_historico).toBeNull();
    expect(repetida?.orden_origen_id).toBe(historica!.id);
    caso.ordenesCreadas.push(repetida!.id);
    if (process.env.E2E_CAPTURAR_VISUAL === 'si') {
      await page.screenshot({
        path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-ord06-cli08-escritorio.png',
        fullPage: true,
      });
    }
  });

  test('E2E-21: el admin reactiva una Lista y no puede reactivar una entregada', async ({ page }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const caso = contexto;
    const completada = await crearCompletada(caso);
    await iniciarSesionAdministrador(page, caso);
    await page.goto('/ordenes');

    const fila = page.getByRole('row', { name: new RegExp(completada.folio) });
    await expect(fila).toContainText('Completada');
    await page.getByTestId(`reactivar-orden-${completada.folio}`).click();
    await page.getByTestId('confirmar-reactivar-orden').click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('reactivada');
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).first().click();
    await expect(page.getByRole('row', { name: new RegExp(completada.folio) })).toContainText('En proceso');

    const { data: sesiones } = await caso.admin.from('sesiones_trabajo')
      .select('id').eq('orden_id', completada.ordenId);
    expect(sesiones ?? []).toHaveLength(1);
    const { data: avances } = await caso.admin.from('registros_avance_partida')
      .select('id, cantidad_producida').in('partida_id', (
        await caso.admin.from('partidas_orden_produccion').select('id').eq('orden_id', completada.ordenId)
      ).data?.map((filaActual) => filaActual.id) ?? []);
    expect(avances ?? []).toHaveLength(1);

    // Orden archivada por entrega: el rechazo debe ser visible y no cambiar el estado.
    const entregada = await crearCompletada(caso);
    await caso.admin.from('ordenes_produccion')
      .update({ archivada_en: new Date().toISOString() }).eq('id', entregada.ordenId);
    await page.reload();
    await page.getByTestId('bandeja-archivo').click();
    await page.getByTestId(`reactivar-orden-${entregada.folio}`).click();
    await page.getByTestId('confirmar-reactivar-orden').click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('entrega o cobros registrados');
    const { data: sigue } = await caso.admin.from('ordenes_produccion')
      .select('estado').eq('id', entregada.ordenId).single();
    expect(sigue?.estado).toBe('completada');
  });
});
