import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

function requerir(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} para las pruebas E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  const url = requerir('NEXT_PUBLIC_SUPABASE_URL');
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('La E2E de Cobranza exige loopback explícito.');
  }
  return createClient<Database>(url, requerir('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe.serial('movimientos, anulación y consolidación (AR-08/09/16, CFG-12)', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase local.',
  );

  test('cierra el ciclo de cobranza con reverso, anticipo heredado, anulación y consolidación', async ({ page }) => {
    const admin = crearAdmin();
    const sufijo = randomUUID().slice(0, 6);
    const correo = `e2e-ar1612-${sufijo}@orca.local`;
    const contrasena = `E2e!${randomUUID()}Aa9`;
    const alta = await admin.auth.admin.createUser({
      email: correo, password: contrasena, email_confirm: true,
      user_metadata: { nombre_completo: `Admin AR ${sufijo}` },
    });
    if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario');
    const usuarioId = alta.data.user.id;
    await admin.from('usuarios').update({ rol: 'admin', activo: true }).eq('id', usuarioId);
    const { data: cliente } = await admin.from('clientes').insert({
      nombre_comercial: `E2E AR ${sufijo}`, razon_social: `E2E AR ${sufijo} SA`, estado: 'activo',
    }).select('id').single();
    const clienteId = cliente!.id;

    // CFG-12: orden comercial elegible con líneas RFQ.
    const { data: pipeline } = await admin.from('pipeline').insert({
      folio_op: `RFQ-${sufijo.toUpperCase()}`, etapa: 'negociacion', nombre_contacto: 'Contacto',
      empresa: `Empresa ${sufijo}`, vendedor_id: usuarioId, moneda: 'MXN', iva_porcentaje: 16,
    }).select('id').single();
    await admin.from('cotizacion_lineas').insert({
      pipeline_id: pipeline!.id, descripcion: 'Pieza', cantidad: 10, procesos: [],
      precio_unitario: 100, orden: 1, es_externo: false, es_descuento: false,
    });
    const { data: folioComercial } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    const { data: ordenComercial } = await admin.from('ordenes_produccion').insert({
      folio: folioComercial!, cliente_id: clienteId, cotizacion_id: pipeline!.id,
      estado: 'programada', fecha_compromiso: '2099-12-31T00:00:00Z',
    }).select('id').single();

    // AR con pago vigente para reverso y anulación.
    const { data: folioPago } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    const { data: ordenPago } = await admin.from('ordenes_produccion').insert({
      folio: folioPago!, cliente_id: clienteId, estado: 'en_proceso',
      fecha_compromiso: '2099-12-31T00:00:00Z',
    }).select('id').single();
    const { data: cuentaPago } = await admin.from('cuentas_por_cobrar').insert({
      orden_id: ordenPago!.id, cliente_id: clienteId, monto_total: 1160, monto_subtotal: 1000,
      monto_iva: 160, saldo_pendiente: 1160, moneda: 'MXN', tipo_cambio_origen: 1, estado: 'pendiente',
    }).select('id, referencia_interna').single();
    const pago = await admin.rpc('registrar_pago_ar_atomico', {
      p_ar_id: cuentaPago!.id, p_monto_pagado: 200, p_moneda_pago: 'MXN', p_tipo_cambio_pago: 1,
      p_metodo_pago: 'transferencia', p_referencia: 'E2E-AR', p_usuario_id: usuarioId,
      p_solicitud_id: randomUUID(),
    });
    const folioRecibo = pago.data![0]!.folio_recibo;

    try {
      await page.goto('/iniciar-sesion');
      await page.getByLabel('Correo electrónico').fill(correo);
      await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasena);
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
      await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
      await page.goto('/cobranza');

      // CFG-12: vista previa, confirmación y repetición idempotente.
      await page.getByTestId('abrir-consolidacion').click();
      await expect(page.getByTestId('consolidacion-conteo')).toContainText('elegible');
      await page.getByTestId(`consolidar-${folioComercial}`).check();
      await page.getByTestId('confirmar-consolidacion').click();
      await expect(page.getByTestId('consolidacion-resultado')).toContainText('1 cuenta(s) creada(s)');
      await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).first().click();

      // Reverso: cancelar no escribe y confirmar deja evidencia.
      const filaPago = page.getByRole('row', { name: new RegExp(cuentaPago!.referencia_interna) });
      await filaPago.getByRole('button', { name: 'Historial' }).click();
      await page.getByTestId(`reversar-pago-${folioRecibo}`).click();
      await page.getByRole('button', { name: 'Cancelar', exact: true }).last().click();
      const { data: reversosAntes } = await admin.from('reversos_pago_ar').select('id').eq('ar_id', cuentaPago!.id);
      expect(reversosAntes ?? []).toHaveLength(0);
      await page.getByTestId(`reversar-pago-${folioRecibo}`).click();
      await page.getByTestId('motivo-reverso').fill('importe mal capturado');
      await page.getByTestId('confirmar-reversar-pago').click();
      await expect(page.getByRole('status')).toContainText('reversado');
      await expect(page.getByText('Reversado', { exact: true })).toBeVisible();

      // AR-16: cancelar no escribe; confirmar anula conservando el pago y el reverso.
      await page.getByTestId('anular-cuenta').click();
      await page.getByRole('button', { name: 'Cancelar', exact: true }).last().click();
      const { data: sinAnular } = await admin.from('cuentas_por_cobrar').select('estado').eq('id', cuentaPago!.id).single();
      expect(sinAnular?.estado).toBe('pendiente');
      await page.getByTestId('anular-cuenta').click();
      await page.getByTestId('motivo-anulacion').fill('duplicado administrativo');
      await page.getByTestId('confirmar-anular-cuenta').click();
      await expect(page.getByTestId('cuenta-anulada')).toContainText('duplicado administrativo');
      const { data: anulada } = await admin.from('cuentas_por_cobrar')
        .select('estado, motivo_anulacion').eq('id', cuentaPago!.id).single();
      expect(anulada?.estado).toBe('cancelado');
      const { data: pagos } = await admin.from('pagos_ar').select('id').eq('ar_id', cuentaPago!.id);
      expect(pagos ?? []).toHaveLength(1);
      const { data: reversos } = await admin.from('reversos_pago_ar').select('id').eq('ar_id', cuentaPago!.id);
      expect(reversos ?? []).toHaveLength(1);
      await page.keyboard.press('Escape');

      // AR-09: la cuenta consolidada admite su anticipo heredado una sola vez.
      const { data: cuentaConsolidada } = await admin.from('cuentas_por_cobrar')
        .select('id, referencia_interna').eq('orden_id', ordenComercial!.id).single();
      await page.getByRole('row', { name: new RegExp(cuentaConsolidada!.referencia_interna) })
        .getByRole('button', { name: 'Historial' }).click();
      await page.getByTestId('registrar-abono-heredado').click();
      await page.getByTestId('monto-abono-heredado').fill('300');
      await page.getByTestId('confirmar-abono-heredado').click();
      await expect(page.getByTestId('abono-heredado-ficha')).toContainText('$300.00');
      const { data: heredado } = await admin.from('cuentas_por_cobrar')
        .select('abono_heredado, saldo_pendiente').eq('id', cuentaConsolidada!.id).single();
      expect(Number(heredado?.abono_heredado)).toBe(300);
      expect(Number(heredado?.saldo_pendiente)).toBe(860);
    } finally {
      for (const ordenId of [ordenComercial!.id, ordenPago!.id]) {
        const { data: cuentas } = await admin.from('cuentas_por_cobrar').select('id').eq('orden_id', ordenId);
        const ids = (cuentas ?? []).map((fila) => fila.id);
        if (ids.length > 0) {
          await admin.from('reversos_pago_ar').delete().in('ar_id', ids);
          await admin.from('pagos_ar').delete().in('ar_id', ids);
        }
        await admin.from('cuentas_por_cobrar').delete().eq('orden_id', ordenId);
        await admin.from('ordenes_produccion').delete().eq('id', ordenId);
      }
      await admin.from('movimientos_saldo_favor').delete().eq('cliente_id', clienteId);
      await admin.from('clientes').delete().eq('id', clienteId);
      await admin.from('cotizacion_lineas').delete().eq('pipeline_id', pipeline!.id);
      await admin.from('pipeline').delete().eq('id', pipeline!.id);
      await admin.from('logs').delete().eq('usuario_id', usuarioId);
      await admin.from('usuarios').delete().eq('id', usuarioId);
      await admin.auth.admin.deleteUser(usuarioId);
    }
  });
});
