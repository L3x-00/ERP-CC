import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import type { Database } from '@/compartido/tipos/supabase';

type ContextoAceptacion = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  usuarioId: string;
  clienteId: string;
  pipelineId: string;
  propuestaId: string;
  revisionId: string;
  ordenId: string;
  partidaId: string;
  materialId: string;
  proveedorId: string;
  folioGasto: string;
  folioOrden: string;
};

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable ${nombre} para E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  return createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function folios(sufijo: string): { n4: string; n6: string } {
  const numero = Number.parseInt(sufijo, 16);
  return {
    n4: String(1000 + (numero % 9000)).padStart(4, '0'),
    n6: String(900000 + (numero % 100000)).padStart(6, '0'),
  };
}

/**
 * Siembra por service_role, sin recorrer Propuesta/Orden por UI: la aceptación
 * solo usa el navegador para seleccionar la Orden en Gastos y leer la tabla.
 * La revisión nace DRAFT para que `editar_costos_revision` (RPC autorizada)
 * pueda escribir los costos; la Orden congela el alcance al final.
 */
async function prepararContexto(): Promise<ContextoAceptacion> {
  const admin = crearAdmin();
  const sufijo = randomUUID().slice(0, 8);
  const { n4, n6 } = folios(sufijo);
  const correo = `e2e-c104-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Aa9`;

  const alta = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: `Admin C10.4 ${sufijo}` },
  });
  if (alta.error || !alta.data.user) {
    throw new Error(`No se creó el usuario E2E: ${alta.error?.message ?? 'sin usuario'}`);
  }
  const usuarioId = alta.data.user.id;
  const perfil = await admin.from('usuarios').update({
    rol: 'admin', activo: true, nombre_completo: `Admin C10.4 ${sufijo}`,
  }).eq('id', usuarioId);
  if (perfil.error) throw new Error(`No se preparó el perfil E2E: ${perfil.error.message}`);

  const cliente = await admin.from('clientes').insert({
    nombre_comercial: `Cliente C10.4 ${sufijo}`,
    razon_social: `Cliente C10.4 ${sufijo} SA de CV`,
    estado: 'activo',
    saldo_a_favor: 0,
  }).select('id').single();
  if (cliente.error || !cliente.data) {
    throw new Error(`No se creó el cliente E2E: ${cliente.error?.message ?? 'sin cliente'}`);
  }
  const clienteId = cliente.data.id;

  const pipeline = await admin.from('pipeline').insert({
    folio_op: `OP-${n6}`,
    etapa: 'ganada',
    nombre_contacto: 'Contacto C10.4',
    empresa: `Cliente C10.4 ${sufijo}`,
    cliente_id: clienteId,
    vendedor_id: usuarioId,
    moneda: 'MXN',
    iva_porcentaje: 16,
  }).select('id').single();
  if (pipeline.error || !pipeline.data) {
    throw new Error(`No se creó el RFQ E2E: ${pipeline.error?.message ?? 'sin RFQ'}`);
  }
  const pipelineId = pipeline.data.id;

  const propuesta = await admin.from('propuestas').insert({
    rfq_id: pipelineId,
    cliente_id: clienteId,
    folio_cnc: `CNC-${n4}_01`,
    estado: 'SENT',
    responsable_id: usuarioId,
    creado_por: usuarioId,
  }).select('id').single();
  if (propuesta.error || !propuesta.data) {
    throw new Error(`No se creó la Propuesta E2E: ${propuesta.error?.message ?? 'sin propuesta'}`);
  }
  const propuestaId = propuesta.data.id;

  const revision = await admin.from('propuesta_revisiones').insert({
    propuesta_id: propuestaId,
    letra: 'A',
    folio_revision: `CNC-${n4}_01-A`,
    estado: 'DRAFT',
    snapshot_cabecera: { moneda: 'MXN', iva_porcentaje: 16 },
    creado_por: usuarioId,
  }).select('id, actualizado_en').single();
  if (revision.error || !revision.data) {
    throw new Error(`No se creó la revisión E2E: ${revision.error?.message ?? 'sin revisión'}`);
  }
  const revisionId = revision.data.id;

  const costos = await admin.rpc('editar_costos_revision', {
    p_revision_id: revisionId,
    p_datos: {
      actualizado_en: revision.data.actualizado_en,
      costos: [
        { categoria: 'material', monto: 5000 },
        { categoria: 'mano_obra', monto: 2000 },
        { categoria: 'gastos_directos', monto: 800 },
        { categoria: 'subcontratacion', monto: 0 },
      ],
    },
    p_actor: usuarioId,
    p_correlation_id: randomUUID(),
  });
  if (costos.error) throw new Error(`No se costeó la revisión E2E: ${costos.error.message}`);

  const folioOrden = `OP-${n6}`;
  const orden = await admin.from('ordenes_produccion').insert({
    folio: folioOrden,
    cliente_id: clienteId,
    estado: 'completada',
    prioridad: 'normal',
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
  }).select('id').single();
  if (orden.error || !orden.data) {
    throw new Error(`No se creó la Orden E2E: ${orden.error?.message ?? 'sin orden'}`);
  }
  const ordenId = orden.data.id;

  const cxc = await admin.from('cuentas_por_cobrar').insert({
    orden_id: ordenId,
    cliente_id: clienteId,
    monto_total: 23200,
    monto_subtotal: 20000,
    monto_iva: 3200,
    saldo_pendiente: 23200,
    moneda: 'MXN',
    tipo_cambio_origen: 1,
    estado: 'pendiente',
    cobrable_desde: new Date().toISOString(),
    fecha_vencimiento: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  }).select('id').single();
  if (cxc.error || !cxc.data) {
    throw new Error(`No se creó la CxC E2E: ${cxc.error?.message ?? 'sin CxC'}`);
  }

  const partida = await admin.from('partidas_orden_produccion').insert({
    orden_id: ordenId,
    codigo_pieza: `P-C104-${n6}`,
    descripcion: 'Partida de aceptación C10.4',
    cantidad_solicitada: 1,
    cantidad_producida: 1,
    cantidad_scrap: 0,
    unidad_medida: 'pieza',
  }).select('id').single();
  if (partida.error || !partida.data) {
    throw new Error(`No se creó la partida E2E: ${partida.error?.message ?? 'sin partida'}`);
  }
  const partidaId = partida.data.id;

  const material = await admin.from('materiales').insert({
    codigo: `MAT-C104-${n6}`,
    nombre: `Material C10.4 ${sufijo}`,
    categoria: 'materia_prima',
    unidad_compra: 'pieza',
    unidad_control: 'kg',
    factor_conversion: 1,
    costo_unitario_compra: 50,
    costo_unitario_control: 50,
    stock_actual_control: 1000,
    stock_minimo_control: 10,
  }).select('id').single();
  if (material.error || !material.data) {
    throw new Error(`No se creó el material E2E: ${material.error?.message ?? 'sin material'}`);
  }
  const materialId = material.data.id;

  const consumo = await admin.from('registros_consumo_material').insert({
    partida_id: partidaId,
    material_id: materialId,
    cantidad_usada: 100,
    cantidad_scrap: 0,
    costo_unitario_momento: 50,
  });
  if (consumo.error) throw new Error(`No se registró el consumo E2E: ${consumo.error.message}`);

  // La Orden congela su alcance comercial después de partida/consumo; así el
  // trigger de alcance no bloquea la siembra (mismo orden que usa f03).
  const alcance = await admin.from('ordenes_produccion').update({
    propuesta_revision_id: revisionId,
    snapshot_json: { totales: { subtotal: 20000, moneda: 'MXN', tipo_cambio: 1 } },
    fecha_compromiso_comercial: '2099-12-31T18:00:00.000Z',
  }).eq('id', ordenId);
  if (alcance.error) throw new Error(`No se congeló el alcance E2E: ${alcance.error.message}`);

  const proveedor = await admin.from('proveedores').insert({
    nombre_comercial: `Proveedor C10.4 ${sufijo}`,
    razon_social: `Proveedor C10.4 ${sufijo} SA de CV`,
    contacto_nombre: 'Contacto C10.4',
    correo: `prov-c104-${sufijo}@prueba.local`,
    telefono: '5555555555',
  }).select('id').single();
  if (proveedor.error || !proveedor.data) {
    throw new Error(`No se creó el proveedor E2E: ${proveedor.error?.message ?? 'sin proveedor'}`);
  }
  const proveedorId = proveedor.data.id;

  const compra = await admin.from('compras').insert({
    folio_sii: `CG-${n4}_0001`,
    proveedor_id: proveedorId,
    orden_id: ordenId,
    estado: 'RECIBIDA',
    monto_subtotal: 4000,
    monto_iva: 640,
    monto_total: 4640,
    moneda: 'MXN',
    tipo_cambio: 1,
    saldo_pendiente: 4640,
    creado_por: usuarioId,
    rubro_costo: 'material',
    recibida_en: new Date().toISOString(),
  });
  if (compra.error) throw new Error(`No se creó la compra E2E: ${compra.error.message}`);

  const folioGasto = `GTO-${n6}`;
  const gasto = await admin.from('gastos').insert({
    folio: folioGasto,
    orden_id: ordenId,
    categoria: 'consumibles',
    descripcion: `Consumibles de aceptación C10.4 ${sufijo}`,
    monto_subtotal: 650,
    monto_iva: 104,
    monto_total: 754,
    moneda: 'MXN',
    tipo_cambio: 1,
    estado_pago: 'pagado',
    fecha_gasto: new Date().toISOString(),
    creado_por: usuarioId,
  });
  if (gasto.error) throw new Error(`No se creó el gasto directo E2E: ${gasto.error.message}`);

  return {
    admin, correo, contrasena, usuarioId, clienteId, pipelineId, propuestaId,
    revisionId, ordenId, partidaId, materialId, proveedorId, folioGasto, folioOrden,
  };
}

async function limpiarContexto(contexto: ContextoAceptacion): Promise<void> {
  const { admin } = contexto;
  await admin.from('gastos').delete().eq('orden_id', contexto.ordenId);
  await admin.from('compras').delete().eq('orden_id', contexto.ordenId);
  await admin.from('cuentas_por_cobrar').delete().eq('orden_id', contexto.ordenId);
  await admin.from('registros_consumo_material').delete().eq('partida_id', contexto.partidaId);
  await admin.from('partidas_orden_produccion').delete().eq('orden_id', contexto.ordenId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);

  const revision = await admin.from('propuesta_revisiones')
    .select('actualizado_en').eq('id', contexto.revisionId).maybeSingle();
  if (revision.data) {
    await admin.rpc('editar_costos_revision', {
      p_revision_id: contexto.revisionId,
      p_datos: { actualizado_en: revision.data.actualizado_en, costos: [] },
      p_actor: contexto.usuarioId,
      p_correlation_id: randomUUID(),
    });
  }
  await admin.from('propuesta_revisiones').delete().eq('id', contexto.revisionId);
  await admin.from('propuestas').delete().eq('id', contexto.propuestaId);
  await admin.from('pipeline').delete().eq('id', contexto.pipelineId);
  await admin.from('materiales').delete().eq('id', contexto.materialId);
  await admin.from('proveedores').delete().eq('id', contexto.proveedorId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().eq('usuario_id', contexto.usuarioId);
  await admin.from('usuarios').delete().eq('id', contexto.usuarioId);
  await admin.auth.admin.deleteUser(contexto.usuarioId);
}

async function iniciarSesion(page: import('@playwright/test').Page, contexto: ContextoAceptacion): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(contexto.correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
}

test.describe.serial('Aceptación C10.4 — conciliación de costos por Orden', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos efímeros en Supabase remoto.',
  );

  let contexto: ContextoAceptacion | null = null;

  test.beforeAll(async () => { contexto = await prepararContexto(); });
  test.afterAll(async () => { if (contexto) await limpiarContexto(contexto); });

  test('responde pensábamos X, comprometimos Y, gastamos Z y margen A/B', async ({ page }, testInfo) => {
    if (!contexto) throw new Error('No se preparó el contexto de aceptación');

    await iniciarSesion(page, contexto);
    await page.goto('/gastos');
    await expect(page.getByTestId('pagina-gastos')).toBeVisible();

    // La UI solo se usa para seleccionar la Orden desde el gasto directo.
    await page.getByLabel('Buscar').fill(contexto.folioGasto);
    const fila = page.getByRole('row', { name: new RegExp(contexto.folioGasto) });
    await expect(fila).toBeVisible();
    await fila.getByRole('button', { name: 'Rentabilidad' }).click();

    await expect(page.getByTestId('tabla-conciliacion-costos')).toBeVisible();
    await expect(page.getByTestId('conciliacion-total-estimado')).toHaveText('$7,800.00');
    await expect(page.getByTestId('conciliacion-total-comprometido')).toHaveText('$4,000.00');
    await expect(page.getByTestId('conciliacion-total-real')).toHaveText('$5,650.00');
    await expect(page.getByTestId('conciliacion-total-variacion')).toHaveText('-$2,150.00');
    await expect(page.getByTestId('conciliacion-margen-estimado')).toHaveText('61.0 %');
    await expect(page.getByTestId('conciliacion-margen-real')).toHaveText('71.8 %');

    await expect(page.getByTestId('conciliacion-material-estimado')).toHaveText('$5,000.00');
    await expect(page.getByTestId('conciliacion-material-comprometido')).toHaveText('$4,000.00');
    await expect(page.getByTestId('conciliacion-material-real')).toHaveText('$5,000.00');
    await expect(page.getByTestId('conciliacion-material-fuente')).toHaveText('Compra · Consumo');
    await expect(page.getByTestId('conciliacion-gastos_directos-real')).toHaveText('$650.00');
    await expect(page.getByTestId('conciliacion-gastos_directos-fuente')).toHaveText('Gasto');
    await expect(page.getByTestId('conciliacion-pie-ajuste')).toContainText('Ajuste manual: no disponible');

    await page.screenshot({ path: testInfo.outputPath('c10-4-aceptacion.png'), fullPage: true });
  });
});
