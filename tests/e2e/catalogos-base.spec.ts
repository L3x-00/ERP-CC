import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

type Credenciales = { correo: string; contrasena: string };

function credenciales(nombre: string): Credenciales | null {
  const correo = process.env[`E2E_CONFIGURACION_${nombre}_EMAIL`];
  const contrasena = process.env[`E2E_CONFIGURACION_${nombre}_PASSWORD`];
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
  return url && clave
    ? createClient<Database>(url, clave, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
}

test.describe('Catálogos base configurables (SII-B1.3–B1.8)', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
      'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales de configuración.',
    );
  });

  test('el admin crea material + espesor, edita un proceso y revisa el historial', async ({ page }) => {
    const acceso = credenciales('ADMIN');
    test.skip(!acceso, 'Faltan E2E_CONFIGURACION_ADMIN_EMAIL/PASSWORD.');
    if (!acceso) return;
    const admin = clienteAdmin();
    test.skip(!admin, 'Faltan NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.');
    if (!admin) return;

    const sufijo = randomUUID().slice(0, 6).toUpperCase();
    const codigoMaterial = `E2E_MAT_${sufijo}`;
    const codigoCanal = 'E2E_CANAL_QA';
    let materialId: string | null = null;
    let canalId: string | null = null;
    let canalPreexistente = false;
    let procesoId: string | null = null;
    let procesoOriginal: boolean | null = null;

    const canalExistente = await admin
      .from('catalogo_canales')
      .select('id')
      .eq('codigo', codigoCanal)
      .maybeSingle();
    if (canalExistente.error) throw canalExistente.error;
    if (canalExistente.data) {
      canalId = canalExistente.data.id;
      canalPreexistente = true;
      const reactivar = await admin
        .from('catalogo_canales')
        .update({ nombre: 'Canal E2E QA', activo: true, orden: 90 })
        .eq('id', canalId);
      if (reactivar.error) throw reactivar.error;
    }

    try {
      await iniciarSesion(page, acceso);
      await page.goto('/configuracion');
      await expect(page.getByTestId('pagina-configuracion')).toBeVisible();
      await page.getByRole('tab', { name: 'Catálogos base' }).click();
      await expect(page.getByTestId('pagina-catalogos-base')).toBeVisible();

      // --- Material nuevo ---
      await page.getByTestId('catalogo-material-nuevo').click();
      await page.getByTestId('catalogo-material-codigo').fill(codigoMaterial);
      await page.getByTestId('catalogo-material-nombre').fill(`Material E2E ${sufijo}`);
      await page.getByTestId('catalogo-material-guardar').click();
      await expect(page.getByTestId('catalogos-confirmacion')).toContainText('Material guardado');
      await expect(page.getByTestId(`fila-material-${codigoMaterial}`)).toBeVisible();

      const materialCreado = await admin
        .from('catalogo_materiales')
        .select('id, activo')
        .eq('codigo', codigoMaterial)
        .single();
      if (materialCreado.error) throw materialCreado.error;
      const materialIdCreado = materialCreado.data.id;
      materialId = materialIdCreado;
      expect(materialCreado.data.activo).toBe(true);

      // --- Espesor dependiente del material ---
      await page.getByTestId('catalogo-espesor-material').selectOption(materialIdCreado);
      await page.getByTestId('catalogo-espesor-nuevo').click();
      await page.getByTestId('catalogo-espesor-etiqueta').fill('5 mm');
      await page.getByTestId('catalogo-espesor-mm').fill('5');
      await page.getByTestId('catalogo-espesor-guardar').click();
      await expect(page.getByTestId('catalogos-confirmacion')).toContainText('Espesor guardado');
      await expect
        .poll(async () => {
          const { data } = await admin
            .from('catalogo_espesores')
            .select('id')
            .eq('material_id', materialIdCreado)
            .eq('etiqueta', '5 mm');
          return data?.length ?? 0;
        })
        .toBe(1);
      await expect(page.getByTestId('lista-espesores')).toContainText('5 mm');

      // --- Proceso: alternar requiere_archivo_tecnico ---
      const proceso = await admin
        .from('catalogo_procesos')
        .select('id, requiere_archivo_tecnico')
        .eq('codigo', 'ACABADO')
        .single();
      if (proceso.error) throw proceso.error;
      procesoId = proceso.data.id;
      procesoOriginal = proceso.data.requiere_archivo_tecnico;

      await page.getByTestId('editar-proceso-ACABADO').click();
      const casillaArchivo = page.getByTestId('catalogo-proceso-archivo-tecnico');
      if (procesoOriginal) {
        await casillaArchivo.uncheck();
      } else {
        await casillaArchivo.check();
      }
      await page.getByTestId('catalogo-proceso-guardar').click();
      await expect(page.getByTestId('catalogos-confirmacion')).toContainText('Proceso guardado');
      await expect
        .poll(async () => {
          const { data } = await admin
            .from('catalogo_procesos')
            .select('requiere_archivo_tecnico')
            .eq('id', procesoId!)
            .single();
          return data?.requiere_archivo_tecnico;
        })
        .toBe(!procesoOriginal);

      // --- Historial de versiones del proceso editado ---
      await page.getByTestId('historial-proceso-ACABADO').click();
      await expect(page.getByTestId('catalogos-historial')).toBeVisible();
      await expect(page.getByTestId('catalogos-historial-lista')).toContainText('Versión 2');
      await expect(page.getByTestId('catalogos-historial-lista')).toContainText('requiere_archivo_tecnico');
      await page.getByTestId('catalogos-historial-cerrar').click();

      // --- Canal RFQ configurable ---
      if (!canalPreexistente) {
        await page.getByTestId('catalogo-canal-nuevo').click();
        await page.getByTestId('catalogo-canal-codigo').fill(codigoCanal);
        await page.getByTestId('catalogo-canal-nombre').fill('Canal E2E QA');
        await page.getByTestId('catalogo-canal-orden').fill('90');
        await page.getByTestId('catalogo-canal-guardar').click();
        await expect(page.getByTestId('catalogos-confirmacion')).toContainText('Canal guardado');
      }
      await expect(page.getByTestId(`fila-canal-${codigoCanal}`)).toBeVisible();
      const canalCreado = await admin
        .from('catalogo_canales')
        .select('id, codigo, activo')
        .eq('codigo', codigoCanal)
        .single();
      if (canalCreado.error) throw canalCreado.error;
      canalId = canalCreado.data.id;
      expect(canalCreado.data.activo).toBe(true);

      await page.getByTestId(`editar-canal-${codigoCanal}`).click();
      await expect(page.getByTestId('catalogo-canal-codigo')).toBeDisabled();
      await page.getByTestId('catalogo-canal-nombre').fill('Canal actualizado E2E');
      await page.getByTestId('catalogo-canal-guardar').click();
      await expect(page.getByTestId('catalogos-confirmacion')).toContainText('Canal guardado');

      // --- Capturas 1440/768 × claro/oscuro ---
      mkdirSync('.ai-shared/qa/sii-b1-e2/visual', { recursive: true });
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
            path: `.ai-shared/qa/sii-b1-e2/visual/catalogos-base-${nombre}-${tema}.png`,
            fullPage: true,
            animations: 'disabled',
          });
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));

      // --- Canales RFQ: escritorio/móvil × claro/oscuro ---
      for (const [nombre, ancho, alto] of [
        ['escritorio', 1440, 900],
        ['movil', 320, 1800],
      ] as const) {
        await page.setViewportSize({ width: ancho, height: alto });
        for (const tema of ['claro', 'oscuro'] as const) {
          await page
            .locator('html')
            .evaluate((elemento, oscuro) => elemento.classList.toggle('dark', oscuro), tema === 'oscuro');
          const seccionCanales = page.getByRole('region', { name: 'Canales RFQ' });
          await seccionCanales.scrollIntoViewIfNeeded();
          if (ancho === 320) {
            const sinDesborde = await seccionCanales.evaluate(
              (seccion) => seccion.scrollWidth <= seccion.clientWidth + 1,
            );
            expect(sinDesborde).toBe(true);
            const anchoDocumento = await page.evaluate(() => document.documentElement.scrollWidth);
            expect(anchoDocumento).toBeLessThanOrEqual(320);
          }
          await seccionCanales.screenshot({
            path: `.ai-shared/qa/sii-b1-e2/visual/catalogos-canales-${nombre}-${tema}.png`,
            animations: 'disabled',
          });
        }
      }
    } finally {
      // Los catálogos no se borran (trigger `catalogo_sin_borrado`): la limpieza del
      // fixture es desactivar, y las versiones del fixture se retiran para no acumular.
      if (procesoId && procesoOriginal !== null) {
        await admin.from('catalogo_procesos').update({ requiere_archivo_tecnico: procesoOriginal }).eq('id', procesoId);
      }
      if (materialId) {
        const { data: espesores } = await admin
          .from('catalogo_espesores')
          .select('id')
          .eq('material_id', materialId);
        const idsEspesores = (espesores ?? []).map((fila) => fila.id);
        if (idsEspesores.length > 0) {
          await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_espesores').in('entidad_id', idsEspesores);
        }
        await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_materiales').eq('entidad_id', materialId);
        await admin.from('catalogo_espesores').update({ activo: false }).eq('material_id', materialId);
        await admin.from('catalogo_materiales').update({ activo: false }).eq('id', materialId);
      }
      if (canalId) {
        await admin.from('catalogo_canales').update({ activo: false }).eq('id', canalId);
        await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_canales').eq('entidad_id', canalId);
      }
    }
  });
});
