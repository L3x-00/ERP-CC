import { expect, test, type Page } from '@playwright/test';

type CredencialesDashboard = {
  correo: string;
  contrasena: string;
};

function credenciales(prefijo: string): CredencialesDashboard | null {
  const correo = process.env[`E2E_DASHBOARD_${prefijo}_EMAIL`];
  const contrasena = process.env[`E2E_DASHBOARD_${prefijo}_PASSWORD`];
  return correo && contrasena ? { correo, contrasena } : null;
}

async function iniciarSesion(page: Page, acceso: CredencialesDashboard): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(acceso.correo);
  await page.getByLabel('Contraseña').fill(acceso.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/produccion');
}

test.describe('Dashboard segmentado por rol', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
      'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales dashboard explícitas.',
    );
  });

  test('vendedor ve pipeline propio sin finanzas globales', async ({ page }) => {
    const acceso = credenciales('VENDEDOR');
    test.skip(!acceso, 'Faltan E2E_DASHBOARD_VENDEDOR_EMAIL/PASSWORD.');
    if (!acceso) return;
    await iniciarSesion(page, acceso);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Mi pipeline' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Finanzas' })).toHaveCount(0);
    await expect(page.locator('#dashboard-utilidad')).toHaveCount(0);
  });

  test('contador ve CxC, CxP y flujo de caja sin margen', async ({ page }) => {
    const acceso = credenciales('CONTADOR');
    test.skip(!acceso, 'Faltan E2E_DASHBOARD_CONTADOR_EMAIL/PASSWORD.');
    if (!acceso) return;
    await iniciarSesion(page, acceso);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('CxC pendiente')).toBeVisible();
    await expect(page.getByText('CxP pendiente')).toBeVisible();
    await expect(page.getByText('Flujo neto')).toBeVisible();
    await expect(page.getByTestId('kpi-margen-promedio')).toHaveCount(0);
  });

  test('admin ve todos los bloques ejecutivos y financieros', async ({ page }) => {
    const acceso = credenciales('ADMIN');
    test.skip(!acceso, 'Faltan E2E_DASHBOARD_ADMIN_EMAIL/PASSWORD.');
    if (!acceso) return;
    await iniciarSesion(page, acceso);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Finanzas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alertas de producción' })).toBeVisible();
  });

  test('operador es enviado directamente a producción', async ({ page }) => {
    const acceso = credenciales('OPERADOR');
    test.skip(!acceso, 'Faltan E2E_DASHBOARD_OPERADOR_EMAIL/PASSWORD.');
    if (!acceso) return;
    await iniciarSesion(page, acceso);
    await expect(page).toHaveURL(/\/produccion$/);
  });
});
