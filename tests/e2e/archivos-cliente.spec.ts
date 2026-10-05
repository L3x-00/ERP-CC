import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

// SII-B1.9: documentos del cliente sobre el modelo único `archivos` con
// reemplazo versionado (no se sobrescribe ni se borra en silencio).
test('SII-B1.9: documento de cliente versionado en `archivos`', async ({ page }) => {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const sufijo = randomUUID().slice(0, 8);
  const clave = `Arch!${randomUUID()}Aa`;
  const correo = `sii-b1-docs-${sufijo}@orca.local`;

  const alta = await admin.auth.admin.createUser({
    email: correo,
    password: clave,
    email_confirm: true,
    user_metadata: { nombre_completo: `Admin Docs ${sufijo}` },
  });
  if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creó admin');
  const adminId = alta.data.user.id;

  const { data: cliente, error: errorCliente } = await admin
    .from('clientes')
    .insert({
      nombre_comercial: `Docs ${sufijo}`,
      razon_social: `Docs E2E ${sufijo} SA de CV`,
      estado: 'activo',
    })
    .select('id')
    .single();
  if (errorCliente || !cliente) throw errorCliente ?? new Error('No se creó cliente');

  const archivosCreados: string[] = [];
  try {
    await admin
      .from('usuarios')
      .update({ rol: 'admin', activo: true, nombre_completo: `Admin Docs ${sufijo}` })
      .eq('id', adminId);

    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(clave);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => ['/dashboard', '/tablero'].includes(url.pathname));

    await page.goto(`/clientes?cliente=${cliente.id}`);
    // Las pestañas de la ficha son botones dentro de una navegación (no role=tab).
    await page.getByRole('button', { name: 'Documentos', exact: true }).click();

    const entrada = page.locator('input[type="file"]');
    const contenido = Buffer.from('%PDF-1.4 documento de prueba SII-B1.9');

    await entrada.setInputFiles({ name: 'csf-prueba.pdf', mimeType: 'application/pdf', buffer: contenido });
    await page.getByRole('button', { name: 'Subir' }).click();
    await expect(page.getByText('csf-prueba.pdf')).toBeVisible();

    const { data: primera } = await admin
      .from('archivos')
      .select('id, version, vigente')
      .eq('entidad', 'cliente')
      .eq('entidad_id', cliente.id)
      .eq('nombre_erp', 'csf-prueba.pdf')
      .single();
    expect(primera?.version).toBe(1);
    expect(primera?.vigente).toBe(true);
    if (primera) archivosCreados.push(primera.id);

    // Reemplazo con el mismo nombre ERP: nueva versión y la anterior deja de ser vigente.
    await entrada.setInputFiles({ name: 'csf-prueba.pdf', mimeType: 'application/pdf', buffer: contenido });
    await page.getByRole('button', { name: 'Subir' }).click();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('archivos')
          .select('version, vigente')
          .eq('entidad', 'cliente')
          .eq('entidad_id', cliente.id)
          .eq('nombre_erp', 'csf-prueba.pdf')
          .eq('vigente', true)
          .maybeSingle();
        return data?.version ?? 0;
      })
      .toBe(2);

    const { data: historial } = await admin
      .from('archivos')
      .select('id, version, vigente, reemplaza_a')
      .eq('entidad', 'cliente')
      .eq('entidad_id', cliente.id)
      .eq('nombre_erp', 'csf-prueba.pdf')
      .order('version', { ascending: true });
    archivosCreados.push(...(historial ?? []).map((fila) => fila.id));
    expect(historial?.map((fila) => fila.version)).toEqual([1, 2]);
    expect(historial?.[0].vigente).toBe(false);
    expect(historial?.[1].reemplaza_a).toBe(historial?.[0].id);
  } finally {
    await admin.from('archivos').delete().eq('entidad', 'cliente').eq('entidad_id', cliente.id);
    const { data: objetos } = await admin.storage.from('documentos-cliente').list(cliente.id, { limit: 100 });
    if (objetos && objetos.length > 0) {
      await admin.storage
        .from('documentos-cliente')
        .remove(objetos.map((objeto) => `${cliente.id}/${objeto.name}`));
    }
    await admin.from('logs').delete().eq('usuario_id', adminId);
    await admin.from('clientes').delete().eq('id', cliente.id);
    await admin.from('usuarios').delete().eq('id', adminId);
    await admin.auth.admin.deleteUser(adminId);
  }
});
