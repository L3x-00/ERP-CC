import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

const PNG_VALIDO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PNG_MAYOR_1_MIB = Buffer.concat([PNG_VALIDO, Buffer.alloc(2 * 1024 * 1024)]);

type Fixture = { admin: SupabaseClient<Database>; usuarioId: string; proveedorId: string; correo: string; clave: string };

async function crearFixture(): Promise<Fixture> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('A19 E2E exige Supabase loopback');
  }
  const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } });
  const sufijo = randomUUID().slice(0, 8);
  const correo = `a19-${sufijo}@orca.local`;
  const clave = `A19!${randomUUID()}x`;
  const { data: alta, error: errorAlta } = await admin.auth.admin.createUser({
    email: correo, password: clave, email_confirm: true,
    user_metadata: { nombre_completo: `Contador A19 ${sufijo}` },
  });
  if (errorAlta || !alta.user) throw errorAlta ?? new Error('Sin usuario A19');
  const usuarioId = alta.user.id;
  const { error: errorRol } = await admin.from('usuarios').update({ rol: 'contador', activo: true }).eq('id', usuarioId);
  if (errorRol) throw errorRol;
  const { data: proveedor, error: errorProveedor } = await admin.from('proveedores').insert({
    nombre_comercial: `Proveedor A19 ${sufijo}`, contacto_nombre: 'Prueba A19',
    correo: `proveedor-${sufijo}@orca.local`, telefono: '5550000000',
  }).select('id').single();
  if (errorProveedor || !proveedor) throw errorProveedor ?? new Error('Sin proveedor A19');
  return { admin, usuarioId, proveedorId: proveedor.id, correo, clave };
}

async function limpiarFixture(f: Fixture): Promise<void> {
  const { data: gastos } = await f.admin.from('gastos').select('id, comprobante_ruta').eq('creado_por', f.usuarioId);
  const ids = (gastos ?? []).map((gasto) => gasto.id);
  const { data: anteriores } = ids.length
    ? await f.admin.from('comprobantes_gasto_historial').select('ruta').in('gasto_id', ids)
    : { data: [] as { ruta: string }[] };
  const rutas = [...(gastos ?? []).map((gasto) => gasto.comprobante_ruta), ...(anteriores ?? []).map((fila) => fila.ruta)]
    .filter((ruta): ruta is string => Boolean(ruta));
  if (rutas.length) await f.admin.storage.from('comprobantes-gasto').remove(rutas);
  if (ids.length) await f.admin.from('comprobantes_gasto_historial').delete().in('gasto_id', ids);
  await f.admin.from('gastos').delete().eq('creado_por', f.usuarioId);
  await f.admin.from('proveedores').delete().eq('id', f.proveedorId);
  await f.admin.from('logs').delete().eq('usuario_id', f.usuarioId);
  await f.admin.from('usuarios').delete().eq('id', f.usuarioId);
  await f.admin.auth.admin.deleteUser(f.usuarioId);
}

test.describe.serial('A19 gastos y comprobantes privados', () => {
  test.skip(process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si', 'Solo stack local habilitado explícitamente');
  let fixture: Fixture | null = null;
  test.beforeAll(async () => { fixture = await crearFixture(); });
  test.afterAll(async () => { if (fixture) await limpiarFixture(fixture); });

  test('crea, filtra, reabre y edita gasto con recibo persistido', async ({ page }) => {
    if (!fixture) throw new Error('Fixture ausente');
    const f = fixture;
    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(f.correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(f.clave);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => ['/dashboard', '/tablero'].includes(url.pathname));
    await page.goto('/gastos');
    await page.getByRole('button', { name: 'Registrar gasto' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Proveedor (opcional)').selectOption(f.proveedorId);
    await dialogo.getByLabel('Tipo de gasto').selectOption('fijo');
    await dialogo.getByLabel('Descripción').fill('Servicio A19 inicial');
    await dialogo.getByRole('spinbutton', { name: 'Subtotal' }).fill('100');
    await dialogo.getByRole('spinbutton', { name: 'IVA' }).fill('16');
    await dialogo.getByRole('spinbutton', { name: 'Total', exact: true }).fill('116');
    await dialogo.getByLabel('Comprobante (opcional)').setInputFiles({ name: 'recibo.png', mimeType: 'image/png', buffer: PNG_MAYOR_1_MIB });
    await expect(dialogo.getByAltText('Vista previa del comprobante seleccionado')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Guardar gasto' }).click();
    await expect(dialogo).toHaveCount(0);

    const { data: gasto, error } = await f.admin.from('gastos')
      .select('id, folio, proveedor_id, tipo_gasto, comprobante_ruta, monto_total')
      .eq('creado_por', f.usuarioId).single();
    if (error || !gasto) throw error ?? new Error('Sin gasto persistido');
    expect(gasto.proveedor_id).toBe(f.proveedorId);
    expect(gasto.tipo_gasto).toBe('fijo');
    expect(gasto.comprobante_ruta).toMatch(/\.png$/);
    const { data: original } = await f.admin.storage.from('comprobantes-gasto').download(gasto.comprobante_ruta as string);
    expect(original?.size).toBe(PNG_MAYOR_1_MIB.length);

    await page.getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption(f.proveedorId);
    await page.getByRole('combobox', { name: 'IVA', exact: true }).selectOption('con');
    await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('fijo');
    await expect(page.getByText('1 resultados')).toBeVisible();
    const fila = page.getByRole('row').filter({ hasText: gasto.folio });
    await expect(fila).toContainText('Proveedor A19');
    await expect(page.getByRole('region', { name: 'Resumen de gastos filtrados' }).getByText('Fijos')).toBeVisible();
    await page.getByRole('button', { name: 'Ocultar gráfico' }).click();
    await page.getByRole('button', { name: 'Mostrar gráfico' }).click();
    for (const [nombre, ancho, alto] of [
      ['escritorio', 1440, 900], ['tableta', 768, 1024], ['movil', 390, 844],
    ] as const) {
      await page.setViewportSize({ width: ancho, height: alto });
      for (const tema of ['claro', 'oscuro'] as const) {
        await page.locator('html').evaluate((nodo, oscuro) => nodo.classList.toggle('dark', oscuro), tema === 'oscuro');
        await page.screenshot({
          path: `.ai-shared/qa/cierre-auditoria-2026-09-22/a19-${nombre}-${tema}.png`,
          fullPage: true, animations: 'disabled',
        });
      }
    }
    await fila.getByRole('button', { name: 'Editar' }).click();
    await expect(dialogo).toBeVisible();
    await dialogo.getByLabel('Comprobante (opcional)').setInputFiles({ name: 'descartado.png', mimeType: 'image/png', buffer: PNG_VALIDO });
    await dialogo.getByRole('button', { name: 'Escanear comprobante con IA' }).click();
    await expect(dialogo.getByText('Datos extraídos; revisa los campos antes de guardar.')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect.poll(async () => {
      const { data: objetos } = await f.admin.storage.from('comprobantes-gasto').list(f.usuarioId);
      return objetos?.length;
    }).toBe(1);
    const { data: trasCancelar } = await f.admin.from('gastos')
      .select('descripcion, monto_total, comprobante_ruta').eq('id', gasto.id).single();
    expect(trasCancelar?.descripcion).toBe('Servicio A19 inicial');
    expect(Number(trasCancelar?.monto_total)).toBe(116);
    expect(trasCancelar?.comprobante_ruta).toBe(gasto.comprobante_ruta);
    await page.locator('html').evaluate((nodo) => nodo.classList.remove('dark'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Materia prima' }).click();
    await expect(page.getByRole('combobox', { name: 'Categoría' })).toHaveValue('materia_prima');

    const popup = page.waitForEvent('popup');
    await fila.getByRole('button', { name: 'Comprobante' }).click();
    const recibo = await popup;
    await recibo.waitForURL(/comprobantes-gasto/);
    await recibo.close();

    await fila.getByRole('button', { name: 'Editar' }).click();
    await expect(dialogo.getByLabel('Descripción')).toHaveValue('Servicio A19 inicial');
    await dialogo.getByLabel('Tipo de gasto').selectOption('variable');
    await dialogo.getByLabel('Descripción').fill('Servicio A19 corregido');
    await dialogo.getByRole('spinbutton', { name: 'Subtotal' }).fill('200');
    await dialogo.getByRole('spinbutton', { name: 'IVA' }).fill('32');
    await dialogo.getByRole('spinbutton', { name: 'Total', exact: true }).fill('232');
    await dialogo.getByLabel('Comprobante (opcional)').setInputFiles({ name: 'recibo-corregido.png', mimeType: 'image/png', buffer: PNG_VALIDO });
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(dialogo).toHaveCount(0);
    const { data: editado } = await f.admin.from('gastos')
      .select('descripcion, monto_total, tipo_gasto, comprobante_ruta').eq('id', gasto.id).single();
    expect(editado?.descripcion).toBe('Servicio A19 corregido');
    expect(Number(editado?.monto_total)).toBe(232);
    expect(editado?.tipo_gasto).toBe('variable');
    expect(editado?.comprobante_ruta).not.toBe(gasto.comprobante_ruta);
    const { data: historico } = await f.admin.from('comprobantes_gasto_historial')
      .select('ruta').eq('gasto_id', gasto.id).single();
    expect(historico?.ruta).toBe(gasto.comprobante_ruta);
    await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('variable');
    await expect(page.getByRole('row').filter({ hasText: gasto.folio })).toContainText('Servicio A19 corregido');
  });
});
