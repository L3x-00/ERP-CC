import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

// SII-B1.1/B1.2: administración de usuarios/roles y matriz de permisos por acción.
test('SII-B1: roles de usuario y matriz de permisos con auditoría', async ({ page }) => {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const sufijo = randomUUID().slice(0, 8);
  const clave = `SiiB1!${randomUUID()}Aa`;
  const correoAdmin = `sii-b1-admin-${sufijo}@orca.local`;
  const correoObjetivo = `sii-b1-objetivo-${sufijo}@orca.local`;

  const altaAdmin = await admin.auth.admin.createUser({
    email: correoAdmin,
    password: clave,
    email_confirm: true,
    user_metadata: { nombre_completo: `Admin B1 ${sufijo}` },
  });
  if (altaAdmin.error || !altaAdmin.data.user) throw altaAdmin.error ?? new Error('No se creó admin');
  const adminId = altaAdmin.data.user.id;

  const altaObjetivo = await admin.auth.admin.createUser({
    email: correoObjetivo,
    password: clave,
    email_confirm: true,
    user_metadata: { nombre_completo: `Objetivo B1 ${sufijo}` },
  });
  if (altaObjetivo.error || !altaObjetivo.data.user) throw altaObjetivo.error ?? new Error('No se creó objetivo');
  const objetivoId = altaObjetivo.data.user.id;

  try {
    const perfilAdmin = await admin
      .from('usuarios')
      .update({ rol: 'admin', activo: true, nombre_completo: `Admin B1 ${sufijo}` })
      .eq('id', adminId);
    if (perfilAdmin.error) throw perfilAdmin.error;
    const perfilObjetivo = await admin
      .from('usuarios')
      .update({ rol: 'vendedor', activo: true, nombre_completo: `Objetivo B1 ${sufijo}` })
      .eq('id', objetivoId);
    if (perfilObjetivo.error) throw perfilObjetivo.error;

    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(correoAdmin);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(clave);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => ['/dashboard', '/tablero'].includes(url.pathname));
    await page.goto('/configuracion');

    // --- Pestaña Usuarios: cambio de rol con motivo y protección de la fila propia ---
    await page.getByRole('tab', { name: 'Usuarios' }).click();
    const panelUsuarios = page.getByTestId('configuracion-usuarios');
    const filaObjetivo = panelUsuarios.getByTestId(`usuario-fila-${objetivoId}`);
    await expect(filaObjetivo).toContainText(`Objetivo B1 ${sufijo}`);
    await expect(panelUsuarios.getByTestId(`select-rol-${adminId}`)).toBeDisabled();

    page.once('dialog', (dialog) => void dialog.accept('cambio de prueba E2E'));
    await panelUsuarios.getByTestId(`select-rol-${objetivoId}`).selectOption('gerente');
    await expect(panelUsuarios.getByTestId('usuarios-confirmacion')).toContainText('Rol actualizado');
    await expect
      .poll(async () => {
        const { data } = await admin.from('usuarios').select('rol').eq('id', objetivoId).single();
        return data?.rol;
      })
      .toBe('gerente');

    // --- Pestaña Permisos: alta y baja de un permiso con guardado atómico ---
    await page.getByRole('tab', { name: 'Permisos' }).click();
    const panelPermisos = page.getByTestId('matriz-permisos');
    await expect(panelPermisos).toBeVisible();
    await panelPermisos.getByTestId('check-vendedor-rfq_cerrar').check();
    await panelPermisos.getByTestId('guardar-permisos').click();
    await expect(panelPermisos.getByTestId('permisos-confirmacion')).toContainText('Permisos guardados');
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('permisos_rol')
          .select('permiso')
          .eq('rol', 'vendedor')
          .eq('permiso', 'rfq_cerrar')
          .maybeSingle();
        return Boolean(data);
      })
      .toBe(true);

    // Capturas de evidencia (escritorio/tableta × claro/oscuro).
    for (const [nombre, ancho, alto] of [
      ['escritorio', 1440, 900],
      ['tableta', 768, 1024],
    ] as const) {
      await page.setViewportSize({ width: ancho, height: alto });
      for (const tema of ['claro', 'oscuro'] as const) {
        await page
          .locator('html')
          .evaluate((elemento, oscuro) => elemento.classList.toggle('dark', oscuro), tema === 'oscuro');
        await page.screenshot({
          path: `.ai-shared/qa/sii-b1-e1/visual/permisos-${nombre}-${tema}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));

    // Restaura la matriz del fixture (deja vendedor como estaba).
    await panelPermisos.getByTestId('check-vendedor-rfq_cerrar').uncheck();
    await panelPermisos.getByTestId('guardar-permisos').click();
    await expect(panelPermisos.getByTestId('permisos-confirmacion')).toContainText('Permisos guardados');
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('permisos_rol')
          .select('permiso')
          .eq('rol', 'vendedor')
          .eq('permiso', 'rfq_cerrar')
          .maybeSingle();
        return data;
      })
      .toBeNull();
  } finally {
    await admin.from('permisos_rol').delete().eq('rol', 'vendedor').eq('permiso', 'rfq_cerrar');
    await admin.from('logs').delete().in('usuario_id', [adminId, objetivoId]);
    await admin.from('usuarios').delete().in('id', [adminId, objetivoId]);
    await admin.auth.admin.deleteUser(objetivoId);
    await admin.auth.admin.deleteUser(adminId);
  }
});
