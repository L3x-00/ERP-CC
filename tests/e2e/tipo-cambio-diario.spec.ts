import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

type Credenciales = { correo: string; contrasena: string };

function credenciales(prefijo: string): Credenciales | null {
  const correo = process.env[`E2E_DASHBOARD_${prefijo}_EMAIL`];
  const contrasena = process.env[`E2E_DASHBOARD_${prefijo}_PASSWORD`];
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

async function vencerTipoCambio(
  admin: SupabaseClient<Database>,
  usuarioId: string,
): Promise<void> {
  // 36 horas atrás: cubre tanto el cambio de día como el umbral de 24 horas.
  const ayer = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from('configuracion_sistema')
    .update({
      tipo_cambio_usd: 17.5,
      tipo_cambio_actualizado_en: ayer,
      tipo_cambio_actualizado_por: usuarioId,
    })
    .eq('id', 'main');
  expect(error).toBeNull();
}

test.describe('Tipo de cambio diario (ACC-06)', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
      'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y el fixture local.',
    );
  });

  test('el admin pospone, vuelve a verlo al reingresar y guarda el TC del día', async ({ page }) => {
    const acceso = credenciales('ADMIN');
    test.skip(!acceso, 'Faltan E2E_DASHBOARD_ADMIN_EMAIL/PASSWORD.');
    if (!acceso) return;
    const admin = clienteAdmin();
    test.skip(!admin, 'Falta SUPABASE_SERVICE_ROLE_KEY para preparar el escenario.');
    if (!admin) return;

    const usuario = await admin.from('usuarios').select('id').eq('email', acceso.correo).single();
    expect(usuario.error).toBeNull();
    if (!usuario.data) return;

    const original = await admin
      .from('configuracion_sistema')
      .select('tipo_cambio_usd, tipo_cambio_actualizado_en, tipo_cambio_actualizado_por')
      .eq('id', 'main')
      .single();
    expect(original.error).toBeNull();

    try {
      await vencerTipoCambio(admin, usuario.data.id);
      await iniciarSesion(page, acceso);
      await page.goto('/dashboard');

      const modal = page.getByTestId('modal-tipo-cambio-diario');
      await expect(modal).toBeVisible();
      await expect(page.getByTestId('tipo-cambio-diario-input')).toHaveValue(/17\.5/);

      // Posponer deja un aviso visible y el modal vuelve en el siguiente ingreso.
      await page.getByTestId('tipo-cambio-diario-mas-tarde').click();
      await expect(modal).toHaveCount(0);
      await expect(page.getByTestId('aviso-tipo-cambio-diario')).toContainText('17.5000');
      await page.reload();
      await expect(page.getByTestId('modal-tipo-cambio-diario')).toBeVisible();

      // Guardar el TC corregido: desaparece el modal, el aviso y la fecha queda vigente.
      await page.getByTestId('tipo-cambio-diario-input').fill('19.4321');
      await page.getByTestId('tipo-cambio-diario-guardar').click();
      await expect(page.getByTestId('modal-tipo-cambio-diario')).toHaveCount(0);
      await expect(page.getByTestId('aviso-tipo-cambio-diario')).toHaveCount(0);

      const guardado = await admin
        .from('configuracion_sistema')
        .select('tipo_cambio_usd, tipo_cambio_actualizado_en, tipo_cambio_actualizado_por')
        .eq('id', 'main')
        .single();
      expect(Number(guardado.data?.tipo_cambio_usd)).toBeCloseTo(19.4321, 4);
      expect(guardado.data?.tipo_cambio_actualizado_por).toBe(usuario.data.id);
      const sello = new Date(guardado.data?.tipo_cambio_actualizado_en ?? 0).getTime();
      expect(Date.now() - sello).toBeLessThan(60_000);

      // Un nuevo ingreso ya no pide el TC.
      await page.reload();
      await expect(page.getByTestId('modal-tipo-cambio-diario')).toHaveCount(0);
      await expect(page.getByTestId('aviso-tipo-cambio-diario')).toHaveCount(0);
    } finally {
      if (original.data) {
        await admin
          .from('configuracion_sistema')
          .update({
            tipo_cambio_usd: original.data.tipo_cambio_usd,
            tipo_cambio_actualizado_en: original.data.tipo_cambio_actualizado_en,
            tipo_cambio_actualizado_por: original.data.tipo_cambio_actualizado_por,
          })
          .eq('id', 'main');
      }
    }
  });

  test('un vendedor con el TC vencido no ve el modal ni el aviso', async ({ page }) => {
    const acceso = credenciales('VENDEDOR');
    test.skip(!acceso, 'Faltan E2E_DASHBOARD_VENDEDOR_EMAIL/PASSWORD.');
    if (!acceso) return;
    const admin = clienteAdmin();
    test.skip(!admin, 'Falta SUPABASE_SERVICE_ROLE_KEY para preparar el escenario.');
    if (!admin) return;

    const usuario = await admin.from('usuarios').select('id').eq('email', acceso.correo).single();
    if (!usuario.data) return;
    const original = await admin
      .from('configuracion_sistema')
      .select('tipo_cambio_usd, tipo_cambio_actualizado_en, tipo_cambio_actualizado_por')
      .eq('id', 'main')
      .single();

    try {
      await vencerTipoCambio(admin, usuario.data.id);
      await iniciarSesion(page, acceso);
      await page.goto('/dashboard');
      await expect(page.getByTestId('pagina-dashboard')).toBeVisible();
      await expect(page.getByTestId('modal-tipo-cambio-diario')).toHaveCount(0);
      await expect(page.getByTestId('aviso-tipo-cambio-diario')).toHaveCount(0);
    } finally {
      if (original.data) {
        await admin
          .from('configuracion_sistema')
          .update({
            tipo_cambio_usd: original.data.tipo_cambio_usd,
            tipo_cambio_actualizado_en: original.data.tipo_cambio_actualizado_en,
            tipo_cambio_actualizado_por: original.data.tipo_cambio_actualizado_por,
          })
          .eq('id', 'main');
      }
    }
  });
});
