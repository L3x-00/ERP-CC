import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

/** E2E remoto opt-in: todos los registros creados se eliminan por sus IDs. */
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

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  usuarioId: string;
  clienteId: string;
  proveedorId: string;
  materialId: string;
  ordenId: string;
  partidaId: string;
  recursoId: string;
  programacionId: string;
};

type RecursosCreados = {
  usuarioId: string | null;
  clienteId: string | null;
  proveedorId: string | null;
  materialId: string | null;
  ordenId: string | null;
  partidaId: string | null;
  recursoId: string | null;
  programacionId: string | null;
};

async function limpiarRecursos(admin: SupabaseClient<Database>, recursos: RecursosCreados): Promise<void> {
  if (recursos.ordenId) {
    await admin.from('gastos').delete().eq('orden_id', recursos.ordenId);
    const { data: cuentas } = await admin.from('cuentas_por_cobrar').select('id').eq('orden_id', recursos.ordenId);
    const cuentasIds = (cuentas ?? []).map((cuenta) => cuenta.id);
    if (cuentasIds.length) {
      await admin.from('pagos_ar').delete().in('ar_id', cuentasIds);
      await admin.from('cuentas_por_cobrar').delete().in('id', cuentasIds);
    }
    await admin.from('sesiones_trabajo').delete().eq('orden_id', recursos.ordenId);
    await admin.from('registros_consumo_material').delete().eq('partida_id', recursos.partidaId ?? '00000000-0000-0000-0000-000000000000');
    await admin.from('movimientos_inventario').delete().eq('orden_id', recursos.ordenId);
  }
  if (recursos.programacionId) await admin.from('programacion_areas').delete().eq('id', recursos.programacionId);
  if (recursos.partidaId) await admin.from('partidas_orden_produccion').delete().eq('id', recursos.partidaId);
  if (recursos.ordenId) await admin.from('ordenes_produccion').delete().eq('id', recursos.ordenId);
  if (recursos.materialId) await admin.from('materiales').delete().eq('id', recursos.materialId);
  if (recursos.proveedorId) await admin.from('proveedores').delete().eq('id', recursos.proveedorId);
  if (recursos.recursoId) {
    await admin.from('capacidades_recurso_turno').delete().eq('recurso_id', recursos.recursoId);
    await admin.from('recursos_planeacion').delete().eq('id', recursos.recursoId);
  }
  if (recursos.clienteId) await admin.from('clientes').delete().eq('id', recursos.clienteId);
  if (recursos.usuarioId) {
    await admin.from('logs').delete().eq('usuario_id', recursos.usuarioId);
    await admin.from('usuarios').delete().eq('id', recursos.usuarioId);
    await admin.auth.admin.deleteUser(recursos.usuarioId);
  }
}

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = crearAdmin();
  const sufijo = randomUUID().slice(0, 8).toUpperCase();
  const correo = `e2e-gastos-${sufijo.toLowerCase()}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Gg9`;
  const recursos: RecursosCreados = {
    usuarioId: null,
    clienteId: null,
    proveedorId: null,
    materialId: null,
    ordenId: null,
    partidaId: null,
    recursoId: null,
    programacionId: null,
  };

  try {
    const { data: usuarioAuth, error: errorAuth } = await admin.auth.admin.createUser({
      email: correo,
      password: contrasena,
      email_confirm: true,
      user_metadata: { nombre_completo: `Administrador Gastos ${sufijo}` },
    });
    if (errorAuth || !usuarioAuth.user) throw new Error(`No se creó usuario E2E: ${errorAuth?.message ?? 'sin usuario'}`);
    recursos.usuarioId = usuarioAuth.user.id;
    const { error: errorPerfil } = await admin.from('usuarios').update({
      rol: 'admin', activo: true, nombre_completo: `Administrador Gastos ${sufijo}`,
    }).eq('id', recursos.usuarioId);
    if (errorPerfil) throw new Error(`No se configuró perfil E2E: ${errorPerfil.message}`);

    const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
      nombre_comercial: `Cliente Gastos E2E ${sufijo}`,
      razon_social: `Cliente Gastos E2E ${sufijo} SA de CV`,
      estado: 'activo',
    }).select('id').single();
    if (errorCliente || !cliente) throw new Error(`No se creó cliente E2E: ${errorCliente?.message ?? 'sin cliente'}`);
    recursos.clienteId = cliente.id;

    const { data: proveedor, error: errorProveedor } = await admin.from('proveedores').insert({
      nombre_comercial: `Proveedor Gastos E2E ${sufijo}`,
      razon_social: `Proveedor Gastos E2E ${sufijo} SA de CV`,
      contacto_nombre: 'Contacto E2E',
      correo: `proveedor-${sufijo.toLowerCase()}@orca.local`,
      telefono: '6640000099',
    }).select('id').single();
    if (errorProveedor || !proveedor) throw new Error(`No se creó proveedor E2E: ${errorProveedor?.message ?? 'sin proveedor'}`);
    recursos.proveedorId = proveedor.id;

    const { data: material, error: errorMaterial } = await admin.from('materiales').insert({
      codigo: `E2E-GTO-${sufijo}`,
      nombre: 'Material E2E de rentabilidad',
      categoria: 'insumo',
      unidad_compra: 'pieza',
      unidad_control: 'pieza',
      factor_conversion: 1,
      costo_unitario_compra: 200,
      costo_unitario_control: 200,
      stock_actual_control: 100,
      proveedor_id: proveedor.id,
    }).select('id').single();
    if (errorMaterial || !material) throw new Error(`No se creó material E2E: ${errorMaterial?.message ?? 'sin material'}`);
    recursos.materialId = material.id;

    const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    if (errorFolio || !folio) throw new Error(`No se generó folio E2E: ${errorFolio?.message ?? 'sin folio'}`);
    const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
      folio,
      cliente_id: cliente.id,
      // El consumo de material solo procede en una OP `en_proceso`; la orden se
      // completa después del consumo para que la AR pueda abrirse al final.
      estado: 'en_proceso',
      prioridad: 'normal',
      fecha_compromiso: '2100-01-15T00:00:00.000Z',
    }).select('id').single();
    if (errorOrden || !orden) throw new Error(`No se creó orden E2E: ${errorOrden?.message ?? 'sin orden'}`);
    recursos.ordenId = orden.id;

    const { data: partida, error: errorPartida } = await admin.from('partidas_orden_produccion').insert({
      orden_id: orden.id,
      codigo_pieza: `E2E-GTO-${sufijo}`,
      descripcion: 'Partida terminada para rentabilidad E2E',
      cantidad_solicitada: 10,
      cantidad_producida: 10,
      unidad_medida: 'pieza',
      material_id: material.id,
      tiempo_estimado_minutos: 360,
      tiempo_real_minutos: 390,
    }).select('id').single();
    if (errorPartida || !partida) throw new Error(`No se creó partida E2E: ${errorPartida?.message ?? 'sin partida'}`);
    recursos.partidaId = partida.id;
    const usuarioId = recursos.usuarioId;
    if (!usuarioId) throw new Error('El usuario E2E no tiene ID');

    const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
      codigo: `E2EGTO-${sufijo}`,
      area: 'taller',
      nombre: `Recurso E2E Gastos ${sufijo}`,
      costo_hora_interno: 150,
    }).select('id').single();
    if (errorRecurso || !recurso) throw new Error(`No se creó recurso E2E: ${errorRecurso?.message ?? 'sin recurso'}`);
    recursos.recursoId = recurso.id;
    const { error: errorCapacidad } = await admin.from('capacidades_recurso_turno').insert({
      recurso_id: recurso.id, turno: 'matutino', horas_capacidad: 8,
    });
    if (errorCapacidad) throw new Error(`No se creó capacidad E2E: ${errorCapacidad.message}`);

    const { data: programacion, error: errorProgramacion } = await admin.from('programacion_areas').insert({
      orden_id: orden.id,
      partida_id: partida.id,
      recurso_id: recurso.id,
      secuencia: 1,
      estado_planeacion: 'completada',
      fecha_programada: '2099-12-30',
      turno: 'matutino',
      horas_estimadas: 6,
    }).select('id').single();
    if (errorProgramacion || !programacion) throw new Error(`No se creó programación E2E: ${errorProgramacion?.message ?? 'sin programación'}`);
    recursos.programacionId = programacion.id;

    const { error: errorConsumo } = await admin.rpc('registrar_consumo_material_op', {
      p_partida_id: partida.id, p_material_id: material.id, p_cantidad_usada: 3, p_cantidad_scrap: 0.5,
    });
    if (errorConsumo) throw new Error(`No se creó consumo E2E: ${errorConsumo.message}`);
    const { error: errorCompletar } = await admin
      .from('ordenes_produccion')
      .update({ estado: 'completada' })
      .eq('id', orden.id);
    if (errorCompletar) throw new Error(`No se completó la orden E2E: ${errorCompletar.message}`);
    const { error: errorSesion } = await admin.from('sesiones_trabajo').insert({
      orden_id: orden.id,
      partida_id: partida.id,
      programacion_id: programacion.id,
      operador_id: usuarioId,
      fecha_inicio: '2026-09-01T15:00:00.000Z',
      fecha_fin: '2026-09-01T22:30:00.000Z',
      horas_brutas: 7.5,
      horas_netas: 6.5,
      piezas_producidas: 10,
      estado_sesion: 'finalizada',
    });
    if (errorSesion) throw new Error(`No se creó sesión E2E: ${errorSesion.message}`);

    const { error: errorCuenta } = await admin.rpc('abrir_cuenta_por_cobrar', {
      p_orden_id: orden.id,
      p_monto_total: 10000,
      p_moneda: 'MXN',
      p_tipo_cambio_origen: 1,
      p_fecha_vencimiento: '2100-01-31T00:00:00.000Z',
      p_folio_factura_remision: `E2E-GTO-${sufijo}`,
    });
    if (errorCuenta) throw new Error(`No se abrió AR E2E: ${errorCuenta.message}`);

    return {
      admin,
      correo,
      contrasena,
      usuarioId: recursos.usuarioId,
      clienteId: recursos.clienteId,
      proveedorId: recursos.proveedorId,
      materialId: recursos.materialId,
      ordenId: recursos.ordenId,
      partidaId: recursos.partidaId,
      recursoId: recursos.recursoId,
      programacionId: recursos.programacionId,
    } as ContextoE2E;
  } catch (error) {
    await limpiarRecursos(admin, recursos);
    throw error;
  }
}

async function iniciarSesion(page: Page, contexto: ContextoE2E): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(contexto.correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
}

test.describe.serial('Gastos, CxP y rentabilidad por orden', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos efímeros en Supabase remoto.',
  );

  let contexto: ContextoE2E | null = null;

  test.beforeAll(async () => { contexto = await prepararContexto(); });
  test.afterAll(async () => { if (contexto) await limpiarRecursos(contexto.admin, contexto); });

  test('registra gasto, actualiza CxP, calcula rentabilidad y sincroniza otra vista', async ({ page, browser }) => {
    if (!contexto) throw new Error('No se preparó contexto E2E');
    const datos = contexto;
    await iniciarSesion(page, datos);
    const observador = await browser.newPage();
    await iniciarSesion(observador, datos);
    await observador.goto('/gastos');
    await expect(observador.getByTestId('pagina-gastos')).toBeVisible();
    await expect(observador.getByTestId('sincronizador-gastos')).toHaveAttribute('data-conectado', 'true');

    await page.goto('/gastos');
    await expect(page.getByTestId('pagina-gastos')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar gasto' }).click();
    await page.getByLabel('ID de orden (opcional)').fill(datos.ordenId);
    await page.getByLabel('Descripción').fill('Gasto E2E de consumibles');
    await page.getByLabel('Subtotal').fill('1000');
    await page.getByLabel('IVA').fill('160');
    await page.getByRole('spinbutton', { name: 'Total', exact: true }).fill('1160');
    await page.getByLabel('Folio de comprobante').fill('E2E-GTO-COMP-001');
    await page.getByRole('button', { name: 'Guardar gasto' }).click();

    const fila = page.getByRole('row', { name: /Gasto E2E de consumibles/ });
    await expect(fila).toContainText(/GTO-\d{6}/);
    await expect.poll(async () => {
      const { data: gasto } = await datos.admin.from('gastos').select('folio, estado_pago').eq('orden_id', datos.ordenId).eq('descripcion', 'Gasto E2E de consumibles').maybeSingle();
      return gasto ? `${gasto.folio}:${gasto.estado_pago}` : null;
    }).toMatch(/^GTO-\d{6}:pendiente$/);

    await expect.poll(async () => observador.getByTestId('sincronizador-gastos').getAttribute('data-eventos')).not.toBe('0');
    await expect(observador.getByRole('row', { name: /Gasto E2E de consumibles/ })).toContainText('Gasto E2E de consumibles');

    await fila.getByRole('button', { name: 'Rentabilidad' }).click();
    await expect(page.getByText('Venta explícita (MXN)')).toBeVisible();
    await expect(page.getByText('$10,000.00')).toBeVisible();
    await expect(page.getByText('$7,165.00')).toBeVisible();
    await expect(page.getByText('71.65 %')).toBeVisible();
    await expect.poll(async () => {
      const { data } = await datos.admin.rpc('obtener_rentabilidad_orden', { p_orden_id: datos.ordenId });
      return data?.[0] ? Number(data[0].costo_total_mxn) : 0;
    }).toBe(2835);

    await fila.getByRole('button', { name: 'Marcar pagado' }).click();
    await expect.poll(async () => {
      const { data } = await datos.admin.from('gastos').select('estado_pago').eq('orden_id', datos.ordenId).eq('descripcion', 'Gasto E2E de consumibles').maybeSingle();
      return data?.estado_pago ?? null;
    }).toBe('pagado');
    await expect(fila).toContainText(/pagado/i);

    const { data: logs } = await datos.admin.from('logs').select('accion').eq('usuario_id', datos.usuarioId).eq('modulo', 'gastos');
    expect((logs ?? []).map((log) => log.accion)).toEqual(expect.arrayContaining(['registrar_gasto', 'cambiar_estado_gasto']));
    await observador.close();
  });
});
