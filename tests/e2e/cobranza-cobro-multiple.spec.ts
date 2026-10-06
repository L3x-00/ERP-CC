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
  ordenIds: string[];
  arIds: string[];
  referencias: string[];
  pagoIds: string[];
};

async function prepararContexto(): Promise<Contexto> {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-b8f3-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Aa9`;
  const alta = await admin.auth.admin.createUser({
    email: correo, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Admin B8F3 ${sufijo}` },
  });
  if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario');
  const usuarioId = alta.data.user.id;
  await admin.from('usuarios').update({ rol: 'admin', activo: true, nombre_completo: `Admin B8F3 ${sufijo}` }).eq('id', usuarioId);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `B8F3 ${sufijo}`, razon_social: `B8F3 ${sufijo} SA de CV`,
    estado: 'activo', condiciones_pago: 'contado',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`Sin cliente: ${errorCliente?.message}`);

  const ordenIds: string[] = [];
  const arIds: string[] = [];
  const referencias: string[] = [];
  for (let indice = 0; indice < 2; indice += 1) {
    const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
      folio: `OP-${String(Date.now()).slice(-5)}${indice}`,
      folio_sii: `O-9999_7${indice}`,
      cliente_id: cliente.id, estado: 'completada', fecha_compromiso: '2099-12-30T10:00:00.000Z',
    }).select('id').single();
    if (errorOrden || !orden) throw new Error(`Sin orden: ${errorOrden?.message}`);
    ordenIds.push(orden.id);

    const { data: ar, error: errorAr } = await admin.from('cuentas_por_cobrar').insert({
      orden_id: orden.id, cliente_id: cliente.id, monto_total: 100, saldo_pendiente: 100,
      moneda: 'MXN', estado: 'pendiente', cobrable_desde: new Date().toISOString(),
      fecha_vencimiento: '2099-12-30T10:00:00.000Z', monto_subtotal: 100, monto_iva: 0,
    }).select('id, referencia_interna').single();
    if (errorAr || !ar) throw new Error(`Sin AR: ${errorAr?.message}`);
    arIds.push(ar.id);
    referencias.push(ar.referencia_interna);
  }

  return { admin, correo, contrasena, usuarioId, clienteId: cliente.id, ordenIds, arIds, referencias, pagoIds: [] };
}

async function limpiarContexto(contexto: Contexto): Promise<void> {
  const { admin } = contexto;
  await admin.from('notificaciones_usuario').delete().eq('usuario_id', contexto.usuarioId);
  await admin.from('promesas_pago').delete().in('cuenta_id', contexto.arIds);
  if (contexto.pagoIds.length > 0) {
    await admin.from('aplicaciones_pago').delete().in('pago_id', contexto.pagoIds);
    await admin.from('reversos_pago_ar').delete().in('pago_id', contexto.pagoIds);
    await admin.from('movimientos_saldo_favor').delete().in('pago_ar_id', contexto.pagoIds);
    await admin.from('pagos_ar').delete().in('id', contexto.pagoIds);
  }
  await admin.from('cuentas_por_cobrar').delete().in('id', contexto.arIds);
  await admin.from('ordenes_produccion').delete().in('id', contexto.ordenIds);
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

test.describe('Cobranza SII-B8 F3: cobro repartido y promesas con recordatorios', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales del stack local.',
  );

  test('cobro múltiple RP-..._0000-01 + promesa con aviso y cancelación', async ({ page }) => {
    const contexto = await prepararContexto();
    const { admin } = contexto;
    try {
      await iniciarSesion(page, contexto);
      await page.goto('/cobranza');
      await expect(page.getByTestId('operacion-cobranza')).toBeVisible();

      // 1. Cobro repartido: 120 pagados = 60 + 40 aplicados + 20 al monedero.
      await page.getByTestId('abrir-cobro-multiple').click();
      await expect(page.getByTestId('modal-cobro-multiple')).toBeVisible();
      await page.getByTestId('cobro-cliente').selectOption(contexto.clienteId);
      await expect(page.getByTestId(`cobro-cuenta-${contexto.arIds[0]}`)).toBeChecked();
      await page.getByTestId(`cobro-cuenta-monto-${contexto.arIds[0]}`).fill('60');
      await page.getByTestId(`cobro-cuenta-monto-${contexto.arIds[1]}`).fill('40');
      await page.getByTestId('cobro-monto-pagado').fill('120');
      await page.getByTestId('confirmar-cobro-multiple').click();
      await expect(page.getByTestId('cobro-multiple-mensaje')).toContainText('RP-');
      await expect.poll(async () => {
        const { data } = await admin.from('pagos_ar')
          .select('folio_recibo, ar_id').is('ar_id', null)
          .order('creado_en', { ascending: false }).limit(1).maybeSingle();
        return data?.folio_recibo ?? null;
      }).toMatch(/^RP-\d{4}_0000-01$/);
      const { data: pagoMultiple } = await admin.from('pagos_ar')
        .select('id, folio_recibo').is('ar_id', null)
        .order('creado_en', { ascending: false }).limit(1).single();
      expect(pagoMultiple?.folio_recibo).toMatch(/^RP-\d{4}_0000-01$/);
      contexto.pagoIds.push(pagoMultiple!.id);
      const { data: aplicaciones } = await admin.from('aplicaciones_pago')
        .select('cuenta_id, monto').eq('pago_id', pagoMultiple!.id);
      expect(aplicaciones).toHaveLength(2);
      const { data: saldos } = await admin.from('cuentas_por_cobrar')
        .select('id, saldo_pendiente, estado').in('id', contexto.arIds)
        .order('id', { ascending: true });
      expect(saldos?.map((cuenta) => Number(cuenta.saldo_pendiente)).sort()).toEqual([40, 60]);
      const { data: clienteCredito } = await admin.from('clientes')
        .select('saldo_a_favor').eq('id', contexto.clienteId).single();
      expect(Number(clienteCredito?.saldo_a_favor)).toBe(20);
      await page.getByTestId('cerrar-cobro-multiple').click();

      // 2. Promesa de pago con recordatorio interno.
      await page.getByPlaceholder('Cliente, OP, INVCNC o factura').fill(contexto.referencias[0]);
      await page.getByTestId(`promesa-${contexto.referencias[0]}`).click();
      await expect(page.getByTestId('modal-promesa-pago')).toBeVisible();
      const manana = new Date();
      manana.setDate(manana.getDate() + 1);
      await page.getByTestId('promesa-fecha').fill(manana.toISOString().slice(0, 10));
      await page.getByTestId('promesa-monto').fill('40');
      await page.getByTestId('confirmar-crear-promesa').click();
      await expect(page.getByTestId('promesa-mensaje')).toContainText('Promesa registrada');
      const { data: promesa } = await admin.from('promesas_pago')
        .select('id, estado').eq('cuenta_id', contexto.arIds[0]).single();
      expect(promesa?.estado).toBe('VIGENTE');

      // Al recargar cartera se materializa el aviso (2 días antes).
      await page.getByTestId('cerrar-promesa').click();
      await page.goto('/cobranza');
      await expect.poll(async () => {
        const { data } = await admin.from('notificaciones_usuario')
          .select('id').eq('usuario_id', contexto.usuarioId)
          .eq('tipo', 'alerta_sistema')
          .like('mensaje', `%${contexto.arIds[0]}%`);
        return data?.length ?? 0;
      }).toBe(1);

      // 3. Cancelación de la promesa con motivo.
      await page.getByPlaceholder('Cliente, OP, INVCNC o factura').fill(contexto.referencias[0]);
      await page.getByTestId(`promesa-${contexto.referencias[0]}`).click();
      await page.getByTestId('promesa-motivo').fill('Cliente reprogramó su pago');
      await page.getByTestId('confirmar-cancelar-promesa').click();
      await expect(page.getByTestId('promesa-mensaje')).toContainText('cancelada');
      await expect.poll(async () => {
        const { data } = await admin.from('promesas_pago').select('estado').eq('id', promesa!.id).single();
        return data?.estado ?? null;
      }).toBe('CANCELADA');

      // Capturas de los modales F3.
      mkdirSync('.ai-shared/qa/sii-b8-f3/visual', { recursive: true });
      for (const oscuro of [false, true]) {
        await page.locator('html').evaluate(
          (elemento, activar) => elemento.classList.toggle('dark', activar), oscuro,
        );
        await page.screenshot({
          path: `.ai-shared/qa/sii-b8-f3/visual/promesa-escritorio-${oscuro ? 'oscuro' : 'claro'}.png`,
          fullPage: true, animations: 'disabled',
        });
      }
      await page.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));
    } finally {
      await limpiarContexto(contexto);
    }
  });
});
