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

test.describe('ficha integral de la cuenta (AR-01)', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase local.',
  );

  test('muestra referencia, desglose, condición, emisión, pagos y saldo reconciliado', async ({ page }) => {
    const admin = crearAdmin();
    const sufijo = randomUUID().slice(0, 8);
    const correo = `e2e-ar01-${sufijo}@orca.local`;
    const contrasena = `E2e!${randomUUID()}Aa9`;
    const alta = await admin.auth.admin.createUser({
      email: correo, password: contrasena, email_confirm: true,
      user_metadata: { nombre_completo: `Admin AR01 ${sufijo}` },
    });
    if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario');
    const usuarioId = alta.data.user.id;
    await admin.from('usuarios').update({ rol: 'admin', activo: true }).eq('id', usuarioId);

    const { data: cliente } = await admin.from('clientes').insert({
      nombre_comercial: `AR01 ${sufijo}`, razon_social: `AR01 ${sufijo} SA`,
      estado: 'activo', condiciones_pago: '15_dias',
    }).select('id').single();
    const { data: folio } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    const { data: orden } = await admin.from('ordenes_produccion').insert({
      folio: folio!, cliente_id: cliente!.id, estado: 'en_proceso',
      fecha_compromiso: '2099-12-31T18:00:00.000Z',
    }).select('id').single();
    const { data: cuenta } = await admin.from('cuentas_por_cobrar').insert({
      orden_id: orden!.id, cliente_id: cliente!.id, monto_total: 1160,
      monto_subtotal: 1000, monto_iva: 160, saldo_pendiente: 1160,
      moneda: 'MXN', tipo_cambio_origen: 1, estado: 'pendiente',
    }).select('id, referencia_interna').single();
    const pago = await admin.rpc('registrar_pago_ar_atomico', {
      p_ar_id: cuenta!.id, p_monto_pagado: 580, p_moneda_pago: 'MXN',
      p_tipo_cambio_pago: 1, p_metodo_pago: 'transferencia',
      p_referencia: 'ANTICIPO-AR01', p_usuario_id: usuarioId,
      p_solicitud_id: randomUUID(),
    });
    if (pago.error) throw new Error(`No se pudo registrar el anticipo: ${pago.error.message}`);

    try {
      await page.goto('/iniciar-sesion');
      await page.getByLabel('Correo electrónico').fill(correo);
      await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasena);
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
      await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
      await page.goto('/cobranza');

      const fila = page.getByRole('row', { name: new RegExp(cuenta!.referencia_interna) });
      await expect(fila).toBeVisible();
      await fila.getByRole('button', { name: 'Historial' }).click();

      const ficha = page.getByTestId('ficha-cuenta');
      await expect(ficha).toContainText(cuenta!.referencia_interna);
      await expect(ficha).toContainText('15 días');
      await expect(ficha).toContainText('$1,000.00');
      await expect(ficha).toContainText('$160.00');
      await expect(ficha).toContainText('$1,160.00');
      await expect(ficha).toContainText('$580.00');
      await expect(ficha).toContainText('No cobrable (admite anticipos)');
      await expect(ficha).toContainText('Por entregar');
      await expect(page.getByRole('dialog')).toContainText('REC-');
    } finally {
      await admin.from('pagos_ar').delete().eq('ar_id', cuenta!.id);
      await admin.from('cuentas_por_cobrar').delete().eq('id', cuenta!.id);
      await admin.from('ordenes_produccion').delete().eq('id', orden!.id);
      await admin.from('clientes').delete().eq('id', cliente!.id);
      await admin.from('logs').delete().eq('usuario_id', usuarioId);
      await admin.from('usuarios').delete().eq('id', usuarioId);
      await admin.auth.admin.deleteUser(usuarioId);
    }
  });
});
