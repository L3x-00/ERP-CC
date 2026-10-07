import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

type Contexto = {
  admin: SupabaseClient<Database>;
  correoAdmin: string;
  correoVendedor: string;
  contrasena: string;
  adminId: string;
  vendedorId: string;
};

async function prepararContexto(): Promise<Contexto> {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const contrasena = `E2e!${randomUUID()}Aa9`;
  const correoAdmin = `e2e-b9-admin-${sufijo}@orca.local`;
  const correoVendedor = `e2e-b9-vend-${sufijo}@orca.local`;

  const altaAdmin = await admin.auth.admin.createUser({
    email: correoAdmin, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Admin B9 ${sufijo}` },
  });
  if (altaAdmin.error || !altaAdmin.data.user) throw new Error(altaAdmin.error?.message ?? 'Sin admin');
  const adminId = altaAdmin.data.user.id;
  await admin.from('usuarios').update({ rol: 'admin', activo: true, nombre_completo: `Admin B9 ${sufijo}` }).eq('id', adminId);

  const altaVendedor = await admin.auth.admin.createUser({
    email: correoVendedor, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Vendedor B9 ${sufijo}` },
  });
  if (altaVendedor.error || !altaVendedor.data.user) throw new Error('Sin vendedor');
  const vendedorId = altaVendedor.data.user.id;
  await admin.from('usuarios').update({ rol: 'vendedor', activo: true, nombre_completo: `Vendedor B9 ${sufijo}` }).eq('id', vendedorId);

  return { admin, correoAdmin, correoVendedor, contrasena, adminId, vendedorId };
}

async function limpiarContexto(contexto: Contexto): Promise<void> {
  await contexto.admin.from('logs').delete().in('usuario_id', [contexto.adminId, contexto.vendedorId]);
  await contexto.admin.from('usuarios').delete().in('id', [contexto.adminId, contexto.vendedorId]);
  await contexto.admin.auth.admin.deleteUser(contexto.vendedorId);
  await contexto.admin.auth.admin.deleteUser(contexto.adminId);
}

async function iniciarSesion(page: Page, correo: string, contrasena: string): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => ['/dashboard', '/tablero'].includes(url.pathname));
}

test.describe('KPIs SII-B9: sección del dashboard por permiso de área', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales del stack local.',
  );

  test('admin ve las cinco áreas; vendedor solo ventas', async ({ page }) => {
    const contexto = await prepararContexto();
    try {
      await iniciarSesion(page, contexto.correoAdmin, contexto.contrasena);
      await page.goto('/dashboard');
      await expect(page.getByTestId('seccion-kpis')).toBeVisible();
      for (const area of ['ventas', 'produccion', 'calidad', 'rentabilidad', 'cobranza']) {
        await expect(page.getByTestId(`kpi-${area}`)).toBeVisible();
      }
      await expect(page.getByTestId('kpi-vendido')).toBeVisible();
      await expect(page.getByTestId('kpi-cobros')).toBeVisible();

      mkdirSync('.ai-shared/qa/sii-b9/visual', { recursive: true });
      for (const oscuro of [false, true]) {
        await page.locator('html').evaluate(
          (elemento, activar) => elemento.classList.toggle('dark', activar), oscuro,
        );
        await page.screenshot({
          path: `.ai-shared/qa/sii-b9/visual/kpis-dashboard-escritorio-${oscuro ? 'oscuro' : 'claro'}.png`,
          fullPage: true, animations: 'disabled',
        });
      }
      await page.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));

      await page.getByTestId('menu-usuario').click();
      await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
      await page.waitForURL((url) => url.pathname === '/iniciar-sesion');
      await iniciarSesion(page, contexto.correoVendedor, contexto.contrasena);
      await page.goto('/dashboard');
      await expect(page.getByTestId('kpi-ventas')).toBeVisible();
      await expect(page.getByTestId('kpi-cobranza')).toHaveCount(0);
      await expect(page.getByTestId('kpi-produccion')).toHaveCount(0);
      await expect(page.getByTestId('kpi-rentabilidad')).toHaveCount(0);
    } finally {
      await limpiarContexto(contexto);
    }
  });
});
