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

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  administradorId: string;
  clienteId: string;
  ordenId: string;
  partidaId: string;
  arId: string;
  folioOrden: string;
};

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable ${nombre} para E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  return createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = crearAdmin();
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-cobranza-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Cc9`;
  const { data: usuarioAuth, error: errorAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: `Administrador Cobranza ${sufijo}` },
  });
  if (errorAuth || !usuarioAuth.user) throw new Error(`No se creó administrador E2E: ${errorAuth?.message ?? 'sin usuario'}`);
  const administradorId = usuarioAuth.user.id;
  const { error: errorPerfil } = await admin.from('usuarios').update({
    rol: 'admin', activo: true, nombre_completo: `Administrador Cobranza ${sufijo}`,
  }).eq('id', administradorId);
  if (errorPerfil) throw new Error(`No se preparó perfil E2E: ${errorPerfil.message}`);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `Cliente Cobranza E2E ${sufijo}`,
    razon_social: `Cliente Cobranza ${sufijo} SA de CV`,
    estado: 'activo',
    saldo_a_favor: 0,
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`No se creó cliente E2E: ${errorCliente?.message ?? 'sin cliente'}`);

  const folioOrden = `OP-${900000 + (Number.parseInt(sufijo, 16) % 99_999)}`;
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio: folioOrden,
    cliente_id: cliente.id,
    estado: 'completada',
    prioridad: 'normal',
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`No se creó orden E2E: ${errorOrden?.message ?? 'sin orden'}`);

  const { data: partida, error: errorPartida } = await admin.from('partidas_orden_produccion').insert({
    orden_id: orden.id,
    codigo_pieza: `E2E-AR-${sufijo}`,
    descripcion: 'Partida terminada para flujo E2E de Cobranza',
    cantidad_solicitada: 10,
    cantidad_producida: 10,
    cantidad_scrap: 0,
    unidad_medida: 'pieza',
    tiempo_estimado_minutos: 60,
    tiempo_real_minutos: 60,
  }).select('id').single();
  if (errorPartida || !partida) throw new Error(`No se creó partida E2E: ${errorPartida?.message ?? 'sin partida'}`);

  const { data: cuenta, error: errorCuenta } = await admin.rpc('abrir_cuenta_por_cobrar', {
    p_orden_id: orden.id,
    p_monto_total: 100,
    p_moneda: 'USD',
    p_tipo_cambio_origen: 18.5,
    p_fecha_vencimiento: '2099-12-31T18:00:00.000Z',
    p_folio_factura_remision: `REM-E2E-${sufijo}`,
  });
  if (errorCuenta || !cuenta?.[0]) throw new Error(`No se abrió AR E2E: ${errorCuenta?.message ?? 'sin cuenta'}`);

  return { admin, correo, contrasena, administradorId, clienteId: cliente.id, ordenId: orden.id, partidaId: partida.id, arId: cuenta[0].id, folioOrden };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  const { data: pagos } = await admin.from('pagos_ar').select('id').eq('ar_id', contexto.arId);
  const pagosIds = (pagos ?? []).map((pago) => pago.id);
  if (pagosIds.length) await admin.from('movimientos_saldo_favor').delete().in('pago_ar_id', pagosIds);
  await admin.from('movimientos_saldo_favor').delete().eq('ar_id_origen', contexto.arId);
  await admin.from('pagos_ar').delete().eq('ar_id', contexto.arId);
  await admin.from('cuentas_por_cobrar').delete().eq('id', contexto.arId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().eq('usuario_id', contexto.administradorId);
  await admin.from('usuarios').delete().eq('id', contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.administradorId);
}

async function iniciarSesion(page: import('@playwright/test').Page, contexto: ContextoE2E): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(contexto.correo);
  await page.getByLabel('Contraseña').fill(contexto.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL('**/tablero');
}

test.describe.serial('flujo de Cobranza AR', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos efímeros en Supabase remoto.',
  );

  let contexto: ContextoE2E | null = null;

  test.beforeAll(async () => { contexto = await prepararContexto(); });
  test.afterAll(async () => { if (contexto) await limpiarContexto(contexto); });

  test('registra pago parcial, sobrepago, recibos y sincronización de cartera', async ({ page, browser }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;
    await iniciarSesion(page, datos);
    const observador = await browser.newPage();
    await iniciarSesion(observador, datos);
    await observador.goto('/cobranza');
    await expect(observador.getByTestId('sincronizador-cobranza')).toHaveAttribute('data-conectado', 'true');

    await page.goto('/cobranza');
    await expect(page.getByTestId('operacion-cobranza')).toBeVisible();
    const fila = page.getByRole('row', { name: new RegExp(datos.folioOrden) });
    await expect(fila).toContainText('pendiente');
    await fila.getByRole('button', { name: 'Cobrar' }).click();
    await page.getByLabel('Monto').fill('40');
    await page.getByLabel('Moneda de pago').selectOption('USD');
    await page.getByLabel('Tipo de cambio (MXN)').fill('18.5');
    await page.getByLabel('Referencia bancaria').fill('E2E-PARCIAL');
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByTestId('recibo-pago').getByText(/^REC-\d{6}$/)).toBeVisible();
    await expect.poll(async () => {
      const { data } = await datos.admin.from('cuentas_por_cobrar').select('estado, saldo_pendiente').eq('id', datos.arId).single();
      return `${data?.estado}:${data?.saldo_pendiente}`;
    }).toBe('parcial:60');
    await expect(observador.getByTestId('sincronizador-cobranza')).not.toHaveAttribute('data-eventos', '0');
    await expect(observador.getByRole('row', { name: new RegExp(datos.folioOrden) })).toContainText('parcial');

    await fila.getByRole('button', { name: 'Cobrar' }).click();
    await page.getByLabel('Monto').fill('70');
    await page.getByLabel('Moneda de pago').selectOption('USD');
    await page.getByLabel('Tipo de cambio (MXN)').fill('18.5');
    await page.getByLabel('Referencia bancaria').fill('E2E-SOBREPAGO');
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByTestId('recibo-pago').getByText(/^REC-\d{6}$/)).toBeVisible();
    await expect.poll(async () => {
      const { data } = await datos.admin.from('cuentas_por_cobrar').select('estado, saldo_pendiente').eq('id', datos.arId).single();
      return `${data?.estado}:${data?.saldo_pendiente}`;
    }).toBe('pagado:0');

    const { data: pagos } = await datos.admin.from('pagos_ar').select('folio_recibo').eq('ar_id', datos.arId).order('creado_en');
    expect(pagos).toHaveLength(2);
    expect(pagos?.every((pago) => /^REC-\d{6}$/.test(pago.folio_recibo))).toBe(true);
    const { data: monedero } = await datos.admin.from('clientes').select('saldo_a_favor').eq('id', datos.clienteId).single();
    expect(Number(monedero?.saldo_a_favor)).toBe(185);
    const { data: movimientos } = await datos.admin.from('movimientos_saldo_favor').select('monto, moneda, tipo').eq('ar_id_origen', datos.arId);
    expect(movimientos).toContainEqual({ monto: 185, moneda: 'MXN', tipo: 'credito_sobrepago' });
    const { data: logs } = await datos.admin.from('logs').select('accion').eq('modulo', 'cobranza').eq('usuario_id', datos.administradorId);
    expect((logs ?? []).filter((log) => log.accion === 'registrar_pago_ar')).toHaveLength(2);
    await observador.close();
  });
});
