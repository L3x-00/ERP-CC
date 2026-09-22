import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

function cargarEntornoLocal(): void {
  if (!existsSync('.env.local')) return;
  for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    process.env[coincidencia[1]] = coincidencia[2].replace(/^['"]|['"]$/g, '');
  }
}

cargarEntornoLocal();

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} para las pruebas E2E.`);
  return valor;
}

/** PNG 1x1 válido: el proveedor es un stub, solo importa el MIME real. */
const PNG_MINIMO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  usuarioId: string;
};

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-ocr-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Oo9`;
  const { data, error } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: `Admin OCR ${sufijo}` },
  });
  if (error || !data.user) {
    throw new Error(`No se creó el administrador E2E: ${error?.message ?? 'sin usuario'}`);
  }
  const { error: errorPerfil } = await admin
    .from('usuarios')
    .update({ rol: 'admin', activo: true, nombre_completo: `Admin OCR ${sufijo}` })
    .eq('id', data.user.id);
  if (errorPerfil) throw new Error(`No se preparó el perfil E2E: ${errorPerfil.message}`);
  return { admin, correo, contrasena, usuarioId: data.user.id };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  await admin.from('gastos').delete().eq('creado_por', contexto.usuarioId);
  await admin.from('logs').delete().eq('usuario_id', contexto.usuarioId);
  await admin.from('usuarios').delete().eq('id', contexto.usuarioId);
  await admin.auth.admin.deleteUser(contexto.usuarioId);
}

test.describe.serial('OCR de comprobantes con proveedor controlado (GAS-08)', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para usar el stack local.',
  );

  let contexto: ContextoE2E | null = null;

  test.beforeAll(async () => {
    contexto = await prepararContexto();
  });

  test.afterAll(async () => {
    if (contexto) await limpiarContexto(contexto);
  });

  test('extrae los datos del stub, precarga el formulario y persiste el gasto', async ({ page }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;

    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(datos.correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(datos.contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');

    await page.goto('/gastos');
    await expect(page.getByTestId('pagina-gastos')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar gasto' }).click();
    await page.getByLabel('Comprobante para OCR').setInputFiles({
      name: 'ticket-e2e.png',
      mimeType: 'image/png',
      buffer: PNG_MINIMO,
    });
    await page.getByRole('button', { name: 'Escanear comprobante con IA' }).click();

    await expect(
      page.getByText('Datos extraídos; revisa los campos antes de guardar.'),
    ).toBeVisible();
    await expect(page.getByLabel('Descripción')).toHaveValue('Comprobante de Ferretería E2E');
    await expect(page.getByLabel('Folio de comprobante')).toHaveValue('E2E-1234');
    await expect(page.getByRole('spinbutton', { name: 'Subtotal' })).toHaveValue('1000');
    await expect(page.getByRole('spinbutton', { name: 'IVA' })).toHaveValue('160');
    await expect(page.getByRole('spinbutton', { name: 'Total', exact: true })).toHaveValue('1160');
    await expect(page.getByLabel('Fecha de gasto')).toHaveValue('2026-09-15');

    await page.getByRole('button', { name: 'Guardar gasto' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // El gasto queda persistido con la evidencia OCR cruda (GAS-08).
    await expect
      .poll(async () => {
        const { data } = await datos.admin
          .from('gastos')
          .select('id, folio_comprobante, monto_total, datos_ocr_json')
          .eq('creado_por', datos.usuarioId)
          .maybeSingle();
        return data ? `${data.folio_comprobante}:${Number(data.monto_total)}` : null;
      })
      .toBe('E2E-1234:1160');

    const { data: gasto } = await datos.admin
      .from('gastos')
      .select('datos_ocr_json')
      .eq('creado_por', datos.usuarioId)
      .maybeSingle();
    expect(gasto?.datos_ocr_json).not.toBeNull();
  });
});
