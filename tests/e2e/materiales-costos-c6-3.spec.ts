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

test.describe('Materiales y costos — grupos, existencias y costos (obs. 8)', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
      'Requiere Supabase local y fixture E2E.',
    );
  });

  test('crea grupo y material con costo inicial, ajusta existencia y oculta el inventario legado', async ({
    page,
  }) => {
    const acceso = credencialesAdmin();
    const admin = clienteAdmin();
    test.skip(!acceso, 'Faltan credenciales del admin E2E.');
    test.skip(!admin, 'Falta el cliente local service_role.');
    if (!acceso || !admin) return;

    const sufijo = randomUUID().slice(0, 8).toUpperCase();
    const codigoLegado = `LEG-C63-${sufijo}`;
    const codigoGrupo = `OBS8-GRP-${sufijo}`;
    const codigoMaterial = `OBS8-MAT-${sufijo}`;
    const erroresConsola: string[] = [];
    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error') erroresConsola.push(mensaje.text());
    });
    let materialLegadoId: string | null = null;
    let grupoId: string | null = null;
    let materialId: string | null = null;

    try {
      // El inventario legado sigue existiendo en base (no se destruye historia),
      // pero el módulo no debe mostrarlo en ninguna vista.
      const materialLegado = await admin
        .from('materiales')
        .insert({
          codigo: codigoLegado,
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
      if (materialLegado.error) throw materialLegado.error;
      materialLegadoId = materialLegado.data.id;
      const movimiento = await admin.from('movimientos_inventario').insert({
        folio: `LEG-C63-${sufijo}`,
        material_id: materialLegadoId,
        tipo_movimiento: 'entrada_compra',
        cantidad_compra: 7,
        cantidad_control: 7,
        costo_unitario_momento: 25,
        referencia_externa: 'E2E-OBS8',
        notas: 'Registro histórico de prueba',
      });
      if (movimiento.error) throw movimiento.error;

      await iniciarSesion(page, acceso);
      await page.getByRole('link', { name: 'Materiales y costos' }).click();
      await expect(page).toHaveURL(/\/inventario$/);
      await expect(
        page.getByRole('main').getByRole('heading', { name: 'Materiales y costos' }),
      ).toBeVisible();

      // Obs. 8: el módulo administra materiales y existencias manuales; la
      // historia legada sigue sin exponerse.
      await expect(page.getByTestId('panel-costos-materiales')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Materiales', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Existencias', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Historial de costos' })).toBeVisible();
      await expect(page.getByRole('button', { name: /kardex/i })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /^(Entrada|Salida|Reordenar)$/ }),
      ).toHaveCount(0);
      await expect(page.getByText(codigoLegado)).toHaveCount(0);
      await expect(page.getByText(`Existencia histórica ${sufijo}`)).toHaveCount(0);

      // --- Grupo (material padre) y material hijo con espesor y costo inicial ---
      await page.getByRole('button', { name: 'Nuevo material' }).click();
      const modal = page.getByTestId('modal-guardar-material');
      await expect(modal).toBeVisible();
      await modal.getByLabel('Código').fill(codigoGrupo);
      await modal.getByLabel('Nombre').fill(`Acero al carbón ${sufijo}`);
      await modal.getByLabel('Unidad base').fill('kg');
      await modal.getByRole('button', { name: 'Crear material' }).click();
      await expect(modal).toBeHidden();
      const grupo = await admin
        .from('catalogo_materiales')
        .select('id, padre_id')
        .eq('codigo', codigoGrupo)
        .single();
      expect(grupo.error).toBeNull();
      expect(grupo.data?.padre_id).toBeNull();
      grupoId = grupo.data!.id;

      await page.getByRole('button', { name: 'Nuevo material' }).click();
      await expect(modal).toBeVisible();
      await modal.getByLabel('Código').fill(codigoMaterial);
      await modal.getByLabel('Nombre').fill(`Acero 1018 ${sufijo}`);
      await modal.getByLabel('Unidad base').fill('kg');
      await modal.getByLabel('Grupo (opcional)').selectOption({ label: `Acero al carbón ${sufijo}` });
      await modal.getByLabel('Ancho (mm)').fill('1219.2');
      await modal.getByLabel('Largo (mm)').fill('2438.4');
      await modal.getByRole('button', { name: 'Agregar espesor' }).click();
      await modal.getByLabel('Etiqueta').fill('5 mm');
      await modal.getByLabel('mm').fill('5');
      await modal.getByLabel('Costo').fill('12.5');
      await modal.getByRole('button', { name: 'Crear material' }).click();
      await expect(modal).toBeHidden();

      const creado = await admin
        .from('catalogo_materiales')
        .select('id, padre_id, unidad_base, ancho_mm, largo_mm, costo_vigente, costo_confirmado_por')
        .eq('codigo', codigoMaterial)
        .single();
      expect(creado.error).toBeNull();
      expect(creado.data).toMatchObject({
        padre_id: grupoId,
        unidad_base: 'kg',
        ancho_mm: 1219.2,
        largo_mm: 2438.4,
        costo_vigente: 12.5,
      });
      expect(creado.data?.costo_confirmado_por).toBeTruthy();
      materialId = creado.data!.id;

      const filaMaterial = page.getByTestId(`fila-material-${codigoMaterial}`);
      await expect(filaMaterial).toContainText('1,219.2 × 2,438.4 mm');
      await filaMaterial.getByRole('button', { name: `Editar Acero 1018 ${sufijo}` }).click();
      await expect(modal.getByLabel('Ancho (mm)')).toHaveValue('1219.2');
      await expect(modal.getByLabel('Largo (mm)')).toHaveValue('2438.4');
      await modal.getByLabel('Ancho (mm)').fill('1250');
      await modal.getByLabel('Largo (mm)').fill('');
      await modal.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(modal).toBeHidden();
      const editado = await admin.from('catalogo_materiales')
        .select('ancho_mm, largo_mm').eq('id', materialId).single();
      expect(editado.error).toBeNull();
      expect(editado.data).toMatchObject({ ancho_mm: 1250, largo_mm: null });
      await expect(filaMaterial).toContainText('Ancho 1,250 mm');

      const espesor = await admin
        .from('catalogo_espesores')
        .select('id, etiqueta, espesor_mm')
        .eq('material_id', materialId)
        .single();
      expect(espesor.error).toBeNull();
      expect(espesor.data).toMatchObject({ etiqueta: '5 mm', espesor_mm: 5 });

      const historialCosto = await admin
        .from('historial_costos_material')
        .select('costo_nuevo, fuente')
        .eq('material_id', materialId)
        .eq('fuente', 'MANUAL');
      expect(historialCosto.data?.length ?? 0).toBeGreaterThanOrEqual(1);

      // La jerarquía se ve en la tabla (subítem indentado con su grupo).
      await expect(page.getByTestId(`fila-material-${codigoMaterial}`)).toContainText(
        'Grupo:',
      );

      // --- Existencias: saldo manual con historial ---
      await page.getByRole('button', { name: 'Existencias', exact: true }).click();
      await expect(page.getByTestId('panel-existencias')).toBeVisible();
      await page.getByRole('button', { name: 'Ajustar existencia' }).click();
      const modalSaldo = page.getByTestId('modal-ajustar-saldo');
      await expect(modalSaldo).toBeVisible();
      await modalSaldo
        .locator('#ajuste-material')
        .selectOption({ label: `${codigoMaterial} · Acero 1018 ${sufijo}` });
      await modalSaldo.locator('#ajuste-espesor').selectOption({ label: '5 mm' });
      await modalSaldo.locator('#ajuste-saldo').fill('120.5');
      await modalSaldo.locator('#ajuste-motivo').fill('Conteo físico inicial');
      await modalSaldo.getByRole('button', { name: 'Ajustar saldo' }).click();
      await expect(modalSaldo).toBeHidden();

      const saldo = await admin
        .from('saldos_material')
        .select('id, saldo, espesor_id')
        .eq('material_id', materialId)
        .single();
      expect(saldo.error).toBeNull();
      expect(saldo.data?.saldo).toBe(120.5);
      expect(saldo.data?.espesor_id).toBeTruthy();
      const ajuste = await admin
        .from('movimientos_saldo_material')
        .select('saldo_anterior, saldo_nuevo, motivo')
        .eq('material_id', materialId)
        .single();
      expect(ajuste.error).toBeNull();
      expect(ajuste.data).toMatchObject({
        saldo_anterior: 0,
        saldo_nuevo: 120.5,
        motivo: 'Conteo físico inicial',
      });
      const logAjuste = await admin
        .from('logs')
        .select('accion')
        .eq('accion', 'ajustar_saldo_material')
        .eq('recurso_id', materialId)
        .maybeSingle();
      expect(logAjuste.data?.accion).toBe('ajustar_saldo_material');
      await expect(page.getByTestId('panel-existencias')).toContainText('Conteo físico inicial');

      // --- Capturas 1440/768 × claro/oscuro ---
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
            path: `.ai-shared/qa/c6-3/visual/materiales-existencias-${nombre}-${tema}.png`,
            fullPage: true,
            animations: 'disabled',
          });
        }
      }
      await page.getByRole('button', { name: 'Materiales', exact: true }).click();
      for (const [nombre, ancho, alto] of [
        ['escritorio', 1440, 900],
        ['movil', 320, 1200],
      ] as const) {
        await page.setViewportSize({ width: ancho, height: alto });
        for (const tema of ['claro', 'oscuro'] as const) {
          await page
            .locator('html')
            .evaluate((elemento, oscuro) => elemento.classList.toggle('dark', oscuro), tema === 'oscuro');
          await page.screenshot({
            path: `.ai-shared/qa/c6-3/visual/materiales-grupos-${nombre}-${tema}.png`,
            fullPage: true,
            animations: 'disabled',
          });
        }
      }
      expect(erroresConsola).toEqual([]);
    } finally {
      if (materialId) {
        const { data: espesores } = await admin
          .from('catalogo_espesores')
          .select('id')
          .eq('material_id', materialId);
        const idsEspesores = (espesores ?? []).map((fila) => fila.id);
        if (idsEspesores.length > 0) {
          await admin
            .from('versiones_catalogo')
            .delete()
            .eq('entidad', 'catalogo_espesores')
            .in('entidad_id', idsEspesores);
        }
        await admin.from('saldos_material').delete().eq('material_id', materialId);
        await admin
          .from('versiones_catalogo')
          .delete()
          .eq('entidad', 'catalogo_materiales')
          .eq('entidad_id', materialId);
        await admin.from('catalogo_espesores').update({ activo: false }).eq('material_id', materialId);
        await admin.from('catalogo_materiales').update({ activo: false }).eq('id', materialId);
      }
      if (grupoId) {
        await admin
          .from('versiones_catalogo')
          .delete()
          .eq('entidad', 'catalogo_materiales')
          .eq('entidad_id', grupoId);
        await admin.from('catalogo_materiales').update({ activo: false }).eq('id', grupoId);
      }
      if (materialLegadoId) {
        await admin.from('movimientos_inventario').delete().eq('material_id', materialLegadoId);
        await admin.from('materiales').delete().eq('id', materialLegadoId);
      }
    }
  });
});
