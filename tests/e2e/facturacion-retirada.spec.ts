import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

/**
 * El cliente no emite facturas fiscales: el módulo Facturación se retiró de la
 * navegación y su ruta histórica redirige a Cobranza. Las tablas y RPC siguen
 * existiendo para no romper el histórico, así que la prueba valida el retiro
 * funcional desde la interfaz, no el backend.
 */
type Contexto = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  usuarioId: string;
};

async function prepararContexto(): Promise<Contexto> {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-facturacion-retirada-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Aa9`;
  const alta = await admin.auth.admin.createUser({
    email: correo, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Admin Facturación retirada ${sufijo}` },
  });
  if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario');
  const usuarioId = alta.data.user.id;
  await admin.from('usuarios')
    .update({ rol: 'admin', activo: true, nombre_completo: `Admin Facturación retirada ${sufijo}` })
    .eq('id', usuarioId);
  return { admin, correo, contrasena, usuarioId };
}

async function limpiarContexto(contexto: Contexto): Promise<void> {
  const { admin } = contexto;
  await admin.from('logs').delete().eq('usuario_id', contexto.usuarioId);
  await admin.from('usuarios').delete().eq('id', contexto.usuarioId);
  await admin.auth.admin.deleteUser(contexto.usuarioId);
}

async function iniciarSesion(page: Page, contexto: Contexto): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(contexto.correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
}

test.describe('Facturación retirada: sin navegación y con redirección a Cobranza', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales del stack local.',
  );

  test('la ruta histórica /facturacion redirige a Cobros y el módulo no aparece en la navegación', async ({ page }) => {
    const contexto = await prepararContexto();
    try {
      await iniciarSesion(page, contexto);
      await expect(page.getByRole('link', { name: /^Facturación$/i })).toHaveCount(0);

      await page.goto('/facturacion');
      await page.waitForURL((url) => (
        url.pathname === '/cobros' && url.searchParams.get('seccion') === 'cobranza'
      ));
      await expect(page.getByTestId('operacion-cobranza')).toBeVisible();
    } finally {
      await limpiarContexto(contexto);
    }
  });
});
