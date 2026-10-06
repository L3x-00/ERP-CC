import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

function periodoVigente(): string {
  const ahora = new Date();
  return `${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getFullYear()).slice(2)}`;
}

// B3.5: continuidad administrativa del folio RFQ periódico (periodo vigente).
test('B3.5: el admin ajusta el RFQ vigente, ve el siguiente y no puede retroceder', async ({ page }) => {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const periodo = periodoVigente();

  const contadorOriginal = await admin
    .from('contadores_folio_periodico')
    .select('ultimo')
    .eq('tipo', 'RFQ')
    .eq('periodo', periodo)
    .maybeSingle();
  if (contadorOriginal.error) throw contadorOriginal.error;
  const emitidos = await admin
    .from('pipeline')
    .select('folio_rfq')
    .like('folio_rfq', `RFQ-${periodo}_%`);
  if (emitidos.error) throw emitidos.error;
  const emitidoMax = Math.max(
    0,
    ...emitidos.data.map((fila) => Number(fila.folio_rfq?.split('_')[1] ?? 0)),
  );
  const base = Math.max(contadorOriginal.data?.ultimo ?? 0, emitidoMax);
  test.skip(base >= 99, 'Periodo local agotado; el fixture se preserva sin cambios');
  const objetivo = base + 1;
  const siguienteInicial = `RFQ-${periodo}_${String(objetivo).padStart(2, '0')}`;

  const correo = `b35-folios-${randomUUID()}@orca.local`;
  const contrasena = `B35!${randomUUID()}Aa`;
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

    const panel = page.getByTestId('continuidad-folios-periodico');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('continuidad-periodico-tipo')).toHaveValue('RFQ');
    await expect(panel.getByTestId('continuidad-periodico-periodo')).toHaveText(periodo);
    await expect(panel.getByTestId('continuidad-periodico-siguiente')).toHaveText(siguienteInicial);

    await panel.getByTestId('continuidad-periodico-ultimo').fill(String(objetivo));
    await panel.getByTestId('continuidad-periodico-guardar').click();
    await expect(panel.getByTestId('continuidad-periodico-confirmacion'))
      .toContainText(`Continuidad guardada en ${objetivo}`);
    await expect.poll(async () => {
      const { data } = await admin
        .from('contadores_folio_periodico')
        .select('ultimo')
        .eq('tipo', 'RFQ')
        .eq('periodo', periodo)
        .maybeSingle();
      return data?.ultimo ?? 0;
    }).toBe(objetivo);

    if (objetivo < 99) {
      await expect(panel.getByTestId('continuidad-periodico-siguiente'))
        .toHaveText(`RFQ-${periodo}_${String(objetivo + 1).padStart(2, '0')}`);
    } else {
      await expect(panel.getByTestId('continuidad-periodico-siguiente')).toHaveText('Periodo agotado');
    }

    // Intento de retroceso: el mínimo vigente ya es el valor ajustado.
    await panel.getByTestId('continuidad-periodico-ultimo').fill(String(objetivo - 1));
    await panel.getByTestId('continuidad-periodico-guardar').click();
    await expect(panel.getByTestId('continuidad-periodico-error')).toContainText(/entre|no puede/);
    const sinCambio = await admin
      .from('contadores_folio_periodico')
      .select('ultimo')
      .eq('tipo', 'RFQ')
      .eq('periodo', periodo)
      .single();
    expect(sinCambio.data?.ultimo).toBe(objetivo);

    mkdirSync('.ai-shared/qa/sii-b3-folios/visual', { recursive: true });
    for (const [nombre, ancho, alto] of [
      ['escritorio', 1440, 900],
      ['tableta', 768, 1024],
    ] as const) {
      await page.setViewportSize({ width: ancho, height: alto });
      for (const tema of ['claro', 'oscuro'] as const) {
        await page.locator('html').evaluate(
          (elemento, oscuro) => elemento.classList.toggle('dark', oscuro),
          tema === 'oscuro',
        );
        await page.screenshot({
          path: `.ai-shared/qa/sii-b3-folios/visual/continuidad-folios-rfq-${nombre}-${tema}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));
  } finally {
    if (contadorOriginal.data) {
      await admin
        .from('contadores_folio_periodico')
        .update({ ultimo: contadorOriginal.data.ultimo })
        .eq('tipo', 'RFQ')
        .eq('periodo', periodo);
    } else {
      await admin
        .from('contadores_folio_periodico')
        .delete()
        .eq('tipo', 'RFQ')
        .eq('periodo', periodo);
    }
    await admin.from('logs').delete().eq('usuario_id', actorId);
    await admin.auth.admin.deleteUser(actorId);
  }
});
