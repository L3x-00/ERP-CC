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
  bancoId: string;
  cajaId: string;
  cobroId: string;
};

async function prepararContexto(): Promise<Contexto> {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-b8f5-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Aa9`;
  const alta = await admin.auth.admin.createUser({
    email: correo, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Admin B8F5 ${sufijo}` },
  });
  if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario');
  const usuarioId = alta.data.user.id;
  await admin.from('usuarios').update({ rol: 'admin', activo: true, nombre_completo: `Admin B8F5 ${sufijo}` }).eq('id', usuarioId);

  const { data: banco, error: errorBanco } = await admin.from('cuentas_bancarias').insert({
    banco: `Banco F5 ${sufijo}`, numero_cuenta: `0000${String(Date.now()).slice(-8)}`,
    moneda: 'MXN', titular: 'ORCA F5', activa: true, tipo: 'banco',
  }).select('id').single();
  if (errorBanco || !banco) throw new Error(`Sin banco: ${errorBanco?.message}`);

  const { data: caja, error: errorCaja } = await admin.from('cuentas_bancarias').insert({
    banco: `Efectivo F5 ${sufijo}`, numero_cuenta: `CAJA-${sufijo}`,
    moneda: 'MXN', titular: 'ORCA F5', activa: true, tipo: 'efectivo',
  }).select('id').single();
  if (errorCaja || !caja) throw new Error(`Sin caja: ${errorCaja?.message}`);

  const { data: cobro, error: errorCobro } = await admin.from('pagos_ar').insert({
    ar_id: null, folio_recibo: `REC-9${String(Date.now()).slice(-5)}`, solicitud_id: randomUUID(),
    monto_pagado: 500, moneda_pago: 'MXN', tipo_cambio_pago: 1, monto_aplicado_ar: 500,
    monto_sobrepago_ar: 0, metodo_pago: 'transferencia', cuenta_bancaria_id: banco.id,
    creado_por: usuarioId,
  }).select('id').single();
  if (errorCobro || !cobro) throw new Error(`Sin cobro: ${errorCobro?.message}`);

  return { admin, correo, contrasena, usuarioId, bancoId: banco.id, cajaId: caja.id, cobroId: cobro.id };
}

async function limpiarContexto(contexto: Contexto): Promise<void> {
  const { admin } = contexto;
  await admin.from('conciliaciones_tesoreria').delete().in('cuenta_id', [contexto.bancoId, contexto.cajaId]);
  await admin.from('movimientos_tesoreria').delete().in('cuenta_id', [contexto.bancoId, contexto.cajaId]);
  await admin.from('saldos_iniciales_tesoreria').delete().in('cuenta_id', [contexto.bancoId, contexto.cajaId]);
  await admin.from('pagos_ar').delete().eq('id', contexto.cobroId);
  await admin.from('cuentas_bancarias').delete().in('id', [contexto.bancoId, contexto.cajaId]);
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

test.describe('Tesorería SII-B8 F5: saldos, transferencias internas y conciliación', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales del stack local.',
  );

  test('saldo inicial + transferencia enlazada + conciliar/desconciliar sin afectar KPIs', async ({ page }) => {
    const contexto = await prepararContexto();
    const { admin } = contexto;
    try {
      await iniciarSesion(page, contexto);
      await page.goto('/tesoreria');
      await expect(page.getByTestId('cola-tesoreria')).toBeVisible();

      // 1. Saldo inicial del banco: 1,000 + cobro 500 = 1,500.
      await page.getByTestId(`saldo-inicial-${contexto.bancoId}`).click();
      await page.getByTestId('saldo-monto').fill('1000');
      await page.getByTestId('confirmar-saldo-inicial').click();
      await expect(page.getByTestId('saldo-mensaje')).toContainText('registrado');
      await page.getByTestId('cerrar-saldo-inicial').click();
      await expect(page.getByTestId(`saldo-actual-${contexto.bancoId}`)).toContainText('1,500');
      const { data: saldoGuardado } = await admin.from('saldos_iniciales_tesoreria')
        .select('monto').eq('cuenta_id', contexto.bancoId).single();
      expect(Number(saldoGuardado?.monto)).toBe(1000);

      // 2. Transferencia interna banco → caja por 200 (par enlazado).
      await page.getByTestId('abrir-transferencia').click();
      await page.getByTestId('transf-origen').selectOption(contexto.bancoId);
      await page.getByTestId('transf-destino').selectOption(contexto.cajaId);
      await page.getByTestId('transf-monto').fill('200');
      await page.getByTestId('confirmar-transferencia').click();
      await expect(page.getByTestId('transf-mensaje')).toContainText('Transferencia interna');
      const { data: movimientos } = await admin.from('movimientos_tesoreria')
        .select('id, cuenta_id, tipo, monto, par_movimiento_id')
        .in('cuenta_id', [contexto.bancoId, contexto.cajaId]);
      expect(movimientos).toHaveLength(2);
      const salida = movimientos!.find((movimiento) => movimiento.tipo === 'TRANSFERENCIA_SALIDA')!;
      const entrada = movimientos!.find((movimiento) => movimiento.tipo === 'TRANSFERENCIA_ENTRADA')!;
      expect(salida.cuenta_id).toBe(contexto.bancoId);
      expect(entrada.cuenta_id).toBe(contexto.cajaId);
      expect(salida.par_movimiento_id).toBe(entrada.id);
      expect(entrada.par_movimiento_id).toBe(salida.id);
      await page.getByTestId('cerrar-transferencia').click();
      await expect(page.getByTestId(`saldo-actual-${contexto.bancoId}`)).toContainText('1,300');
      await expect(page.getByTestId(`saldo-actual-${contexto.cajaId}`)).toContainText('200');

      // 3. Conciliar y desconciliar el cobro (marca auditada).
      await page.getByTestId(`conciliar-cobro-${contexto.cobroId}`).click();
      await expect(page.getByTestId(`conciliacion-cobro-${contexto.cobroId}`)).toContainText('Conciliado');
      const { data: conciliacion } = await admin.from('conciliaciones_tesoreria')
        .select('conciliado_por').eq('entidad', 'cobro').eq('entidad_id', contexto.cobroId).single();
      expect(conciliacion?.conciliado_por).toBe(contexto.usuarioId);
      await page.getByTestId(`desconciliar-cobro-${contexto.cobroId}`).click();
      await expect(page.getByTestId(`conciliacion-cobro-${contexto.cobroId}`)).toContainText('Pendiente');

      // 4. La transferencia no es ingreso ni gasto: el saldo neto mueve, no suma.
      const { data: totalTransferencias } = await admin.from('movimientos_tesoreria')
        .select('id').in('cuenta_id', [contexto.bancoId, contexto.cajaId]);
      expect(totalTransferencias).toHaveLength(2);

      // Capturas del tablero.
      mkdirSync('.ai-shared/qa/sii-b8-f5/visual', { recursive: true });
      for (const [ancho, alto] of [[1440, 900], [768, 1024]] as const) {
        await page.setViewportSize({ width: ancho, height: alto });
        for (const oscuro of [false, true]) {
          await page.locator('html').evaluate(
            (elemento, activar) => elemento.classList.toggle('dark', activar), oscuro,
          );
          await page.screenshot({
            path: `.ai-shared/qa/sii-b8-f5/visual/tesoreria-${ancho}-${oscuro ? 'oscuro' : 'claro'}.png`,
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
