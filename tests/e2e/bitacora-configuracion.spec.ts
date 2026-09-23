import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

// playwright.config.ts exige URL de loopback antes de importar esta prueba.
test('CFG-13/PRD-18: admin consulta actividad paginada sin detalles sensibles', async ({ page }) => {
  const correo = process.env.E2E_CONFIGURACION_ADMIN_EMAIL;
  const contrasena = process.env.E2E_CONFIGURACION_ADMIN_PASSWORD;
  test.skip(!correo || !contrasena, 'Requiere administrador del stack local');
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: perfil, error: errorPerfil } = await admin.from('usuarios')
    .select('id').eq('email', correo!).single();
  if (errorPerfil) throw errorPerfil;
  const recursoId = randomUUID();
  const actor = `Auditor A18 ${randomUUID().slice(0, 8)}`;
  const secreto = `NO-MOSTRAR-${randomUUID()}`;
  let oportunidadId: string | undefined;
  try {
    const { error } = await admin.from('logs').insert(Array.from({ length: 12 }, () => ({
      usuario_id: perfil.id,
      nombre_usuario: actor,
      rol: 'admin',
      accion: 'prueba_a18',
      modulo: 'ordenes',
      recurso_id: recursoId,
      detalles: { secreto },
    })));
    if (error) throw error;

    const folio = await admin.rpc('generar_folio_op');
    if (folio.error || !folio.data) throw new Error(folio.error?.message ?? 'Sin folio');
    const oportunidad = await admin.from('pipeline').insert({
      folio_op: folio.data, vendedor_id: perfil.id,
      empresa: 'A18 Enlace local', nombre_contacto: 'A18', etapa: 'prospecto',
    }).select('id').single();
    if (oportunidad.error || !oportunidad.data) throw new Error(oportunidad.error?.message ?? 'Sin oportunidad');
    oportunidadId = oportunidad.data.id;
    const eventoEnlace = await admin.from('logs').insert({
      usuario_id: perfil.id, nombre_usuario: 'A18 Enlace', rol: 'admin',
      accion: 'crear', modulo: 'pipeline', recurso_id: oportunidadId,
      detalles: { secreto },
    });
    if (eventoEnlace.error) throw eventoEnlace.error;

    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(correo!);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasena!);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => ['/dashboard', '/tablero'].includes(url.pathname));
    await page.goto('/configuracion');
    await page.getByRole('tab', { name: 'Bitácora' }).click();
    const vista = page.getByTestId('bitacora-configuracion');
    await expect(vista.getByLabel('Entradas por página')).toHaveValue('60');
    await vista.getByLabel('Entradas por página').selectOption('10');
    await vista.getByLabel('Actor').fill(actor);
    await expect(vista.getByText('12 registros')).toBeVisible();
    await expect(vista.locator('tbody tr')).toHaveCount(10);
    if (process.env.A18_CAPTURAR_VISUAL === '1') {
      for (const [nombre, ancho, alto] of [
        ['escritorio', 1440, 900], ['tableta', 768, 900], ['movil', 390, 844],
      ] as const) {
        await page.setViewportSize({ width: ancho, height: alto });
        for (const tema of ['claro', 'oscuro'] as const) {
          await page.locator('html').evaluate((nodo, oscuro) => nodo.classList.toggle('dark', oscuro), tema === 'oscuro');
          await expect.poll(() => vista.getByLabel('Módulo').evaluate((nodo) => getComputedStyle(nodo).backgroundColor))
            .toBe(tema === 'oscuro' ? 'rgb(51, 65, 85)' : 'rgb(241, 243, 245)');
          await page.screenshot({ path: `.ai-shared/qa/cierre-auditoria-2026-09-22/a18-${nombre}-${tema}.png`, fullPage: true, animations: 'disabled' });
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('html').evaluate((nodo) => nodo.classList.remove('dark'));
    }
    await vista.getByRole('button', { name: 'Siguiente' }).click();
    await expect(vista.locator('tbody tr')).toHaveCount(2);
    const insercionConcurrente = await admin.from('logs').insert({
      usuario_id: perfil.id, nombre_usuario: actor, rol: 'admin',
      accion: 'prueba_a18', modulo: 'ordenes', recurso_id: recursoId,
      detalles: { secreto },
    });
    if (insercionConcurrente.error) throw insercionConcurrente.error;
    await Promise.all([
      page.waitForResponse((respuesta) => respuesta.request().method() === 'POST'
        && new URL(respuesta.url()).pathname === '/configuracion'),
      vista.getByRole('button', { name: 'Actualizar' }).click(),
    ]);
    await expect(vista.getByText('12 registros')).toBeVisible();
    await expect(vista.locator('tbody tr')).toHaveCount(2);
    await vista.getByLabel('Registro').fill(recursoId);
    await expect(vista.getByText('13 registros')).toBeVisible();
    await vista.getByLabel('Desde').fill('2099-01-01');
    await expect(vista.getByText('0 registros')).toBeVisible();
    await vista.getByLabel('Desde').fill('');
    await expect(vista.getByText('13 registros')).toBeVisible();
    await expect(vista).not.toContainText(secreto);

    await vista.getByLabel('Actor').fill('A18 Enlace');
    await vista.getByLabel('Registro').fill('');
    const enlace = vista.getByRole('link', { name: 'Abrir registro' });
    await expect(enlace).toHaveAttribute('href', `/pipeline?oportunidad=${oportunidadId}`);
    await enlace.click();
    await expect(page).toHaveURL(new RegExp(`/pipeline\\?oportunidad=${oportunidadId}$`));
  } finally {
    await admin.from('logs').delete().eq('recurso_id', recursoId);
    if (oportunidadId) {
      await admin.from('logs').delete().eq('recurso_id', oportunidadId);
      await admin.from('pipeline').delete().eq('id', oportunidadId);
    }
  }
});

test('CFG-13: un vendedor no ve la pestaña de bitácora', async ({ page }) => {
  const correo = process.env.E2E_CONFIGURACION_VENDEDOR_EMAIL;
  const contrasena = process.env.E2E_CONFIGURACION_VENDEDOR_PASSWORD;
  test.skip(!correo || !contrasena, 'Requiere vendedor del stack local');
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(correo!);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasena!);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => ['/dashboard', '/tablero'].includes(url.pathname));
  await page.goto('/configuracion');
  await expect(page.getByRole('tab', { name: 'Bitácora' })).toHaveCount(0);
});
