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

test.describe('Órdenes inmutables en la cola (CLI-12)', () => {
  test.beforeEach(() => {
    test.skip(
      process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
      'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales de configuración.',
    );
  });

  test('retira Editar y Procesos incluso en borrador y conserva acciones de consulta', async ({ page }) => {
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
      await expect(fila.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
      await expect(fila.getByRole('button', { name: 'Procesos', exact: true })).toHaveCount(0);
      await expect(fila.getByRole('button', { name: /Seleccionar|Quitar selección/u })).toHaveCount(0);
      await expect(fila.getByRole('button', { name: 'Comentarios', exact: true })).toBeVisible();
      await expect(fila.getByRole('link', { name: 'Abrir', exact: true })).toBeVisible();

      const { data: ordenGuardada } = await admin
        .from('ordenes_produccion')
        .select('prioridad')
        .eq('id', ordenId)
        .single();
      expect(ordenGuardada?.prioridad).toBe('normal');

      const { data: partidas } = await admin
        .from('partidas_orden_produccion')
        .select('cantidad_solicitada, procesos')
        .eq('orden_id', ordenId);
      expect(Number(partidas?.[0]?.cantidad_solicitada)).toBe(2);
      expect(partidas?.[0]?.procesos).toEqual([]);
    } finally {
      await admin.from('ordenes_produccion').delete().eq('id', ordenId);
      await admin.from('clientes').delete().eq('id', cliente.id);
    }
  });
});
