import { expect, test, type Page } from '@playwright/test';

type Credenciales = { correo: string; contrasena: string };

function credencialesVendedor(): Credenciales | null {
  const correo = process.env.E2E_DASHBOARD_VENDEDOR_EMAIL;
  const contrasena = process.env.E2E_DASHBOARD_VENDEDOR_PASSWORD;
  return correo && contrasena ? { correo, contrasena } : null;
}

async function iniciarSesion(page: Page, acceso: Credenciales): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(acceso.correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(acceso.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/produccion');
}

test.use({ colorScheme: 'light' });

test.describe('Tema global claro/oscuro', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
      'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales dashboard explícitas.',
    );
  });

  test('el vendedor alterna el tema desde su menú y se conserva entre rutas y recargas', async ({
    page,
  }) => {
    const acceso = credencialesVendedor();
    test.skip(!acceso, 'Faltan E2E_DASHBOARD_VENDEDOR_EMAIL/PASSWORD.');
    if (!acceso) return;

    await iniciarSesion(page, acceso);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('pagina-dashboard')).toBeVisible();

    // El contexto arranca en claro (colorScheme: 'light').
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
    ).toBe('light');

    // Cambio a oscuro desde el desplegable del usuario.
    await page.getByTestId('menu-usuario').click();
    await page.getByRole('menuitem', { name: 'Cambiar a tema oscuro' }).click();

    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await expect(page.locator('html')).not.toHaveClass(/\blight\b/);
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
    ).toBe('dark');
    expect(await page.evaluate(() => window.localStorage.getItem('theme'))).toBe('dark');

    // La elección alcanza otra ruta y sobrevive a una recarga completa.
    await page.goto('/clientes');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Clientes' })).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await page.reload();
    await expect(page.getByRole('main').getByRole('heading', { name: 'Clientes' })).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    // El mismo control regresa a claro y también lo persiste.
    await page.getByTestId('menu-usuario').click();
    await page.getByRole('menuitem', { name: 'Cambiar a tema claro' }).click();

    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    expect(await page.evaluate(() => window.localStorage.getItem('theme'))).toBe('light');

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
  });
});
