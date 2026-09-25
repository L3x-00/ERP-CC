import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error('Cancelación financiera E2E: solo se permite loopback');
}
function datos<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error || r.data === null) throw new Error(r.error?.message ?? 'Sin datos');
  return r.data as NonNullable<T>;
}

test('cancelación sin pagos libera la deuda; con anticipo conserva orden, pago y saldo', async ({ page }, testInfo) => {
  test.skip(!url || !clave || process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si', 'Requiere stack local explícito');
  const admin = createClient<Database>(url!, clave!, { auth: { persistSession: false, autoRefreshToken: false } });
  const correo = `a02-ui-${randomUUID()}@orca.local`;
  const contrasena = `A02!${randomUUID()}`;
  const creada = await admin.auth.admin.createUser({ email: correo, password: contrasena, email_confirm: true });
  if (creada.error || !creada.data.user) throw new Error(creada.error?.message ?? 'Sin usuario');
  const usuario = creada.data.user;
  let clienteId: string | undefined;
  const ordenIds: string[] = [];
  const cuentaIds: string[] = [];
  try {
    const { error: errorPerfil } = await admin.from('usuarios').update({ rol: 'admin', activo: true }).eq('id', usuario.id);
    if (errorPerfil) throw errorPerfil;
    clienteId = datos(await admin.from('clientes').insert({
      razon_social: `A02 UI ${randomUUID()}`, nombre_comercial: 'Prueba cancelación', estado: 'activo',
    }).select('id').single()).id;
    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL('**/dashboard');

    for (const conAnticipo of [false, true]) {
      const orden = datos(await admin.rpc('crear_orden_manual', {
        p_cliente_id: clienteId, p_fecha_compromiso: '2099-12-31T18:00:00Z', p_prioridad: 'normal',
        p_partidas: [{ codigo_pieza: 'A02-UI', cantidad_solicitada: 1, unidad_medida: 'pza', tiempo_estimado_minutos: 10 }],
      }))[0];
      ordenIds.push(orden.id);
      const ar = datos(await admin.from('cuentas_por_cobrar').insert({
        orden_id: orden.id, cliente_id: clienteId, monto_total: 1160, saldo_pendiente: 1160,
        moneda: 'MXN', tipo_cambio_origen: 1, estado: 'pendiente', cobrable_desde: null, fecha_vencimiento: null,
      }).select('id').single());
      cuentaIds.push(ar.id);
      if (conAnticipo) datos(await admin.rpc('registrar_pago_ar_atomico', {
        p_ar_id: ar.id, p_monto_pagado: 100, p_moneda_pago: 'MXN', p_tipo_cambio_pago: 1,
        p_metodo_pago: 'efectivo', p_referencia: 'Anticipo A02', p_usuario_id: usuario.id, p_solicitud_id: randomUUID(),
      }));
      await page.goto('/ordenes');
      const fila = page.getByRole('row', { name: new RegExp(orden.folio) });
      await expect(fila).toBeVisible();
      await fila.getByTestId('cambiar-estado-cancelada').click();
      const dialogo = page.getByRole('dialog', { name: `Cancelar orden ${orden.folio}` });
      await dialogo.getByLabel('Motivo (mínimo 3 caracteres)').fill('Cancelación solicitada en prueba A02');
      await dialogo.getByRole('button', { name: 'Confirmar cancelación' }).click();
      if (conAnticipo) {
        await expect(dialogo.getByRole('alert')).toContainText('La orden tiene cobranza registrada');
        await expect(dialogo).toBeVisible();
        for (const [ancho, tema] of [[1440, 'light'], [768, 'dark'], [390, 'light']] as const) {
          await page.setViewportSize({ width: ancho, height: 900 });
          await page.evaluate((valor) => {
            document.documentElement.classList.toggle('dark', valor === 'dark');
          }, tema);
          await expect(dialogo.getByRole('alert')).toBeVisible();
          const limites = await dialogo.boundingBox();
          expect(limites).not.toBeNull();
          expect(limites!.x).toBeGreaterThanOrEqual(0);
          expect(limites!.x + limites!.width).toBeLessThanOrEqual(ancho);
          await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`cancelacion-${ancho}-${tema}.png`) });
        }
      } else {
        await expect(dialogo).toBeHidden();
      }
      const cuenta = datos(await admin.from('cuentas_por_cobrar').select('estado,saldo_pendiente,monto_total').eq('id', ar.id).single());
      expect(cuenta).toMatchObject({ estado: conAnticipo ? 'parcial' : 'cancelado', saldo_pendiente: conAnticipo ? 1060 : 0, monto_total: 1160 });
      const op = datos(await admin.from('ordenes_produccion').select('estado').eq('id', orden.id).single());
      expect(op.estado).toBe(conAnticipo ? 'borrador' : 'cancelada');
      const pagos = datos(await admin.from('pagos_ar').select('id,monto_pagado').eq('ar_id', ar.id));
      expect(pagos).toHaveLength(conAnticipo ? 1 : 0);
      if (conAnticipo) expect(Number(pagos[0].monto_pagado)).toBe(100);
    }
  } finally {
    if (cuentaIds.length) {
      await admin.from('pagos_ar').delete().in('ar_id', cuentaIds);
      await admin.from('cuentas_por_cobrar').delete().in('id', cuentaIds);
    }
    if (ordenIds.length) await admin.from('ordenes_produccion').delete().in('id', ordenIds);
    if (clienteId) await admin.from('clientes').delete().eq('id', clienteId);
    await admin.from('logs').delete().eq('usuario_id', usuario.id);
    await admin.from('usuarios').delete().eq('id', usuario.id);
    await admin.auth.admin.deleteUser(usuario.id);
  }
});
