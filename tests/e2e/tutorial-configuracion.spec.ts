import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

type Credenciales = { correo: string; contrasena: string };

/** Varias specs E2E cargan el entorno local por sí mismas; esta hace lo mismo. */
function cargarEntornoLocal(): void {
  if (!existsSync('.env.local')) return;
  for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    process.env[coincidencia[1]] = coincidencia[2].replace(/^['"]|['"]$/g, '');
  }
}

cargarEntornoLocal();

function credencialesAdmin(): Credenciales | null {
  const correo = process.env.E2E_CONFIGURACION_ADMIN_EMAIL;
  const contrasena = process.env.E2E_CONFIGURACION_ADMIN_PASSWORD;
  return correo && contrasena ? { correo, contrasena } : null;
}

async function iniciarSesion(page: Page, acceso: Credenciales): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(acceso.correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(acceso.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => ['/dashboard', '/produccion'].includes(url.pathname));
}

test.describe('Tutorial de configuración', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
      'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales de administrador.',
    );
  });

  test('recorre los pasos, reinicia y sale sin persistencia', async ({ page }) => {
    const acceso = credencialesAdmin();
    test.skip(!acceso, 'Faltan E2E_CONFIGURACION_ADMIN_EMAIL/PASSWORD.');
    if (!acceso) return;

    await iniciarSesion(page, acceso);
    await page.goto('/configuracion');

    const botonTutorial = page.getByRole('button', { name: 'Tutorial de configuración' });
    await expect(botonTutorial).toBeVisible();
    await botonTutorial.click();

    const guia = page.getByRole('complementary', { name: 'Tutorial de configuración' });
    await expect(guia).toBeVisible();
    await expect(guia).toContainText('Paso 1 de 9');
    await expect(guia).toContainText('Personas y accesos');
    await expect(page.locator('#personas-accesos')).toHaveCount(1);

    await guia.getByRole('button', { name: 'Siguiente' }).click();
    await expect(guia).toContainText('Paso 2 de 9');
    await expect(guia).toContainText('Familia de máquinas');
    await expect(page.locator('#tarifario-ruteo')).toHaveAttribute('data-estado', 'abierto');

    await guia.getByRole('button', { name: 'Siguiente' }).click();
    await expect(guia).toContainText('Paso 3 de 9');
    await expect(page.locator('#areas-trabajo')).toHaveCount(1);

    await guia.getByRole('button', { name: 'Siguiente' }).click();
    await expect(guia).toContainText('Paso 4 de 9');
    await expect(page.locator('#procesos')).toHaveCount(1);
    await expect(page).toHaveURL(/pestana=catalogos-base/);

    await guia.getByRole('button', { name: 'Siguiente' }).click();
    await expect(guia).toContainText('Paso 5 de 9');
    await expect(page.locator('#equipos-tarifas')).toHaveCount(1);

    await guia.getByRole('button', { name: 'Siguiente' }).click();
    await expect(guia).toContainText('Paso 6 de 9');
    await expect(page.locator('#capacidad-instalada')).toHaveCount(1);
    await expect(page.locator('#capacidad-instalada [data-estado="abierto"]')).toHaveCount(1);

    await guia.getByRole('button', { name: 'Siguiente' }).click();
    await expect(guia).toContainText('Paso 7 de 9');
    await expect(page.locator('#materiales-costo')).toHaveCount(1);

    await guia.getByRole('button', { name: 'Siguiente' }).click();
    await expect(guia).toContainText('Paso 8 de 9');
    await expect(page.locator('#canales-rfq')).toHaveCount(1);
    await expect(page.locator('#canales-rfq [data-estado="abierto"]')).toHaveCount(1);

    await guia.getByRole('button', { name: 'Ver próximas acciones' }).click();
    await expect(page.locator('#proximas-acciones')).toHaveCount(1);
    await expect(page.locator('#proximas-acciones [data-estado="abierto"]')).toHaveCount(1);

    await guia.getByRole('button', { name: 'Siguiente' }).click();
    await expect(guia).toContainText('Paso 9 de 9');
    await expect(page.locator('#rfq-cola')).toHaveCount(1);

    await guia.getByRole('button', { name: 'Reiniciar' }).click();
    await expect(guia).toContainText('Paso 1 de 9');
    await expect(page).toHaveURL(/\/configuracion/);

    await guia.getByRole('button', { name: 'Salir' }).click();
    await expect(guia).toHaveCount(0);

    await page.reload();
    await expect(guia).toHaveCount(0);
    await expect(botonTutorial).toBeVisible();
  });

  test('los textos de ayuda abren y resaltan la subsección exacta', async ({ page }) => {
    const acceso = credencialesAdmin();
    test.skip(!acceso, 'Faltan E2E_CONFIGURACION_ADMIN_EMAIL/PASSWORD.');
    if (!acceso) return;

    await iniciarSesion(page, acceso);
    await page.goto('/configuracion?pestana=areas');

    const enlace = page.locator(
      '#areas-trabajo a[href="/configuracion?pestana=tarifas&foco=tarifario-ruteo"]',
    );
    await expect(enlace).toHaveCount(1);
    await enlace.click();

    await expect(page).toHaveURL(/\/configuracion\?pestana=tarifas/);
    await expect(page).toHaveURL(/foco=tarifario-ruteo/);
    await expect(page.locator('#tarifario-ruteo')).toHaveAttribute('data-estado', 'abierto');
  });
});
