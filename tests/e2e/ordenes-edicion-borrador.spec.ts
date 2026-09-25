import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database, Json } from '@/compartido/tipos/supabase';

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
  return url && clave ? createClient<Database>(url, clave, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

test.describe('Edición de órdenes en borrador (ORD-05)', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
      'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales de configuración.',
    );
  });

  test('edita prioridad, fecha y partidas en borrador y bloquea fuera de él', async ({ page }) => {
    const acceso = credenciales('ADMIN');
    test.skip(!acceso, 'Faltan E2E_CONFIGURACION_ADMIN_EMAIL/PASSWORD.');
    if (!acceso) return;
    const admin = clienteAdmin();
    test.skip(!admin, 'Faltan NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.');
    if (!admin) return;

    const sufijo = randomUUID().slice(0, 8);
    const { data: cliente, error: errorCliente } = await admin
      .from('clientes')
      .insert({
        nombre_comercial: `Cliente E2E edición ${sufijo}`,
        razon_social: `Cliente E2E edición ${sufijo} SA de CV`,
        estado: 'activo',
      })
      .select('id')
      .single();
    if (errorCliente || !cliente) {
      throw new Error(`No se pudo crear el cliente E2E: ${errorCliente?.message ?? 'sin fila'}`);
    }

    const { data: creada, error: errorCrear } = await admin.rpc('crear_orden_manual', {
      p_cliente_id: cliente.id,
      p_fecha_compromiso: '2026-11-10T12:00:00.000Z',
      p_prioridad: 'normal',
      p_partidas: [
        {
          codigo_pieza: `E2E-${sufijo}`,
          descripcion: null,
          cantidad_solicitada: 2,
          unidad_medida: 'pza',
          material_id: null,
          tiempo_estimado_minutos: 10,
          maquina_asignada: 'CNC-E2E',
        },
      ] as unknown as Json,
    });
    if (errorCrear || !creada?.[0]) {
      throw new Error(`No se pudo crear la OP E2E: ${errorCrear?.message ?? 'sin folio'}`);
    }
    const ordenId = creada[0].id;
    const folio = creada[0].folio;

    try {
      await iniciarSesion(page, acceso);
      await page.goto('/ordenes');

      const fila = page.getByRole('row', { name: new RegExp(folio) });
      await expect(fila).toBeVisible();
      await fila.getByTestId(`editar-orden-${folio}`).click();

      const dialogo = page.getByRole('dialog', { name: new RegExp(`Editar orden ${folio}`) });
      await expect(dialogo).toBeVisible();
      await dialogo.getByLabel('Prioridad').selectOption('alta');
      await dialogo.getByLabel('Fecha de compromiso').fill('2026-11-20');
      await dialogo.getByTestId('partida-cantidad-0').fill('5');
      await dialogo.getByTestId('orden-guardar-edicion').click();

      await expect(dialogo).toBeHidden();
      const filaActualizada = page.getByRole('row', { name: new RegExp(folio) });
      await expect(filaActualizada).toContainText('Alta');
      await expect(filaActualizada).toContainText('0/5');

      const { data: ordenGuardada } = await admin
        .from('ordenes_produccion')
        .select('prioridad, actualizado_en')
        .eq('id', ordenId)
        .single();
      expect(ordenGuardada?.prioridad).toBe('alta');
      expect(new Date(ordenGuardada?.actualizado_en ?? 0).getTime()).toBeGreaterThan(0);

      const { data: partidas } = await admin
        .from('partidas_orden_produccion')
        .select('cantidad_solicitada')
        .eq('orden_id', ordenId);
      expect(Number(partidas?.[0]?.cantidad_solicitada)).toBe(5);

      await filaActualizada.getByTestId(`configurar-procesos-${folio}`).click();
      const ruta = page.getByRole('dialog', { name: new RegExp(`Procesos de ${folio}`) });
      await expect(ruta).toBeVisible();
      await ruta.getByRole('button', { name: 'Agregar proceso' }).click();
      await ruta.getByLabel('Nombre').nth(0).fill('Corte');
      await ruta.getByLabel('Meta de piezas').nth(0).fill('7');
      await ruta.getByLabel('Nombre').nth(1).fill('Pulido');
      await expect(ruta.getByLabel('Meta de piezas').nth(1)).toHaveValue('5');
      if (process.env.E2E_CAPTURAR_VISUAL === 'si') {
        await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-ord07-escritorio.png' });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        await page.waitForTimeout(200);
        await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-ord07-movil-oscuro.png' });
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.evaluate(() => document.documentElement.classList.remove('dark'));
      }
      await ruta.getByRole('button', { name: 'Guardar procesos' }).click();
      await expect(ruta).toBeHidden();

      const { data: partidaConfigurada } = await admin.from('partidas_orden_produccion')
        .select('id, procesos').eq('orden_id', ordenId).single();
      const { data: metas } = await admin.from('metas_proceso_partida')
        .select('secuencia, nombre, meta_piezas')
        .eq('partida_id', partidaConfigurada?.id ?? '').order('secuencia');
      expect(partidaConfigurada?.procesos).toEqual(['Corte', 'Pulido']);
      expect(metas?.map((meta) => [meta.secuencia, meta.nombre, Number(meta.meta_piezas)]))
        .toEqual([[1, 'Corte', 7], [2, 'Pulido', 5]]);

      await filaActualizada.getByTestId('cambiar-estado-programada').click();
      const filaProgramada = page.getByRole('row', { name: new RegExp(folio) });
      await expect(filaProgramada).toContainText('Programada');
      await expect(filaProgramada.getByTestId(`editar-orden-${folio}`)).toHaveCount(0);
      await expect(filaProgramada.getByTestId(`configurar-procesos-${folio}`)).toHaveCount(0);
    } finally {
      await admin.from('ordenes_produccion').delete().eq('id', ordenId);
      await admin.from('clientes').delete().eq('id', cliente.id);
    }
  });
});
