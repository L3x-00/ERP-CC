import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database, Json } from '@/compartido/tipos/supabase';

type Credenciales = { correo: string; contrasena: string };

function credenciales(nombre: string): Credenciales | null {
  const correo = process.env[`E2E_CONFIGURACION_${nombre}_EMAIL`];
  const contrasena = process.env[`E2E_CONFIGURACION_${nombre}_PASSWORD`];
  return correo && contrasena ? { correo, contrasena } : null;
}

async function iniciarSesion(page: Page, acceso: Credenciales): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(acceso.correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(acceso.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => ['/dashboard', '/produccion'].includes(url.pathname));
}

function clienteAdmin(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && clave ? createClient<Database>(url, clave, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

test.describe('Catálogos comerciales configurables (CFG-08/09)', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
      'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales de configuración.',
    );
  });

  test('el admin edita tiers y categorías; persisten y alimentan el registro de gastos', async ({ page }) => {
    const acceso = credenciales('ADMIN');
    test.skip(!acceso, 'Faltan E2E_CONFIGURACION_ADMIN_EMAIL/PASSWORD.');
    if (!acceso) return;
    const admin = clienteAdmin();
    test.skip(!admin, 'Faltan NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY para verificar la persistencia.');
    if (!admin) return;

    const original = await admin
      .from('configuracion_sistema')
      .select('tiers_json, categorias_gasto_json')
      .eq('id', 'main')
      .single();
    const tiersOriginal = original.data?.tiers_json ?? null;
    const categoriasOriginal = original.data?.categorias_gasto_json ?? null;

    await iniciarSesion(page, acceso);
    await page.goto('/configuracion');
    await expect(page.getByTestId('pagina-configuracion')).toBeVisible();
    await page.getByRole('tab', { name: 'Catálogos' }).click();

    try {
      await page.getByTestId('catalogo-descuento-plata').fill('4');
      await page.getByRole('button', { name: 'Guardar tiers' }).click();
      await expect(page.getByTestId('configuracion-confirmacion')).toContainText('Cambios guardados');

      const tiersGuardados = await admin
        .from('configuracion_sistema')
        .select('tiers_json')
        .eq('id', 'main')
        .single();
      const tiers = tiersGuardados.data?.tiers_json as {
        diasManual: number;
        tiers: { clave: string; umbralMxn: number; descuentoPorcentaje: number }[];
      };
      expect(tiers.tiers.find((tier) => tier.clave === 'plata')?.descuentoPorcentaje).toBe(4);
      expect(tiers.tiers.map((tier) => tier.clave)).toEqual(['bronce', 'plata', 'oro', 'platino']);

      await page.reload();
      await page.getByRole('tab', { name: 'Catálogos' }).click();
      await expect(page.getByTestId('catalogo-descuento-plata')).toHaveValue('4');

      await page.getByTestId('catalogo-nueva-categoria').fill('acero_inoxidable');
      await page.getByRole('button', { name: 'Agregar' }).click();
      await page.getByRole('button', { name: 'Guardar categorías' }).click();
      await expect(page.getByTestId('configuracion-confirmacion')).toContainText('Cambios guardados');

      const categoriasGuardadas = await admin
        .from('configuracion_sistema')
        .select('categorias_gasto_json')
        .eq('id', 'main')
        .single();
      const categorias = (categoriasGuardadas.data?.categorias_gasto_json as { categorias: string[] })
        .categorias;
      expect(categorias).toContain('acero_inoxidable');

      await page.goto('/gastos');
      await page.getByRole('button', { name: 'Registrar gasto' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Registrar gasto' });
      await expect(dialogo.getByLabel('Categoría').locator('option', { hasText: 'acero_inoxidable' }))
        .toHaveCount(1);
    } finally {
      if (tiersOriginal && categoriasOriginal) {
        await admin
          .from('configuracion_sistema')
          .update({
            tiers_json: tiersOriginal as Json,
            categorias_gasto_json: categoriasOriginal as Json,
          })
          .eq('id', 'main');
      }
    }
  });
});
