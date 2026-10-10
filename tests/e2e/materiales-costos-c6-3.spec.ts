import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

type Credenciales = { correo: string; contrasena: string };

function credencialesAdmin(): Credenciales | null {
  const correo = process.env.E2E_CONFIGURACION_ADMIN_EMAIL;
  const contrasena = process.env.E2E_CONFIGURACION_ADMIN_PASSWORD;
  return correo && contrasena ? { correo, contrasena } : null;
}

function clienteAdmin(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && clave
    ? createClient<Database>(url, clave, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;
}

async function iniciarSesion(page: Page, acceso: Credenciales): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(acceso.correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(acceso.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard');
}

test.describe('Materiales y costos — lógica ligera sin inventario formal (obs. cliente)', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
      'Requiere Supabase local y fixture E2E.',
    );
  });

  test('muestra solo catálogo, costos e historial; nunca existencias ni kardex', async ({ page }) => {
    const acceso = credencialesAdmin();
    const admin = clienteAdmin();
    test.skip(!acceso, 'Faltan credenciales del admin E2E.');
    test.skip(!admin, 'Falta el cliente local service_role.');
    if (!acceso || !admin) return;

    const sufijo = randomUUID().slice(0, 8).toUpperCase();
    const codigo = `LEG-C63-${sufijo}`;
    const folio = `LEG-C63-${sufijo}`;
    let materialId: string | null = null;
    const erroresConsola: string[] = [];
    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error') erroresConsola.push(mensaje.text());
    });

    try {
      // El inventario legado sigue existiendo en base (no se destruye historia),
      // pero el módulo no debe mostrarlo en ninguna vista.
      const material = await admin
        .from('materiales')
        .insert({
          codigo,
          nombre: `Existencia histórica ${sufijo}`,
          categoria: 'materia_prima',
          unidad_compra: 'hoja',
          unidad_control: 'm2',
          factor_conversion: 1,
          costo_unitario_compra: 25,
          costo_unitario_control: 25,
          stock_actual_control: 7,
          stock_reservado_control: 0,
          stock_minimo_control: 10,
          factor_merma_porcentaje: 8,
        })
        .select('id')
        .single();
      if (material.error) throw material.error;
      materialId = material.data.id;

      const movimiento = await admin.from('movimientos_inventario').insert({
        folio,
        material_id: materialId,
        tipo_movimiento: 'entrada_compra',
        cantidad_compra: 7,
        cantidad_control: 7,
        costo_unitario_momento: 25,
        referencia_externa: 'E2E-C6.3',
        notas: 'Registro histórico de prueba',
      });
      if (movimiento.error) throw movimiento.error;

      await iniciarSesion(page, acceso);
      await page.getByRole('link', { name: 'Materiales y costos' }).click();
      await expect(page).toHaveURL(/\/inventario$/);
      await expect(
        page.getByRole('main').getByRole('heading', { name: 'Materiales y costos' }),
      ).toBeVisible();

      // Lógica ligera: catálogo de costos con historial; sin vistas de stock.
      await expect(page.getByTestId('panel-costos-materiales')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Materiales', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Historial de costos' })).toBeVisible();
      await expect(page.getByRole('button', { name: /existencias/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /kardex/i })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /^(Entrada|Salida|Nuevo material|Reordenar)$/ }),
      ).toHaveCount(0);
      // El material del inventario legado no aparece en el módulo.
      await expect(page.getByText(codigo)).toHaveCount(0);
      await expect(page.getByText(`Existencia histórica ${sufijo}`)).toHaveCount(0);
      await expect(page.getByText('Histórico · Solo lectura')).toHaveCount(0);

      mkdirSync('.ai-shared/qa/c6-3/visual', { recursive: true });
      for (const [nombre, ancho, alto] of [
        ['movil', 320, 1000],
        ['tableta', 768, 1024],
        ['portatil', 1024, 900],
        ['escritorio', 1440, 900],
      ] as const) {
        await page.setViewportSize({ width: ancho, height: alto });
        for (const tema of ['claro', 'oscuro'] as const) {
          await page
            .locator('html')
            .evaluate((elemento, oscuro) => elemento.classList.toggle('dark', oscuro), tema === 'oscuro');
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ancho);
          await page.screenshot({
            path: `.ai-shared/qa/c6-3/visual/materiales-costos-${nombre}-${tema}.png`,
            fullPage: true,
            animations: 'disabled',
          });
        }
      }
      expect(erroresConsola).toEqual([]);
    } finally {
      if (materialId) {
        await admin.from('movimientos_inventario').delete().eq('material_id', materialId);
        await admin.from('materiales').delete().eq('id', materialId);
      }
    }
  });
});
