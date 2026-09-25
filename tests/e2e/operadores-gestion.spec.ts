import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

// playwright.config.ts rechaza cualquier URL que no sea loopback antes de cargar specs.
const correoAdmin = process.env.E2E_CONFIGURACION_ADMIN_EMAIL;
const contrasenaAdmin = process.env.E2E_CONFIGURACION_ADMIN_PASSWORD;

async function entrarAdministrador(page: Page): Promise<void> {
  if (!correoAdmin || !contrasenaAdmin) throw new Error('Falta fixture local de admin');
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(correoAdmin);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasenaAdmin);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => ['/dashboard', '/tablero'].includes(url.pathname));
}

async function entrarOperador(page: Page, pin: string): Promise<void> {
  await page.goto('/operador');
  for (const digito of pin) await page.getByRole('button', { name: digito, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar PIN' }).click();
  await page.waitForURL('**/produccion-piso');
}

test('CFG-05: alta, PIN único, rotación, retiro, reactivación e historia', async ({ page, browser }) => {
  test.skip(!correoAdmin || !contrasenaAdmin, 'Requiere credenciales del administrador local');
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const nombre = `Operador A17 ${sufijo}`;
  const pinOriginal = String(100000 + Math.floor(Math.random() * 900000));
  const pinNuevo = String(100000 + ((Number(pinOriginal) - 99999) % 900000));
  let operadorId: string | null = null;
  const piso = await browser.newPage();
  try {
    await entrarAdministrador(page);
    await page.goto('/configuracion');
    await page.getByRole('tab', { name: 'Operadores' }).click();
    if (process.env.A17_VISUAL_DIR) {
      for (const ancho of [1440, 768, 390]) {
        await page.setViewportSize({ width: ancho, height: 900 });
        await page.screenshot({ path: `${process.env.A17_VISUAL_DIR}/operadores-${ancho}-claro.png`, fullPage: true });
      }
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${process.env.A17_VISUAL_DIR}/operadores-390-oscuro.png`, fullPage: true });
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
      await page.waitForTimeout(350);
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.getByLabel('Nombre completo').fill(nombre);
    await page.getByLabel('PIN nuevo', { exact: true }).fill(pinOriginal);
    await page.getByTestId('guardar-operador-config').click();
    await expect(page.getByTestId('operador-config-mensaje')).toContainText('Operador creado');
    const { data: creado, error: errorCreado } = await admin.from('usuarios')
      .select('id, pin_operador').eq('nombre_completo', nombre).single();
    if (errorCreado) throw errorCreado;
    operadorId = creado.id;
    expect(creado.pin_operador).not.toBe(pinOriginal);
    expect(await page.locator('body').innerText()).not.toContain(creado.pin_operador ?? 'hash-ausente');

    await entrarOperador(piso, pinOriginal);
    const { count: accesosAntes } = await admin.from('logs').select('*', { count: 'exact', head: true })
      .eq('usuario_id', operadorId).eq('accion', 'iniciar_sesion_pin');
    expect(accesosAntes).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Nuevo operador' }).click();
    await page.getByLabel('Nombre completo').fill(`Duplicado A17 ${sufijo}`);
    await page.getByLabel('PIN nuevo', { exact: true }).fill(pinOriginal);
    await page.getByTestId('guardar-operador-config').click();
    await expect(page.getByTestId('operador-config-error')).toContainText('PIN ya pertenece');
    const { count: duplicados } = await admin.from('usuarios').select('*', { count: 'exact', head: true })
      .eq('nombre_completo', `Duplicado A17 ${sufijo}`);
    expect(duplicados).toBe(0);

    await page.getByTestId(`operador-config-${operadorId}`).getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('PIN nuevo (opcional)').fill(pinNuevo);
    await page.getByTestId('guardar-operador-config').click();
    await expect(page.getByTestId('operador-config-mensaje')).toContainText('Operador actualizado');
    // El relay de piso revalida el PIN cada 30 s y expulsa la sesión abierta.
    await expect(piso).toHaveURL(/\/operador(?:\/)?$/, { timeout: 45_000 });
    await entrarOperador(piso, pinNuevo);
    const { count: accesosTrasRotacion } = await admin.from('logs').select('*', { count: 'exact', head: true })
      .eq('usuario_id', operadorId).eq('accion', 'iniciar_sesion_pin');
    expect(accesosTrasRotacion).toBeGreaterThan(accesosAntes ?? 0);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId(`operador-config-${operadorId}`).getByRole('button', { name: 'Retirar' }).click();
    await expect(page.getByTestId('operador-config-mensaje')).toContainText('Operador retirado');
    await expect(piso).toHaveURL(/\/operador(?:\/)?$/, { timeout: 45_000 });
    const { count: accesosDespues } = await admin.from('logs').select('*', { count: 'exact', head: true })
      .eq('usuario_id', operadorId).eq('accion', 'iniciar_sesion_pin');
    expect(accesosDespues).toBe(accesosTrasRotacion);

    await page.getByTestId(`operador-config-${operadorId}`).getByRole('button', { name: 'Reactivar' }).click();
    await page.getByLabel('PIN nuevo', { exact: true }).fill(pinOriginal);
    await page.getByTestId('guardar-operador-config').click();
    await expect(page.getByTestId('operador-config-mensaje')).toContainText('Operador reactivado');
    await entrarOperador(piso, pinOriginal);
  } finally {
    await piso.close();
    if (!operadorId) {
      const { data } = await admin.from('usuarios').select('id').eq('nombre_completo', nombre).maybeSingle();
      operadorId = data?.id ?? null;
    }
    if (operadorId) {
      await admin.from('logs').delete().eq('usuario_id', operadorId);
      await admin.from('logs').delete().eq('recurso_id', operadorId);
      await admin.auth.admin.deleteUser(operadorId);
    }
  }
});
