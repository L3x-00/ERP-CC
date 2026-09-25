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
  anticipoOrdenId: string;
  anticipoArId: string;
  anticipoFolioOrden: string;
  excepcionOrdenId: string;
  excepcionFolioOrden: string;
  excepcionCotizacionId: string;
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

  const numeroFolio = 900000 + (Number.parseInt(sufijo, 16) % 99_998);
  const folioOrden = `OP-${numeroFolio}`;
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

  // D-04: contorno de anticipo — orden aún no entregada con AR no cobrable,
  // como la deja la aprobación comercial.
  const anticipoFolioOrden = `OP-${numeroFolio + 1}`;
  const { data: anticipoOrden, error: errorAnticipoOrden } = await admin.from('ordenes_produccion').insert({
    folio: anticipoFolioOrden,
    cliente_id: cliente.id,
    estado: 'en_proceso',
    prioridad: 'normal',
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
  }).select('id').single();
  if (errorAnticipoOrden || !anticipoOrden) throw new Error(`No se creó orden de anticipo E2E: ${errorAnticipoOrden?.message ?? 'sin orden'}`);

  const { data: anticipoAr, error: errorAnticipoAr } = await admin.from('cuentas_por_cobrar').insert({
    orden_id: anticipoOrden.id,
    cliente_id: cliente.id,
    monto_total: 1000,
    saldo_pendiente: 1000,
    moneda: 'MXN',
    tipo_cambio_origen: 1,
    estado: 'pendiente',
    fecha_vencimiento: null,
    cobrable_desde: null,
  }).select('id').single();
  if (errorAnticipoAr || !anticipoAr) throw new Error(`No se creó AR de anticipo E2E: ${errorAnticipoAr?.message ?? 'sin cuenta'}`);

  const { data: folioRfQ, error: errorFolioRfQ } = await admin.rpc('generar_folio_op');
  if (errorFolioRfQ || !folioRfQ) throw new Error(`No se generó folio RFQ E2E: ${errorFolioRfQ?.message ?? 'sin folio'}`);
  const { data: cotizacion, error: errorCotizacion } = await admin.from('pipeline').insert({
    folio_op: folioRfQ, vendedor_id: administradorId, cliente_id: cliente.id,
    empresa: `Cliente Cobranza E2E ${sufijo}`, nombre_contacto: 'Contacto E2E',
    etapa: 'ganada', moneda: 'MXN', iva_porcentaje: 16,
  }).select('id').single();
  if (errorCotizacion || !cotizacion) throw new Error(`No se creó RFQ E2E: ${errorCotizacion?.message ?? 'sin RFQ'}`);
  const { error: errorLinea } = await admin.from('cotizacion_lineas').insert([
    { pipeline_id: cotizacion.id, descripcion: 'Trabajo histórico sin AR', cantidad: 1,
      precio_unitario: 100, es_descuento: false },
    { pipeline_id: cotizacion.id, descripcion: 'Descuento RFQ histórico', cantidad: 1,
      precio_unitario: 10, es_descuento: true },
  ]);
  if (errorLinea) throw new Error(`No se creó línea RFQ E2E: ${errorLinea.message}`);
  const excepcionFolioOrden = `OP-${numeroFolio + 2}`;
  const { data: excepcionOrden, error: errorExcepcionOrden } = await admin.from('ordenes_produccion').insert({
    folio: excepcionFolioOrden, cliente_id: cliente.id, cotizacion_id: cotizacion.id,
    estado: 'completada', archivada_en: new Date().toISOString(),
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
  }).select('id').single();
  if (errorExcepcionOrden || !excepcionOrden) throw new Error(`No se creó orden histórica E2E: ${errorExcepcionOrden?.message ?? 'sin orden'}`);

  return {
    admin, correo, contrasena, administradorId, clienteId: cliente.id,
    ordenId: orden.id, partidaId: partida.id, arId: cuenta[0].id, folioOrden,
    anticipoOrdenId: anticipoOrden.id, anticipoArId: anticipoAr.id, anticipoFolioOrden,
    excepcionOrdenId: excepcionOrden.id, excepcionFolioOrden, excepcionCotizacionId: cotizacion.id,
  };
}

async function limpiarAr(admin: SupabaseClient<Database>, arId: string): Promise<void> {
  const { data: pagos } = await admin.from('pagos_ar').select('id').eq('ar_id', arId);
  const pagosIds = (pagos ?? []).map((pago) => pago.id);
  if (pagosIds.length) await admin.from('movimientos_saldo_favor').delete().in('pago_ar_id', pagosIds);
  await admin.from('movimientos_saldo_favor').delete().eq('ar_id_origen', arId);
  await admin.from('pagos_ar').delete().eq('ar_id', arId);
  await admin.from('cuentas_por_cobrar').delete().eq('id', arId);
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  await limpiarAr(admin, contexto.arId);
  await limpiarAr(admin, contexto.anticipoArId);
  const { data: cuentaExcepcion } = await admin.from('cuentas_por_cobrar').select('id').eq('orden_id', contexto.excepcionOrdenId).maybeSingle();
  if (cuentaExcepcion) await limpiarAr(admin, cuentaExcepcion.id);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.anticipoOrdenId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.excepcionOrdenId);
  await admin.from('cotizacion_lineas').delete().eq('pipeline_id', contexto.excepcionCotizacionId);
  await admin.from('pipeline').delete().eq('id', contexto.excepcionCotizacionId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().eq('usuario_id', contexto.administradorId);
  await admin.from('usuarios').delete().eq('id', contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.administradorId);
}

async function iniciarSesion(page: import('@playwright/test').Page, contexto: ContextoE2E): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(contexto.correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
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
    const { data: referencia } = await datos.admin.from('cuentas_por_cobrar')
      .select('referencia_interna, folio_factura_remision').eq('id', datos.arId).single();
    expect(referencia?.referencia_interna).toMatch(/^INVCNC-\d{7}$/);
    expect(referencia?.folio_factura_remision).toMatch(/^REM-E2E-/);
    await expect(fila).toContainText(referencia!.referencia_interna);
    await expect(fila.getByText(referencia!.referencia_interna)).toHaveCSS('white-space', 'nowrap');
    await page.getByPlaceholder('Cliente, OP, INVCNC o factura').fill(referencia!.referencia_interna);
    await expect(fila).toBeVisible();
    await page.getByPlaceholder('Cliente, OP, INVCNC o factura').fill('');
    for (const [ancho, nombre] of [[1440, 'escritorio'], [768, 'tableta'], [390, 'movil']] as const) {
      await page.setViewportSize({ width: ancho, height: 900 });
      for (const oscuro of [false, true]) {
        await page.evaluate((activar) => document.documentElement.classList.toggle('dark', activar), oscuro);
        await page.screenshot({
          path: `.ai-shared/qa/cierre-auditoria-2026-09-22/a20-ar01-${nombre}-${oscuro ? 'oscuro' : 'claro'}.png`,
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await expect(fila).toContainText(/pendiente/i);
    await fila.getByRole('button', { name: 'Factura' }).click();
    await page.getByRole('textbox', { name: 'Número de factura o remisión' }).fill(`FAC-E2E-${datos.folioOrden}`);
    await page.getByLabel('Fecha de vencimiento').fill('2099-12-30');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-ar02-factura-escritorio-claro.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-ar02-factura-movil-oscuro.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.getByRole('button', { name: 'Guardar factura' }).click();
    await expect(fila).toContainText(`FAC-E2E-${datos.folioOrden}`);
    const { data: cuentaFacturada, count: cuentasDeOrden } = await datos.admin.from('cuentas_por_cobrar')
      .select('id, folio_factura_remision, fecha_vencimiento, monto_total', { count: 'exact' })
      .eq('orden_id', datos.ordenId).single();
    expect(cuentasDeOrden).toBe(1);
    expect(cuentaFacturada).toMatchObject({ id: datos.arId, monto_total: 100, folio_factura_remision: `FAC-E2E-${datos.folioOrden}` });
    expect(cuentaFacturada?.fecha_vencimiento?.startsWith('2099-12-30')).toBe(true);
    await fila.getByRole('button', { name: 'Cobrar' }).click();
    await page.getByLabel('Monto').fill('40');
    await page.getByLabel('Moneda de pago').selectOption('USD');
    await page.getByLabel('Tipo de cambio (MXN)').fill('18.5');
    await page.getByLabel('Referencia bancaria').fill('E2E-PARCIAL');
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByTestId('recibo-persistido')).toContainText(/REC-\d{6}/);
    await expect(page.getByTestId('recibo-persistido')).toContainText(referencia!.referencia_interna);
    await expect(page.getByTestId('recibo-persistido')).toContainText(`FAC-E2E-${datos.folioOrden}`);
    await expect.poll(async () => {
      const { data } = await datos.admin.from('cuentas_por_cobrar').select('estado, saldo_pendiente').eq('id', datos.arId).single();
      return `${data?.estado}:${data?.saldo_pendiente}`;
    }).toBe('parcial:60');
    await expect(observador.getByTestId('sincronizador-cobranza')).not.toHaveAttribute('data-eventos', '0');
    await expect(observador.getByRole('row', { name: new RegExp(datos.folioOrden) })).toContainText(/parcial/i);

    await fila.getByRole('button', { name: 'Cobrar' }).click();
    await page.getByLabel('Monto').fill('70');
    await page.getByLabel('Moneda de pago').selectOption('USD');
    await page.getByLabel('Tipo de cambio (MXN)').fill('18.5');
    await page.getByLabel('Referencia bancaria').fill('E2E-SOBREPAGO');
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByTestId('recibo-persistido')).toContainText(/REC-\d{6}/);
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

  test('registra un anticipo sobre una AR no cobrable y la mantiene por entregar (D-04)', async ({ page }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;
    await iniciarSesion(page, datos);
    await page.goto('/cobranza');
    await expect(page.getByTestId('operacion-cobranza')).toBeVisible();

    const fila = page.getByRole('row', { name: new RegExp(datos.anticipoFolioOrden) });
    await expect(fila).toContainText('No cobrable');
    await expect(fila).toContainText('Por entregar');
    await fila.getByRole('button', { name: 'Factura' }).click();
    await page.getByRole('textbox', { name: 'Número de factura o remisión' }).fill(`FAC-ANT-${datos.anticipoFolioOrden}`);
    await expect(page.getByText(/vencimiento se fija al entregar/)).toBeVisible();
    await page.getByRole('button', { name: 'Guardar y registrar abono' }).click();
    await expect(page.getByText(/se registra como anticipo/)).toBeVisible();
    await page.getByLabel('Monto').fill('200');
    await page.getByLabel('Referencia bancaria').fill('E2E-ANTICIPO');
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByTestId('recibo-persistido')).toContainText(/REC-\d{6}/);

    await expect.poll(async () => {
      const { data } = await datos.admin
        .from('cuentas_por_cobrar')
        .select('estado, saldo_pendiente, cobrable_desde')
        .eq('id', datos.anticipoArId)
        .single();
      return `${data?.estado}:${data?.saldo_pendiente}:${data?.cobrable_desde}`;
    }).toBe('parcial:800:null');
  });

  test('abre una factura excepcional para orden entregada sin AR y propone el total RFQ', async ({ page }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;
    await iniciarSesion(page, datos);
    await page.goto('/cobranza');
    await page.getByRole('button', { name: 'Nueva factura de orden sin cuenta' }).click();
    await page.getByLabel('Buscar folio de orden').fill(datos.excepcionFolioOrden);
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByLabel('Orden entregada sin cuenta').selectOption(datos.excepcionOrdenId);
    await expect(page.getByText(/descuento \$10\.00.*IVA \$14\.40.*total sugerido \$104\.40/)).toBeVisible();
    await expect(page.getByLabel('Importe total confirmado')).toHaveValue('104.40');
    await expect(page.getByLabel('Fecha de vencimiento')).not.toHaveValue('');
    await page.getByLabel('Número de factura o remisión').fill(`FAC-HIST-${datos.excepcionFolioOrden}`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-ar02-excepcion-escritorio-claro.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-ar02-excepcion-movil-oscuro.png', fullPage: true });
    await page.getByLabel('Número de factura o remisión').scrollIntoViewIfNeeded();
    await expect(page.getByLabel('Número de factura o remisión')).toBeVisible();
    await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-ar02-excepcion-movil-formulario.png', fullPage: true });
    await page.getByRole('button', { name: 'Guardar y registrar abono' }).click();
    await expect(page.getByRole('dialog', { name: 'Nueva factura de orden entregada' })).toBeHidden();
    await expect(page.getByLabel('Monto')).toBeVisible();
    const { data: cuenta, count } = await datos.admin.from('cuentas_por_cobrar')
      .select('id, monto_total, folio_factura_remision, referencia_interna, cliente_id', { count: 'exact' })
      .eq('orden_id', datos.excepcionOrdenId).single();
    expect(count).toBe(1);
    expect(cuenta).toMatchObject({ monto_total: 104.4, cliente_id: datos.clienteId,
      folio_factura_remision: `FAC-HIST-${datos.excepcionFolioOrden}` });
    expect(cuenta?.referencia_interna).toMatch(/^INVCNC-\d{7}$/);
    await page.getByLabel('Monto').fill('20');
    await page.getByLabel('Referencia bancaria').fill('E2E-ABONO-INICIAL');
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByTestId('recibo-persistido')).toContainText(cuenta!.referencia_interna);
    const { data: pagosIniciales } = await datos.admin.from('pagos_ar').select('id').eq('ar_id', cuenta!.id);
    expect(pagosIniciales).toHaveLength(1);
    await expect(page.getByRole('row', { name: new RegExp(datos.excepcionFolioOrden) })).toContainText(cuenta!.referencia_interna);
  });
});
