import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

type Contexto = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  usuarioId: string;
  proveedorId: string;
  ordenId: string;
  compraId: string;
};

async function prepararContexto(): Promise<Contexto> {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-b8f4-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Aa9`;
  const alta = await admin.auth.admin.createUser({
    email: correo, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Admin B8F4 ${sufijo}` },
  });
  if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario');
  const usuarioId = alta.data.user.id;
  await admin.from('usuarios').update({ rol: 'admin', activo: true, nombre_completo: `Admin B8F4 ${sufijo}` }).eq('id', usuarioId);

  const { data: proveedor, error: errorProveedor } = await admin.from('proveedores').insert({
    nombre_comercial: `Proveedor F4 ${sufijo}`, razon_social: `Proveedor F4 ${sufijo} SA`,
    contacto_nombre: 'Contacto F4', correo: `proveedor-${sufijo}@orca.local`, telefono: '5555555555',
  }).select('id').single();
  if (errorProveedor || !proveedor) throw new Error(`Sin proveedor: ${errorProveedor?.message}`);

  const { data: cliente } = await admin.from('clientes').insert({
    nombre_comercial: `Cliente F4 ${sufijo}`, razon_social: `Cliente F4 ${sufijo} SA`, estado: 'activo',
  }).select('id').single();
  if (!cliente) throw new Error('Sin cliente');

  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio: `OP-${String(Date.now()).slice(-6)}`, folio_sii: 'O-9999_69',
    cliente_id: cliente.id, estado: 'completada', fecha_compromiso: '2099-12-30T10:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`Sin orden: ${errorOrden?.message}`);

  return { admin, correo, contrasena, usuarioId, proveedorId: proveedor.id, ordenId: orden.id, compraId: '' };
}

async function limpiarContexto(contexto: Contexto): Promise<void> {
  const { admin } = contexto;
  await admin.from('pagos_compra').delete().eq('compra_id', contexto.compraId);
  await admin.from('compras').delete().eq('id', contexto.compraId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('proveedores').delete().eq('id', contexto.proveedorId);
  await admin.from('logs').delete().eq('usuario_id', contexto.usuarioId);
  await admin.from('usuarios').delete().eq('id', contexto.usuarioId);
  await admin.auth.admin.deleteUser(contexto.usuarioId);
}

async function iniciarSesion(page: Page, contexto: Contexto): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(contexto.correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
}

test.describe('Compras SII-B8 F4: folio CG, CxP y pagos a proveedores', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales del stack local.',
  );

  test('borrador CG → confirmar → recibir → pagos parciales → PAGADA', async ({ page }) => {
    const contexto = await prepararContexto();
    const { admin } = contexto;
    try {
      await iniciarSesion(page, contexto);
      await page.goto('/compras');
      await expect(page.getByTestId('cola-compras')).toBeVisible();

      // 1. Alta en borrador con folio CG.
      await page.getByTestId('nueva-compra').click();
      await expect(page.getByTestId('panel-compra')).toBeVisible();
      await page.getByTestId('compra-proveedor').selectOption(contexto.proveedorId);
      await page.getByTestId('compra-subtotal').fill('200');
      await page.getByTestId('compra-iva').fill('32');
      await page.getByTestId('confirmar-crear-compra').click();
      await expect(page.getByTestId('compra-mensaje')).toContainText('CG-');
      const { data: compra } = await admin.from('compras')
        .select('id, folio_sii, estado, saldo_pendiente').eq('proveedor_id', contexto.proveedorId).single();
      expect(compra?.folio_sii).toMatch(/^CG-\d{4}_\d{4,}$/);
      expect(compra?.estado).toBe('BORRADOR');
      expect(Number(compra?.saldo_pendiente)).toBe(232);
      contexto.compraId = compra!.id;
      await page.getByTestId('cerrar-panel-compra').click();

      // 2. Confirmar (CxP) y recibir.
      await page.getByTestId(`confirmar-compra-${compra!.id}`).click();
      await page.getByTestId('confirmar-confirmar-compra').click();
      await expect(page.getByTestId('compra-mensaje')).toContainText('confirmada');
      await expect.poll(async () => {
        const { data } = await admin.from('compras').select('estado').eq('id', compra!.id).single();
        return data?.estado ?? null;
      }).toBe('CONFIRMADA');
      await page.getByTestId('cerrar-panel-compra').click();
      await page.reload();
      await page.getByTestId(`recibir-compra-${compra!.id}`).click();
      await page.getByTestId('confirmar-recibir-compra').click();
      await expect(page.getByTestId('compra-mensaje')).toContainText('recibida');
      await expect.poll(async () => {
        const { data } = await admin.from('compras').select('estado').eq('id', compra!.id).single();
        return data?.estado ?? null;
      }).toBe('RECIBIDA');
      await page.getByTestId('cerrar-panel-compra').click();

      // 3. Pago parcial y liquidación.
      await page.reload();
      await page.getByTestId(`pagar-compra-${compra!.id}`).click();
      await page.getByTestId('pago-monto').fill('100');
      await page.getByTestId('confirmar-pago-compra').click();
      await expect(page.getByTestId('compra-mensaje')).toContainText('saldo');
      await expect.poll(async () => {
        const { data } = await admin.from('compras').select('estado, saldo_pendiente').eq('id', compra!.id).single();
        return data ? `${data.estado}:${Number(data.saldo_pendiente)}` : null;
      }).toBe('RECIBIDA:132');
      await page.getByTestId('cerrar-panel-compra').click();
      await page.reload();
      await page.getByTestId(`pagar-compra-${compra!.id}`).click();
      await page.getByTestId('pago-monto').fill('132');
      await page.getByTestId('confirmar-pago-compra').click();
      await expect(page.getByTestId('compra-mensaje')).toContainText('PAGADA');
      await expect.poll(async () => {
        const { data } = await admin.from('compras').select('estado, saldo_pendiente').eq('id', compra!.id).single();
        return data ? `${data.estado}:${Number(data.saldo_pendiente)}` : null;
      }).toBe('PAGADA:0');
      const { data: pagos } = await admin.from('pagos_compra').select('monto').eq('compra_id', compra!.id);
      expect(pagos?.map((pago) => Number(pago.monto)).sort((a, b) => a - b)).toEqual([100, 132]);

      // Capturas de la cola con la compra pagada.
      mkdirSync('.ai-shared/qa/sii-b8-f4/visual', { recursive: true });
      await page.getByTestId('cerrar-panel-compra').click();
      for (const [ancho, alto] of [[1440, 900], [768, 1024]] as const) {
        await page.setViewportSize({ width: ancho, height: alto });
        for (const oscuro of [false, true]) {
          await page.locator('html').evaluate(
            (elemento, activar) => elemento.classList.toggle('dark', activar), oscuro,
          );
          await page.screenshot({
            path: `.ai-shared/qa/sii-b8-f4/visual/compras-${ancho}-${oscuro ? 'oscuro' : 'claro'}.png`,
            fullPage: true, animations: 'disabled',
          });
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));
    } finally {
      await limpiarContexto(contexto);
    }
  });
});
