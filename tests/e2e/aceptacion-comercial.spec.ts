import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

/** Carga solo pares simples de `.env.local`; no registra ningún secreto. */
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
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre} para las pruebas E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  return createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type ContextoAceptacion = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  usuarioId: string;
  clienteId: string;
  empresa: string;
  areaCodigo: string;
  /** OBS-04: recurso de Planeación usado como equipo/estación de la línea. */
  estacionCodigo: string;
};

/**
 * Prepara el actor y los catálogos mínimos de la cadena comercial. Nada
 * pertenece a producción: son datos QA-FUNC locales con limpieza posterior.
 */
async function prepararContexto(): Promise<ContextoAceptacion> {
  const admin = crearAdmin();
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-acp-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Aa9`;

  const { data: usuario, error: errorUsuario } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: `Admin Aceptación ${sufijo}` },
  });
  if (errorUsuario || !usuario.user) {
    throw new Error(`No se pudo crear el usuario E2E: ${errorUsuario?.message ?? 'sin usuario'}`);
  }
  const { error: errorPerfil } = await admin
    .from('usuarios')
    .update({ rol: 'admin', activo: true, nombre_completo: `Admin Aceptación ${sufijo}` })
    .eq('id', usuario.user.id);
  if (errorPerfil) throw new Error(`No se preparó el perfil E2E: ${errorPerfil.message}`);

  const empresa = `QA-FUNC Comercial ${sufijo}`;
  const { data: cliente, error: errorCliente } = await admin
    .from('clientes')
    .insert({
      razon_social: empresa,
      nombre_comercial: `QA Comercial ${sufijo}`,
      estado: 'activo',
      condiciones_pago: '15_dias',
    })
    .select('id')
    .single();
  if (errorCliente || !cliente) throw new Error(`No se creó el cliente E2E: ${errorCliente?.message}`);

  const areaCodigo = `QA${sufijo.slice(0, 4).toUpperCase()}`;
  const { error: errorArea } = await admin.from('areas_trabajo_config').insert({
    codigo: areaCodigo,
    nombre: `Corte QA ${sufijo}`,
    activo: true,
  });
  if (errorArea) throw new Error(`No se creó el área E2E: ${errorArea.message}`);

  // OBS-04: recurso de Planeación para elegirlo como equipo/estación de la línea.
  const estacionCodigo = `QAEST-${sufijo.slice(0, 6).toUpperCase()}`;
  const { error: errorEstacion } = await admin.from('recursos_planeacion').insert({
    codigo: estacionCodigo,
    nombre: `Estación QA ${sufijo}`,
    area: 'taller',
    activo: true,
  });
  if (errorEstacion) throw new Error(`No se creó la estación E2E: ${errorEstacion.message}`);

  return {
    admin,
    correo,
    contrasena,
    usuarioId: usuario.user.id,
    clienteId: cliente.id,
    empresa,
    areaCodigo,
    estacionCodigo,
  };
}

async function limpiarContexto(contexto: ContextoAceptacion): Promise<void> {
  const { admin, clienteId, areaCodigo, estacionCodigo, usuarioId } = contexto;
  const { data: oportunidades } = await admin
    .from('pipeline')
    .select('id')
    .eq('cliente_id', clienteId);
  const idsOportunidades = (oportunidades ?? []).map((fila) => fila.id);
  for (const oportunidadId of idsOportunidades) {
    const { data: objetos } = await admin.storage
      .from('adjuntos-cotizacion')
      .list(oportunidadId, { limit: 200 });
    const rutas = (objetos ?? [])
      .filter((objeto) => objeto.id !== null)
      .map((objeto) => `${oportunidadId}/${objeto.name}`);
    if (rutas.length > 0) await admin.storage.from('adjuntos-cotizacion').remove(rutas);
  }
  if (idsOportunidades.length > 0) {
    const { data: ordenes } = await admin
      .from('ordenes_produccion')
      .select('id')
      .in('cotizacion_id', idsOportunidades);
    const idsOrdenes = (ordenes ?? []).map((fila) => fila.id);
    if (idsOrdenes.length > 0) {
      // D-04: la aprobación deja AR ligada a la orden; se limpia antes por la FK.
      const { data: cuentas } = await admin
        .from('cuentas_por_cobrar')
        .select('id')
        .in('orden_id', idsOrdenes);
      const idsCuentas = (cuentas ?? []).map((fila) => fila.id);
      if (idsCuentas.length > 0) {
        await admin.from('pagos_ar').delete().in('ar_id', idsCuentas);
        await admin.from('cuentas_por_cobrar').delete().in('id', idsCuentas);
      }
      await admin.from('partidas_orden_produccion').delete().in('orden_id', idsOrdenes);
      await admin.from('ordenes_produccion').delete().in('id', idsOrdenes);
    }
    await admin.from('archivos').delete().in('entidad_id', idsOportunidades);
    await admin.from('pipeline').delete().in('id', idsOportunidades);
  }
  await admin.from('clientes').delete().eq('id', clienteId);
  await admin.from('areas_trabajo_config').delete().eq('codigo', areaCodigo);
  await admin.from('recursos_planeacion').delete().eq('codigo', estacionCodigo);
  await admin.auth.admin.deleteUser(usuarioId);
}

async function iniciarSesion(pagina: Page, contexto: ContextoAceptacion): Promise<void> {
  await pagina.goto('/iniciar-sesion');
  await pagina.getByLabel('Correo electrónico').fill(contexto.correo);
  await pagina.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasena);
  await pagina.getByRole('button', { name: 'Iniciar sesión' }).click();
  await pagina.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
}

/** Crea un RFQ desde la cola nueva. */
async function crearRfqSimple(
  pagina: Page,
  contexto: ContextoAceptacion,
  opciones: { empresa: string; interna?: boolean },
): Promise<void> {
  await pagina.goto('/rfq');
  await pagina.getByRole('button', { name: 'Nuevo RFQ' }).click();
  await pagina.getByLabel('Nombre del contacto').fill('Ana QA');
  await pagina.getByLabel('Empresa', { exact: true }).fill(opciones.empresa);
  await pagina.getByLabel('Correo (opcional)').fill('ana.qa@qa-func.local');
  await pagina.getByLabel('Cliente (opcional)', { exact: true }).fill(contexto.empresa);
  await pagina.getByRole('button', { name: new RegExp(contexto.empresa) }).first().click();
  if (opciones.interna) {
    await pagina.getByLabel(/Orden interna \(TI\)/).check();
  }
  await pagina.getByRole('button', { name: 'Crear RFQ', exact: true }).click();
  await expect(pagina.getByTestId('ficha-rfq')).toBeVisible();
}

/**
 * Prepara la cadena comercial→orden por la vía vigente hasta B4/B5: las líneas
 * legacy y la etapa negociación se cargan con service_role (la UI de etapa se
 * retiró) y la RPC `aprobar_oportunidad_y_crear_orden` crea la orden. La UI de
 * aceptación comercial se restaurará sobre propuestas en B4/B5.
 */
async function crearOrdenDesdeRfq(
  admin: SupabaseClient<Database>,
  datos: ContextoAceptacion,
  empresa: string,
): Promise<{ oportunidadId: string; ordenId: string; ordenFolio: string }> {
  const { data: oportunidad, error: errorOportunidad } = await admin
    .from('pipeline')
    .select('id, vendedor_id')
    .eq('empresa', empresa)
    .single();
  if (errorOportunidad || !oportunidad) {
    throw new Error(`Sin RFQ para ordenar: ${errorOportunidad?.message ?? empresa}`);
  }

  const { error: errorLineas } = await admin.from('cotizacion_lineas').insert([
    {
      pipeline_id: oportunidad.id,
      descripcion: 'Soporte QA',
      cantidad: 10,
      precio_unitario: 100,
      area_trabajo_codigo: datos.areaCodigo,
      estacion_codigo: datos.estacionCodigo,
      procesos: ['corte'],
      es_externo: false,
      es_descuento: false,
      orden: 0,
    },
    {
      pipeline_id: oportunidad.id,
      descripcion: 'Servicio externo QA',
      cantidad: 1,
      precio_unitario: 300,
      procesos: [],
      es_externo: true,
      proveedor_externo: 'Taller QA Externo',
      es_descuento: false,
      orden: 1,
    },
    {
      pipeline_id: oportunidad.id,
      descripcion: 'Descuento QA',
      cantidad: 100,
      precio_unitario: 1,
      procesos: [],
      es_externo: false,
      es_descuento: true,
      orden: 2,
    },
  ]);
  if (errorLineas) throw new Error(`No se crearon las líneas: ${errorLineas.message}`);

  const { data: folioCnc, error: errorFolioCnc } = await admin.rpc('generar_folio_cnc');
  if (errorFolioCnc || !folioCnc) throw new Error(`Sin folio CNC: ${errorFolioCnc?.message}`);

  const { error: errorEtapa } = await admin
    .from('pipeline')
    .update({
      cliente_id: datos.clienteId,
      etapa: 'negociacion',
      estado_rfq: 'CONVERTED',
      folio_cnc: folioCnc,
      fecha_seguimiento: '2026-10-01',
      proximo_paso: 'Llamar para confirmar la orden de compra',
    })
    .eq('id', oportunidad.id);
  if (errorEtapa) throw new Error(`No se preparó el RFQ: ${errorEtapa.message}`);

  const { data: ordenes, error: errorRpc } = await admin.rpc('aprobar_oportunidad_y_crear_orden', {
    p_pipeline_id: oportunidad.id,
    p_cliente_id: datos.clienteId,
    p_fecha_compromiso: '2099-12-31T10:00:00.000Z',
    p_autorizar_sobregiro: false,
    p_actor_id: datos.usuarioId,
  });
  if (errorRpc || !ordenes || ordenes.length === 0) {
    throw new Error(`No se creó la orden: ${errorRpc?.message ?? 'sin fila'}`);
  }
  return {
    oportunidadId: oportunidad.id,
    ordenId: ordenes[0]!.id,
    ordenFolio: ordenes[0]!.folio,
  };
}

test.describe.serial('aceptación funcional comercial (E2E-05/07/09, RFQ-02/03/05/06/10/15)', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si contra un Supabase de pruebas.',
  );

  let contexto: ContextoAceptacion | null = null;

  test.beforeAll(async () => {
    contexto = await prepararContexto();
  });
  test.afterAll(async () => {
    if (contexto) await limpiarContexto(contexto);
  });

  test('cadena comercial con descuento, área y externo hasta la orden (E2E-05/E2E-07)', async ({ page }) => {
    if (!contexto) throw new Error('Sin contexto E2E');
    const datos = contexto;
    await iniciarSesion(page, datos);

    await crearRfqSimple(page, datos, { empresa: datos.empresa });
    const { oportunidadId, ordenId, ordenFolio } = await crearOrdenDesdeRfq(datos.admin, datos, datos.empresa);

    // Efectos persistidos: una sola cadena cotización→OP, con AR no cobrable (D-04).
    const { data: oportunidad } = await datos.admin
      .from('pipeline')
      .select('id, etapa, cliente_id, es_orden_interna, fecha_seguimiento, proximo_paso, vendedor_id')
      .eq('id', oportunidadId)
      .single();
    expect(oportunidad?.etapa).toBe('ganada');
    expect(oportunidad?.cliente_id).toBe(datos.clienteId);
    expect(oportunidad?.es_orden_interna).toBe(false);
    expect(oportunidad?.vendedor_id).toBe(datos.usuarioId);
    expect(oportunidad?.fecha_seguimiento).toBe('2026-10-01');
    expect(oportunidad?.proximo_paso).toBe('Llamar para confirmar la orden de compra');

    const { data: orden } = await datos.admin
      .from('ordenes_produccion')
      .select('id, folio, estado, es_interna')
      .eq('id', ordenId)
      .single();
    expect(orden?.folio).toBe(ordenFolio);
    expect(orden?.estado).toBe('borrador');
    expect(orden?.es_interna).toBe(false);

    const { data: partidas } = await datos.admin
      .from('partidas_orden_produccion')
      .select('codigo_pieza, area_trabajo_codigo, procesos, es_externo, proveedor_externo, cantidad_solicitada, maquina_asignada')
      .eq('orden_id', ordenId)
      .order('codigo_pieza');
    expect(partidas).toHaveLength(2);
    expect(partidas?.[0]).toMatchObject({
      codigo_pieza: 'COT-001',
      area_trabajo_codigo: datos.areaCodigo,
      es_externo: false,
      proveedor_externo: null,
      maquina_asignada: datos.estacionCodigo,
    });
    expect(partidas?.[0]?.procesos).toEqual(['corte']);
    expect(partidas?.[1]).toMatchObject({ codigo_pieza: 'COT-002', es_externo: true, proveedor_externo: 'Taller QA Externo' });
    expect(partidas?.some((partida) => partida.codigo_pieza === 'COT-003')).toBe(false);

    // D-04: la aprobación crea la AR no cobrable; será cobrable al entregar.
    const { data: cuentas } = await datos.admin
      .from('cuentas_por_cobrar')
      .select('monto_total, estado, cobrable_desde, fecha_vencimiento')
      .eq('orden_id', ordenId);
    expect(cuentas).toHaveLength(1);
    expect(cuentas?.[0]).toMatchObject({
      estado: 'pendiente',
      cobrable_desde: null,
      fecha_vencimiento: null,
    });
    expect(Number(cuentas?.[0]?.monto_total)).toBeGreaterThan(0);

    // RFQ-10: la orden muestra el folio comercial de su cotización.
    await page.goto('/ordenes');
    const fila = page.getByRole('row', { name: new RegExp(ordenFolio) });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('CNC-');

    // OBS-06/ORD-09: el taller ve y sube documentos de la orden desde el piso.
    await page.goto('/produccion');
    await page
      .getByTestId(`tarjeta-produccion-${ordenId}`)
      .getByRole('button', { name: 'Operar orden' })
      .click();
    const panelEntregables = page.getByTestId('panel-documentos-orden');
    await expect(panelEntregables).toBeVisible();
    await expect(panelEntregables).toContainText('Sin documentos en la carpeta de la orden.');
    await panelEntregables.getByLabel('Archivo de la orden').setInputFiles({
      name: 'E2E-PLANO.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'),
    });
    await panelEntregables.getByRole('button', { name: 'Subir', exact: true }).click();
    await expect(panelEntregables.getByRole('status')).toContainText('E2E-PLANO.pdf subido');
    await expect(panelEntregables.getByTestId('lista-documentos-orden')).toContainText('E2E-PLANO.pdf');
    const esperaFirma = page.context().waitForEvent('request', (solicitud) =>
      solicitud.url().includes('/storage/v1/object/sign/adjuntos-cotizacion/'),
    );
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      panelEntregables.getByRole('button', { name: 'Abrir' }).first().click(),
    ]);
    await esperaFirma;
    await popup.close();
  });

  test('trabajo interno TI: sin AR comercial e identificado en órdenes (E2E-09)', async ({ page }) => {
    if (!contexto) throw new Error('Sin contexto E2E');
    const datos = contexto;
    const empresaInterna = `${datos.empresa} TI`;
    await iniciarSesion(page, datos);
    await crearRfqSimple(page, datos, { empresa: empresaInterna, interna: true });
    const { oportunidadId, ordenId, ordenFolio } = await crearOrdenDesdeRfq(
      datos.admin,
      datos,
      empresaInterna,
    );

    const { data: oportunidad } = await datos.admin
      .from('pipeline')
      .select('id, es_orden_interna')
      .eq('id', oportunidadId)
      .single();
    expect(oportunidad?.es_orden_interna).toBe(true);

    const { data: orden } = await datos.admin
      .from('ordenes_produccion')
      .select('id, folio, es_interna')
      .eq('id', ordenId)
      .single();
    expect(orden?.folio).toBe(ordenFolio);
    expect(orden?.es_interna).toBe(true);

    // La cobranza comercial rechaza una OP interna (RFQ-09).
    const { error } = await datos.admin.rpc('abrir_cuenta_por_cobrar', {
      p_orden_id: ordenId,
      p_monto_total: 500,
      p_moneda: 'MXN',
      p_tipo_cambio_origen: 1,
      p_fecha_vencimiento: '2100-01-31T00:00:00.000Z',
    });
    expect(error?.message).toContain('orden_interna_sin_cobranza');

    await page.goto('/ordenes');
    const fila = page.getByRole('row', { name: new RegExp(ordenFolio) });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('TI');
  });
});
