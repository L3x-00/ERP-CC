import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

type Contexto = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  usuarioId: string;
  clienteId: string;
  ordenId: string;
  arId: string;
  folioOrden: string;
};

async function prepararContexto(): Promise<Contexto> {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-b8-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Aa9`;
  const alta = await admin.auth.admin.createUser({
    email: correo, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Admin B8 ${sufijo}` },
  });
  if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario');
  const usuarioId = alta.data.user.id;
  await admin.from('usuarios').update({ rol: 'admin', activo: true, nombre_completo: `Admin B8 ${sufijo}` }).eq('id', usuarioId);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `B8 ${sufijo}`, razon_social: `B8 ${sufijo} SA de CV`,
    estado: 'activo', condiciones_pago: 'contado',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`Sin cliente: ${errorCliente?.message}`);

  const folioOrden = `OP-${String(Date.now()).slice(-6)}`;
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio: folioOrden, folio_sii: 'O-9999_95', cliente_id: cliente.id,
    estado: 'completada', fecha_compromiso: '2099-12-30T10:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`Sin orden: ${errorOrden?.message}`);

  const { data: ar, error: errorAr } = await admin.from('cuentas_por_cobrar').insert({
    orden_id: orden.id, cliente_id: cliente.id, monto_total: 100, saldo_pendiente: 100,
    moneda: 'MXN', estado: 'pendiente', cobrable_desde: new Date().toISOString(),
    fecha_vencimiento: '2099-12-30T10:00:00.000Z', monto_subtotal: 86.21, monto_iva: 13.79,
  }).select('id').single();
  if (errorAr || !ar) throw new Error(`Sin AR: ${errorAr?.message}`);

  return { admin, correo, contrasena, usuarioId, clienteId: cliente.id, ordenId: orden.id, arId: ar.id, folioOrden };
}

async function limpiarContexto(contexto: Contexto): Promise<void> {
  const { admin } = contexto;
  await admin.from('reversos_pago_ar').delete().in('pago_ar_id', (
    await admin.from('pagos_ar').select('id').eq('ar_id', contexto.arId)
  ).data?.map((fila) => fila.id) ?? []);
  await admin.from('pagos_ar').delete().eq('ar_id', contexto.arId);
  await admin.from('movimientos_saldo_favor').delete().eq('cliente_id', contexto.clienteId);
  await admin.from('cuentas_por_cobrar').delete().eq('id', contexto.arId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
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

test.describe('Cobranza SII-B8 F1: folio de recibo RP-O-MMYY_XX-YY', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales del stack local.',
  );

  test('la orden con folio_sii usa RP espejo del NE y conserva el consecutivo', async ({ page }) => {
    const contexto = await prepararContexto();
    const { admin } = contexto;
    try {
      await iniciarSesion(page, contexto);
      await page.goto('/cobranza');
      await expect(page.getByTestId('operacion-cobranza')).toBeVisible();

      const fila = page.getByRole('row', { name: new RegExp(contexto.folioOrden) });
      await page.getByPlaceholder('Cliente, OP, INVCNC o factura').fill(contexto.folioOrden);
      await expect(fila).toBeVisible();
      await fila.getByRole('button', { name: 'Cobrar' }).click();
      await page.getByLabel('Monto').fill('40');
      await page.getByRole('button', { name: 'Registrar pago' }).click();
      await expect(page.getByTestId('recibo-persistido')).toContainText('RP-O-9999_95-01');

      await fila.getByRole('button', { name: 'Cobrar' }).click();
      await page.getByLabel('Monto').fill('60');
      await page.getByRole('button', { name: 'Registrar pago' }).click();
      await expect(page.getByTestId('recibo-persistido')).toContainText('RP-O-9999_95-02');

      const { data: pagos } = await admin.from('pagos_ar')
        .select('folio_recibo').eq('ar_id', contexto.arId).order('creado_en');
      expect(pagos?.map((pago) => pago.folio_recibo)).toEqual(['RP-O-9999_95-01', 'RP-O-9999_95-02']);

      mkdirSync('.ai-shared/qa/sii-b8-f1/visual', { recursive: true });
      for (const oscuro of [false, true]) {
        await page.locator('html').evaluate(
          (elemento, activar) => elemento.classList.toggle('dark', activar), oscuro,
        );
        await page.screenshot({
          path: `.ai-shared/qa/sii-b8-f1/visual/recibo-rp-escritorio-${oscuro ? 'oscuro' : 'claro'}.png`,
          fullPage: true, animations: 'disabled',
        });
      }
      await page.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));
    } finally {
      await limpiarContexto(contexto);
    }
  });
});
