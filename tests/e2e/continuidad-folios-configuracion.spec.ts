import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

// playwright.config.ts exige loopback antes de importar las pruebas mutantes.
test('CFG-04: administrador conserva 47→48 sin retroceso y recarga la continuidad', async ({ page }) => {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const periodo = '1198'; // noviembre de 2098: fixture local fuera del periodo vigente.
  const previo = await admin.from('contador_folios').select('ultimo').eq('periodo', periodo).maybeSingle();
  if (previo.error) throw previo.error;
  if (previo.data) throw new Error('Periodo fixture CFG-04 ocupado; se preserva sin cambios');

  const correo = `cfg04-${randomUUID()}@orca.local`;
  const contrasena = `Cfg04!${randomUUID()}Aa`;
  const alta = await admin.auth.admin.createUser({ email: correo, password: contrasena, email_confirm: true });
  if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creó administrador local');
  const actorId = alta.data.user.id;
  try {
    const perfil = await admin.from('usuarios').update({ rol: 'admin', activo: true }).eq('id', actorId);
    if (perfil.error) throw perfil.error;
    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => ['/dashboard', '/tablero'].includes(url.pathname));
    await page.goto('/configuracion');
    await page.getByRole('tab', { name: 'Folios' }).click();
    const panel = page.getByTestId('continuidad-folios');
    await panel.getByLabel('Mes de folio').fill('2098-11');
    await expect(panel).toContainText('CNC-1198-0001');
    await panel.getByLabel('Establecer último número reservado').fill('47');
    await panel.getByRole('button', { name: 'Guardar continuidad' }).click();
    await expect(panel.getByRole('status')).toContainText('Continuidad guardada en 47');
    await expect(panel).toContainText('CNC-1198-0048');
    await expect.poll(async () => {
      const { data } = await admin.from('contador_folios').select('ultimo').eq('periodo', periodo).single();
      return data?.ultimo;
    }).toBe(47);

    for (const [nombre, ancho, alto] of [
      ['escritorio', 1440, 900], ['tableta', 768, 900], ['movil', 390, 844],
    ] as const) {
      await page.setViewportSize({ width: ancho, height: alto });
      for (const tema of ['claro', 'oscuro'] as const) {
        await page.locator('html').evaluate((elemento, oscuro) => elemento.classList.toggle('dark', oscuro), tema === 'oscuro');
        await page.screenshot({ path: `.ai-shared/qa/cierre-auditoria-2026-09-22/a20-cfg04-${nombre}-${tema}.png`, fullPage: true, animations: 'disabled' });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));

    await page.reload();
    await page.getByRole('tab', { name: 'Folios' }).click();
    await panel.getByLabel('Mes de folio').fill('2098-11');
    await expect(panel).toContainText('CNC-1198-0048');
    await panel.getByLabel('Establecer último número reservado').fill('46');
    await panel.getByRole('button', { name: 'Guardar continuidad' }).click();
    await expect(panel.getByRole('alert')).toContainText('entre 47 y 9999');
    const comprobacion = await admin.from('contador_folios').select('ultimo').eq('periodo', periodo).single();
    expect(comprobacion.data?.ultimo).toBe(47);
  } finally {
    await admin.from('logs').delete().eq('usuario_id', actorId).eq('accion', 'ajustar_continuidad_folio_cnc');
    await admin.from('contador_folios').delete().eq('periodo', periodo);
    await admin.auth.admin.deleteUser(actorId);
  }
});
