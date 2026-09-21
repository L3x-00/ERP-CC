import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

function cargarEntornoLocal(): void {
  const ruta = `${process.cwd()}\\.env.local`;
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    process.env[coincidencia[1]] = coincidencia[2].replace(/^['"]|['"]$/g, '');
  }
}

cargarEntornoLocal();

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  administradorId: string;
  clienteId: string;
  ordenId: string;
  gastoFolio: string;
  folioOrden: string;
};

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable ${nombre} para E2E.`);
  return valor;
}

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-ti-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Cc9`;
  const { data: usuarioAuth, error: errorAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: `Administrador TI ${sufijo}` },
  });
  if (errorAuth || !usuarioAuth.user) throw new Error(`No se creó administrador E2E: ${errorAuth?.message ?? 'sin usuario'}`);
  const administradorId = usuarioAuth.user.id;
  const { error: errorPerfil } = await admin.from('usuarios').update({
    rol: 'admin', activo: true, nombre_completo: `Administrador TI ${sufijo}`,
  }).eq('id', administradorId);
  if (errorPerfil) throw new Error(`No se preparó perfil E2E: ${errorPerfil.message}`);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    razon_social: `Cliente TI ${sufijo} SA de CV`,
    nombre_comercial: `Cliente TI ${sufijo}`,
    estado: 'activo',
    saldo_a_favor: 0,
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`No se creó cliente E2E: ${errorCliente?.message ?? 'sin cliente'}`);

  const folioOrden = `OP-${String(800000 + (Number.parseInt(sufijo, 16) % 99_000)).padStart(6, '0')}`;
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio: folioOrden,
    cliente_id: cliente.id,
    estado: 'programada',
    prioridad: 'normal',
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
    es_interna: true,
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`No se creó orden TI E2E: ${errorOrden?.message ?? 'sin orden'}`);

  const { data: gasto, error: errorGasto } = await admin.rpc('registrar_gasto', {
    p_orden_id: orden.id,
    p_proveedor_id: null,
    p_categoria: 'otros',
    p_descripcion: `Insumos trabajo interno ${sufijo}`,
    p_monto_subtotal: 1000,
    p_monto_iva: 160,
    p_monto_total: 1160,
    p_moneda: 'MXN',
    p_tipo_cambio: 1,
    p_fecha_gasto: new Date().toISOString(),
    p_fecha_vencimiento: null,
    p_comprobante_url: null,
    p_folio_comprobante: null,
    p_metodo_pago: null,
    p_datos_ocr_json: null,
    p_notas: null,
    p_creado_por: administradorId,
  } as unknown as Database['public']['Functions']['registrar_gasto']['Args']);
  if (errorGasto || !gasto?.[0]) throw new Error(`No se creó gasto TI E2E: ${errorGasto?.message ?? 'sin gasto'}`);

  return {
    admin, correo, contrasena, administradorId,
    clienteId: cliente.id, ordenId: orden.id,
    gastoFolio: gasto[0].folio, folioOrden,
  };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  await admin.from('gastos').delete().eq('orden_id', contexto.ordenId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().eq('usuario_id', contexto.administradorId);
  await admin.from('usuarios').delete().eq('id', contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.administradorId);
}

test.describe.serial('costo de producción de trabajos internos (TI)', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase remoto.',
  );

  let contexto: ContextoE2E | null = null;

  test.beforeAll(async () => { contexto = await prepararContexto(); });
  test.afterAll(async () => { if (contexto) await limpiarContexto(contexto); });

  test('la rentabilidad de un TI informa su costo sin venta ni margen', async ({ page }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;

    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(datos.correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(datos.contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');

    await page.goto('/gastos');
    await page.getByPlaceholder('Folio o descripción').fill(datos.gastoFolio);
    const fila = page.getByRole('row', { name: new RegExp(datos.gastoFolio) });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText(datos.folioOrden);
    await fila.getByRole('button', { name: 'Rentabilidad' }).click();

    const tarjeta = page.getByTestId('tarjeta-rentabilidad-ti');
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta).toContainText('Costo de producción');
    await expect(tarjeta).toContainText(datos.folioOrden);
    await expect(tarjeta).toContainText('Trabajo interno (TI)');
    await expect(tarjeta.getByTestId('rentabilidad-ti-costo')).toContainText('$1,160.00');
    await expect(tarjeta).not.toContainText('Venta explícita');
    await expect(tarjeta).not.toContainText('Margen');

    const { data: calculo } = await datos.admin.rpc('obtener_rentabilidad_orden', {
      p_orden_id: datos.ordenId,
    });
    expect(Number(calculo?.[0]?.monto_venta_mxn)).toBe(0);
    expect(Number(calculo?.[0]?.costo_gastos_directos_mxn)).toBe(1160);
    expect(Number(calculo?.[0]?.costo_total_mxn)).toBe(1160);
  });
});
