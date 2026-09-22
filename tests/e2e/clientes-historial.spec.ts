import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

function cargarEntornoLocal(): void {
  const ruta = `${process.cwd()}\\.env.local`;
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    process.env[coincidencia[1]] = coincidencia[2].replace(/^['"]|['"]$/g, '');
  }
}

cargarEntornoLocal();

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable ${nombre} para E2E.`);
  return valor;
}

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  administradorId: string;
  operadorId: string;
  clienteId: string;
  razonSocial: string;
  pipelineId: string;
  folioOp: string;
  folioCnc: string;
  ordenId: string;
  partidaId: string;
  nota: string;
};

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-historial-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Hh9`;

  const { data: usuarioAuth, error: errorAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: `Administrador Historial ${sufijo}` },
  });
  if (errorAuth || !usuarioAuth.user) {
    throw new Error(`No se creó administrador E2E: ${errorAuth?.message ?? 'sin usuario'}`);
  }
  const administradorId = usuarioAuth.user.id;
  const { error: errorPerfil } = await admin
    .from('usuarios')
    .update({ rol: 'admin', activo: true, nombre_completo: `Administrador Historial ${sufijo}` })
    .eq('id', administradorId);
  if (errorPerfil) throw new Error(`No se preparó perfil E2E: ${errorPerfil.message}`);

  const { data: operadorAuth, error: errorOperador } = await admin.auth.admin.createUser({
    email: `e2e-historial-op-${sufijo}@orca.local`,
    password: `E2e!${randomUUID()}Oo9`,
    email_confirm: true,
    user_metadata: { nombre_completo: `Operador Historial ${sufijo}` },
  });
  if (errorOperador || !operadorAuth.user) {
    throw new Error(`No se creó operador E2E: ${errorOperador?.message ?? 'sin usuario'}`);
  }
  const operadorId = operadorAuth.user.id;
  const { error: errorPerfilOperador } = await admin
    .from('usuarios')
    .update({ rol: 'operador', activo: true, nombre_completo: `Operador Historial ${sufijo}` })
    .eq('id', operadorId);
  if (errorPerfilOperador) {
    throw new Error(`No se preparó el operador E2E: ${errorPerfilOperador.message}`);
  }

  const razonSocial = `Aceros Historial ${sufijo} SA de CV`;
  const { data: cliente, error: errorCliente } = await admin
    .from('clientes')
    .insert({
      razon_social: razonSocial,
      nombre_comercial: `Aceros ${sufijo}`,
      estado: 'activo',
      saldo_a_favor: 0,
    })
    .select('id')
    .single();
  if (errorCliente || !cliente) {
    throw new Error(`No se creó cliente E2E: ${errorCliente?.message ?? 'sin cliente'}`);
  }

  const { data: folioOp, error: errorFolioOp } = await admin.rpc('generar_folio_op');
  if (errorFolioOp || !folioOp) throw new Error(`Sin folio OP E2E: ${errorFolioOp?.message}`);
  const { data: folioCnc, error: errorFolioCnc } = await admin.rpc('generar_folio_cnc');
  if (errorFolioCnc || !folioCnc) throw new Error(`Sin folio CNC E2E: ${errorFolioCnc?.message}`);

  const { data: oportunidad, error: errorPipeline } = await admin
    .from('pipeline')
    .insert({
      folio_op: folioOp,
      folio_cnc: folioCnc,
      empresa: razonSocial,
      nombre_contacto: 'Contacto Historial',
      vendedor_id: administradorId,
      cliente_id: cliente.id,
      etapa: 'cotizado',
      moneda: 'MXN',
      prioridad: 'normal',
    })
    .select('id')
    .single();
  if (errorPipeline || !oportunidad) {
    throw new Error(`No se creó la oportunidad E2E: ${errorPipeline?.message}`);
  }

  const { error: errorLinea } = await admin.from('cotizacion_lineas').insert({
    pipeline_id: oportunidad.id,
    descripcion: 'Pieza histórica',
    cantidad: 2,
    precio_unitario: 150,
    material: 'Acero A36',
    procesos: ['corte'],
    es_externo: false,
    es_descuento: false,
  });
  if (errorLinea) throw new Error(`No se creó la línea E2E: ${errorLinea.message}`);

  const { data: folioOrden, error: errorFolioOrden } = await admin.rpc('generar_folio_orden', {
    p_prefijo: 'OP',
  });
  if (errorFolioOrden || !folioOrden) {
    throw new Error(`Sin folio de orden E2E: ${errorFolioOrden?.message}`);
  }
  const { data: orden, error: errorOrden } = await admin
    .from('ordenes_produccion')
    .insert({
      folio: folioOrden,
      cliente_id: cliente.id,
      cotizacion_id: oportunidad.id,
      estado: 'programada',
      prioridad: 'normal',
      fecha_compromiso: '2100-01-31T00:00:00.000Z',
    })
    .select('id')
    .single();
  if (errorOrden || !orden) throw new Error(`No se creó la orden E2E: ${errorOrden?.message}`);

  const { data: partida, error: errorPartida } = await admin
    .from('partidas_orden_produccion')
    .insert({
      orden_id: orden.id,
      codigo_pieza: `PZA-HIST-${sufijo.slice(0, 4)}`,
      descripcion: 'Brida histórica',
      cantidad_solicitada: 5,
      unidad_medida: 'pieza',
      maquina_asignada: 'CNC-01',
    })
    .select('id')
    .single();
  if (errorPartida || !partida) {
    throw new Error(`No se creó la partida E2E: ${errorPartida?.message}`);
  }

  const nota = 'Se corrigió el programa CNC antes de reanudar.';
  const { error: errorNota } = await admin.from('registros_tiempo_operador').insert({
    accion: 'pausa',
    operador_id: operadorId,
    partida_id: partida.id,
    notas: nota,
  });
  if (errorNota) throw new Error(`No se registró la nota E2E: ${errorNota.message}`);

  return {
    admin,
    correo,
    contrasena,
    administradorId,
    operadorId,
    clienteId: cliente.id,
    razonSocial,
    pipelineId: oportunidad.id,
    folioOp,
    folioCnc,
    ordenId: orden.id,
    partidaId: partida.id,
    nota,
  };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  await admin.from('registros_tiempo_operador').delete().eq('partida_id', contexto.partidaId);
  await admin.from('partidas_orden_produccion').delete().eq('orden_id', contexto.ordenId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('cotizacion_lineas').delete().eq('pipeline_id', contexto.pipelineId);
  await admin.from('pipeline').delete().eq('id', contexto.pipelineId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().in('usuario_id', [contexto.administradorId, contexto.operadorId]);
  await admin.from('usuarios').delete().in('id', [contexto.administradorId, contexto.operadorId]);
  await admin.auth.admin.deleteUser(contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.operadorId);
}

test.describe.serial('historial navegable y notas de taller (OBS-11)', () => {
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

  test('el deep-link abre la cotización y la ficha muestra enlaces y notas automáticas', async ({
    page,
  }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;

    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(datos.correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(datos.contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');

    // Deep-link OBS-11: ?oportunidad=<id> abre el editor de esa cotización.
    await page.goto(`/pipeline?oportunidad=${datos.pipelineId}`);
    const dialogoCotizacion = page.getByRole('dialog', { name: `Cotización ${datos.folioCnc ?? datos.folioOp}` });
    await expect(dialogoCotizacion).toBeVisible();
    await expect(dialogoCotizacion.getByLabel('Descripción')).toHaveValue('Pieza histórica');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Ficha del cliente → Historial: enlaces a originales y notas de taller.
    await page.goto('/clientes');
    await page.getByRole('button', { name: datos.razonSocial }).click();
    const ficha = page.getByRole('dialog', { name: 'Ficha del cliente' });
    await expect(ficha).toBeVisible();
    await ficha.getByRole('button', { name: 'Historial' }).click();

    const enlaceCotizacion = ficha.getByTestId(`enlace-cotizacion-${datos.pipelineId}`);
    await expect(enlaceCotizacion).toBeVisible();
    await expect(enlaceCotizacion).toHaveAttribute(
      'href',
      `/pipeline?oportunidad=${datos.pipelineId}`,
    );
    const enlaceOrden = ficha.getByTestId(`enlace-orden-${datos.ordenId}`);
    await expect(enlaceOrden).toBeVisible();
    await expect(enlaceOrden).toHaveAttribute('href', `/ordenes?ordenId=${datos.ordenId}`);

    const notas = ficha.getByTestId('historial-notas');
    await expect(notas).toBeVisible();
    await expect(notas).toContainText(datos.nota);
    await expect(notas).toContainText('Operador Historial');

    // El enlace de la orden navega al registro original.
    await enlaceOrden.click();
    await expect(page).toHaveURL(new RegExp(`/ordenes\\?ordenId=${datos.ordenId}`));
  });
});
