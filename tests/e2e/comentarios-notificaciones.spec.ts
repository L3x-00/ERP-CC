import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

/** Carga las variables locales sin imprimir credenciales en el reporte. */
function cargarEntornoLocal(): void {
  const ruta = `${process.cwd()}\\.env.local`;
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/u)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/u.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    process.env[coincidencia[1]] = coincidencia[2].replace(/^['"]|['"]$/gu, '');
  }
}

cargarEntornoLocal();

type Credenciales = { correo: string; contrasena: string };

function variable(nombre: string): string | null {
  const valor = process.env[nombre];
  return valor && valor.trim() !== '' ? valor.trim() : null;
}

function credenciales(prefijo: string): Credenciales | null {
  const correo = variable(`${prefijo}_EMAIL`);
  const contrasena = variable(`${prefijo}_PASSWORD`);
  return correo && contrasena ? { correo, contrasena } : null;
}

function clienteAdmin(): SupabaseClient<Database> | null {
  const url = variable('NEXT_PUBLIC_SUPABASE_URL');
  const clave = variable('SUPABASE_SERVICE_ROLE_KEY');
  return url && clave
    ? createClient<Database>(url, clave, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

async function iniciarSesion(page: Page, acceso: Credenciales): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(acceso.correo);
  await page.getByLabel('Contraseña').fill(acceso.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => ['/dashboard', '/tablero', '/produccion'].includes(url.pathname));
}

test.describe.serial('comentarios contextuales y notificaciones', () => {
  const habilitado = process.env.E2E_HABILITAR_PRUEBAS_REMOTAS === 'si';
  const accesoAutor = credenciales('E2E_COMENTARIOS');
  const accesoDestinatario = credenciales('E2E_COMENTARIOS_MENCION');
  const ordenId = variable('E2E_COMENTARIOS_ORDEN_ID');
  const folioOrden = variable('E2E_COMENTARIOS_ORDEN_FOLIO');
  const destinatarioId = variable('E2E_COMENTARIOS_MENCION_USUARIO_ID');
  const destinatarioNombre = variable('E2E_COMENTARIOS_MENCION_USUARIO_NOMBRE');

  test.beforeEach(() => {
    test.skip(
      !habilitado,
      'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para usar Supabase remoto.',
    );
    test.skip(
      !accesoAutor || !ordenId || !folioOrden,
      'Faltan E2E_COMENTARIOS_EMAIL/PASSWORD/ORDEN_ID/ORDEN_FOLIO.',
    );
  });

  test('crea un comentario, resuelve una mención y lo recibe el destinatario en tiempo real', async ({ page, browser }) => {
    if (!accesoAutor || !ordenId || !folioOrden) return;
    test.skip(
      !accesoDestinatario || !destinatarioId || !destinatarioNombre,
      'Para validar la notificación se requieren credenciales y datos del destinatario mencionado.',
    );
    const admin = clienteAdmin();
    test.skip(!admin, 'Faltan NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY para verificar la persistencia.');
    if (!admin || !accesoDestinatario || !destinatarioId || !destinatarioNombre) return;

    const marcador = `E2E-COMENTARIO-${randomUUID()}`;
    let observador: Page | null = null;
    try {
      await iniciarSesion(page, accesoAutor);
    await page.goto('/ordenes');
    const fila = page.getByRole('row', { name: new RegExp(folioOrden.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')) });
    await expect(fila).toBeVisible();
    await fila.getByRole('button', { name: 'Seleccionar' }).click();
    const hilo = page.getByTestId('hilo-comentarios');
    await expect(hilo).toBeVisible();
    await hilo.getByLabel('Nuevo comentario').fill(`${marcador} @${destinatarioNombre}`);
    await hilo.getByRole('button', { name: 'Comentar' }).click();
    await expect(hilo).toContainText(marcador);

    await expect.poll(async () => {
      const resultado = await admin
        .from('comentarios_registro')
        .select('id, menciones_json')
        .eq('entidad_tipo', 'orden')
        .eq('entidad_id', ordenId)
        .ilike('contenido', `%${marcador}%`)
        .maybeSingle();
      const menciones = resultado.data?.menciones_json;
      return Array.isArray(menciones) && menciones.includes(destinatarioId);
    }).toBe(true);

      observador = await browser.newPage();
      await iniciarSesion(observador, accesoDestinatario);
      await observador.goto('/ordenes');
      const centro = observador.getByRole('button', { name: /Notificaciones/u });
      await expect(centro).toBeVisible();
      await centro.click();
      const dialogo = observador.getByRole('dialog', { name: 'Centro de notificaciones' });
      await expect(dialogo).toContainText(marcador);
      await expect.poll(async () => {
        const resultado = await admin
          .from('notificaciones_usuario')
          .select('id, leida')
          .eq('usuario_id', destinatarioId)
          .ilike('mensaje', `%${marcador}%`)
          .maybeSingle();
        return resultado.data?.leida ?? null;
      }).toBe(false);
      await dialogo.getByRole('button', { name: new RegExp(marcador) }).click();
      await expect(observador).toHaveURL(new RegExp(`/ordenes\\?ordenId=${ordenId}`));
      await expect.poll(async () => {
        const resultado = await admin
          .from('notificaciones_usuario')
          .select('leida')
          .eq('usuario_id', destinatarioId)
          .ilike('mensaje', `%${marcador}%`)
          .maybeSingle();
        return resultado.data?.leida ?? null;
      }).toBe(true);
    } finally {
      if (observador) await observador.close();
      await admin.from('notificaciones_usuario').delete().eq('usuario_id', destinatarioId).ilike('mensaje', `%${marcador}%`);
      await admin.from('comentarios_registro').delete().ilike('contenido', `%${marcador}%`);
    }
  });
});
