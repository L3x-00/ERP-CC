import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

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

test.describe('Configuración maestra', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
      'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales de configuración.',
    );
  });

  test('admin actualiza tipo de cambio, lo ve en el store y persiste al volver a leer', async ({ page }) => {
    const acceso = credenciales('ADMIN');
    test.skip(!acceso, 'Faltan E2E_CONFIGURACION_ADMIN_EMAIL/PASSWORD.');
    if (!acceso) return;
    await iniciarSesion(page, acceso);
    await page.goto('/configuracion');
    await expect(page.getByTestId('pagina-configuracion')).toBeVisible();
    await page.getByRole('tab', { name: 'Tarifas / TC' }).click();
    const admin = clienteAdmin();
    let valorOriginal: number | null = null;
    if (admin) {
      const lectura = await admin.from('configuracion_sistema').select('tipo_cambio_usd').eq('id', 'main').single();
      valorOriginal = lectura.data?.tipo_cambio_usd ?? null;
    }
    try {
      await page.getByTestId('configuracion-tipo-cambio').fill('19.7500');
      await page.getByRole('button', { name: 'Guardar tarifas y TC' }).click();
      await expect(page.getByTestId('configuracion-confirmacion')).toContainText('guardados');
      await expect(page.getByTestId('configuracion-tipo-cambio-vigente')).toContainText('19.7500');
      await page.reload();
      await page.getByRole('tab', { name: 'Tarifas / TC' }).click();
      await expect(page.getByTestId('configuracion-tipo-cambio')).toHaveValue('19.75');
    } finally {
      if (admin && valorOriginal !== null) {
        await admin.from('configuracion_sistema').update({ tipo_cambio_usd: valorOriginal }).eq('id', 'main');
      }
    }
  });

  test('usuario sin configuración es bloqueado o redirigido', async ({ page }) => {
    const acceso = credenciales('VENDEDOR');
    test.skip(!acceso, 'Faltan E2E_CONFIGURACION_VENDEDOR_EMAIL/PASSWORD.');
    if (!acceso) return;
    await iniciarSesion(page, acceso);
    await page.goto('/configuracion');
    await expect(page).toHaveURL(/\/(dashboard|iniciar-sesion)(?:\/)?$/);
    await expect(page.getByTestId('pagina-configuracion')).toHaveCount(0);
  });
});
