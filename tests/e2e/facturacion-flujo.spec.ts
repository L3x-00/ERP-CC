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
  entregaId: string;
  arId: string;
  folioOrden: string;
};

async function prepararContexto(): Promise<Contexto> {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-b8f2-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Aa9`;
  const alta = await admin.auth.admin.createUser({
    email: correo, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Admin B8F2 ${sufijo}` },
  });
  if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario');
  const usuarioId = alta.data.user.id;
  await admin.from('usuarios').update({ rol: 'admin', activo: true, nombre_completo: `Admin B8F2 ${sufijo}` }).eq('id', usuarioId);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `B8F2 ${sufijo}`, razon_social: `B8F2 ${sufijo} SA de CV`,
    estado: 'activo', condiciones_pago: '15_dias',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`Sin cliente: ${errorCliente?.message}`);

  const folioOrden = `OP-${String(Date.now()).slice(-6)}`;
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio: folioOrden, folio_sii: 'O-9999_94', cliente_id: cliente.id,
    estado: 'completada', fecha_compromiso: '2099-12-30T10:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`Sin orden: ${errorOrden?.message}`);

  const { data: entrega, error: errorEntrega } = await admin.from('notas_entrega').insert({
    folio: `NE-${String(Date.now()).slice(-6)}`, orden_id: orden.id,
    recibido_por: 'Recepción F2', creado_por: usuarioId,
  }).select('id').single();
  if (errorEntrega || !entrega) throw new Error(`Sin entrega: ${errorEntrega?.message}`);

  const { data: ar, error: errorAr } = await admin.from('cuentas_por_cobrar').insert({
    orden_id: orden.id, cliente_id: cliente.id, monto_total: 116, saldo_pendiente: 116,
    moneda: 'MXN', estado: 'pendiente', cobrable_desde: new Date().toISOString(),
    fecha_vencimiento: '2099-12-30T10:00:00.000Z', monto_subtotal: 100, monto_iva: 16,
  }).select('id').single();
  if (errorAr || !ar) throw new Error(`Sin AR: ${errorAr?.message}`);

  return {
    admin, correo, contrasena, usuarioId, clienteId: cliente.id, ordenId: orden.id,
    entregaId: entrega.id, arId: ar.id, folioOrden,
  };
}

async function limpiarContexto(contexto: Contexto): Promise<void> {
  const { admin } = contexto;
  await admin.from('facturas').delete().eq('orden_id', contexto.ordenId);
  await admin.from('cuentas_por_cobrar').delete().eq('id', contexto.arId);
  await admin.from('notas_entrega').delete().eq('id', contexto.entregaId);
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

test.describe('Facturación SII-B8 F2: borrador, emisión vinculada a CxC y re-factura', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales del stack local.',
  );

  test('borrador desde entrega → emitir con folio → cancelar desvincula → re-facturar', async ({ page }) => {
    const contexto = await prepararContexto();
    const { admin } = contexto;
    try {
      await iniciarSesion(page, contexto);
      await page.goto('/facturacion');
      await expect(page.getByTestId('cola-facturas')).toBeVisible();

      // 1. Borrador con montos precargados desde la AR.
      await page.getByTestId('nueva-factura').click();
      await expect(page.getByTestId('panel-factura')).toBeVisible();
      await page.getByTestId('select-entrega-factura').selectOption(contexto.entregaId);
      await expect(page.getByTestId('crear-subtotal')).toHaveValue('100');
      await expect(page.getByTestId('crear-total')).toHaveValue('116');
      await page.getByTestId('confirmar-crear-factura').click();
      await expect(page.getByTestId('factura-mensaje')).toBeVisible();
      await expect.poll(async () => {
        const { data } = await admin.from('facturas')
          .select('id, estado, total').eq('orden_id', contexto.ordenId).single();
        return data ? `${data.estado}:${Number(data.total)}` : null;
      }).toBe('BORRADOR:116');
      const { data: borrador } = await admin.from('facturas')
        .select('id').eq('orden_id', contexto.ordenId).single();
      await page.getByTestId('cerrar-panel-factura').click();

      // 2. Emisión con folio fiscal capturado: vincula la AR.
      await expect(page.getByTestId(`estado-factura-${borrador!.id}`)).toContainText('Borrador');
      await page.getByTestId(`emitir-factura-${borrador!.id}`).click();
      await page.getByTestId('factura-folio-fiscal').fill('FAC-E2E-F2-0001');
      await page.getByTestId('factura-rfc-receptor').fill('XAXX010101000');
      await page.getByTestId('confirmar-emitir-factura').click();
      await expect(page.getByTestId('factura-mensaje')).toBeVisible();
      await expect.poll(async () => {
        const { data } = await admin.from('notas_entrega').select('id')
          .eq('orden_id', contexto.ordenId).maybeSingle();
        return data?.id ?? null;
      }).toBe(contexto.entregaId);
      const { data: facturaEmitida } = await admin.from('facturas')
        .select('estado, folio_fiscal, emitida_en').eq('id', borrador!.id).single();
      expect(facturaEmitida).toMatchObject({ estado: 'EMITIDA', folio_fiscal: 'FAC-E2E-F2-0001' });
      expect(facturaEmitida?.emitida_en).not.toBeNull();
      const { data: arVinculada } = await admin.from('cuentas_por_cobrar')
        .select('factura_id, folio_factura_remision, fecha_vencimiento').eq('id', contexto.arId).single();
      expect(arVinculada?.factura_id).toBe(borrador!.id);
      expect(arVinculada?.folio_factura_remision).toBe('FAC-E2E-F2-0001');
      expect(arVinculada?.fecha_vencimiento).not.toBeNull();
      await page.getByTestId('cerrar-panel-factura').click();
      await expect(page.getByTestId(`folio-fiscal-${borrador!.id}`)).toContainText('FAC-E2E-F2-0001');

      // 3. Cancelar con motivo: desvincula la AR y conserva el vencimiento.
      await page.getByTestId(`cancelar-factura-${borrador!.id}`).click();
      await page.getByTestId('factura-motivo').fill('Error de captura del PAC');
      await page.getByTestId('confirmar-cancelar-factura').click();
      await expect(page.getByTestId('factura-mensaje')).toBeVisible();
      await expect.poll(async () => {
        const { data } = await admin.from('cuentas_por_cobrar')
          .select('factura_id, folio_factura_remision, fecha_vencimiento').eq('id', contexto.arId).single();
        return data ? `factura:${data.factura_id ?? 'null'}|folio:${data.folio_factura_remision ?? 'null'}|venc:${data.fecha_vencimiento === null ? 'null' : 'set'}` : null;
      }).toBe('factura:null|folio:null|venc:set');
      const { data: cancelada } = await admin.from('facturas')
        .select('estado, motivo_cancelacion').eq('id', borrador!.id).single();
      expect(cancelada).toMatchObject({ estado: 'CANCELADA', motivo_cancelacion: 'Error de captura del PAC' });
      await page.getByTestId('cerrar-panel-factura').click();

      // 4. Re-facturar: la entrega vuelve a estar disponible.
      await page.getByTestId('nueva-factura').click();
      await page.getByTestId('select-entrega-factura').selectOption(contexto.entregaId);
      await expect(page.getByTestId('crear-total')).toHaveValue('116');
      await page.getByTestId('confirmar-crear-factura').click();
      await expect(page.getByTestId('factura-mensaje')).toBeVisible();
      await expect.poll(async () => {
        const { data } = await admin.from('facturas')
          .select('id, estado').eq('orden_id', contexto.ordenId).neq('estado', 'CANCELADA');
        return data?.length ?? 0;
      }).toBe(1);
      const { data: refacturada } = await admin.from('facturas')
        .select('id').eq('orden_id', contexto.ordenId).neq('estado', 'CANCELADA').single();
      expect(refacturada?.id).not.toBe(borrador!.id);

      // Capturas de la cola con emitida + cancelada + borrador nuevo.
      mkdirSync('.ai-shared/qa/sii-b8-f2/visual', { recursive: true });
      await page.getByTestId('cerrar-panel-factura').click();
      await page.getByTestId('actualizar-facturas').click();
      for (const [nombre, ancho, alto] of [
        ['escritorio', 1440, 900],
        ['tableta', 768, 1024],
      ] as const) {
        await page.setViewportSize({ width: ancho, height: alto });
        for (const tema of ['claro', 'oscuro'] as const) {
          await page.locator('html').evaluate(
            (elemento, oscuro) => elemento.classList.toggle('dark', oscuro), tema === 'oscuro',
          );
          await page.screenshot({
            path: `.ai-shared/qa/sii-b8-f2/visual/facturacion-${nombre}-${tema}.png`,
            fullPage: true, animations: 'disabled',
          });
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));
    } finally {
      await limpiarContexto(contexto);
    }
  });
});
