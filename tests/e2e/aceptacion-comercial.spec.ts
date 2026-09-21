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
};

/**
 * Prepara el actor y los catálogos mínimos de la cadena comercial: un admin
 * ficticio, un cliente del catálogo y un área de taller. Nada pertenece a
 * producción: son datos QA-FUNC locales con limpieza posterior por ID.
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

  return { admin, correo, contrasena, usuarioId: usuario.user.id, clienteId: cliente.id, empresa, areaCodigo };
}

async function limpiarContexto(contexto: ContextoAceptacion): Promise<void> {
  const { admin, clienteId, areaCodigo, usuarioId } = contexto;
  const { data: oportunidades } = await admin
    .from('pipeline')
    .select('id')
    .eq('cliente_id', clienteId);
  const idsOportunidades = (oportunidades ?? []).map((fila) => fila.id);
  // OBS-06/ORD-09: los documentos subidos desde el piso viven en el bucket.
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
    await admin.from('pipeline').delete().in('id', idsOportunidades);
  }
  await admin.from('clientes').delete().eq('id', clienteId);
  await admin.from('areas_trabajo_config').delete().eq('codigo', areaCodigo);
  await admin.auth.admin.deleteUser(usuarioId);
}

async function iniciarSesion(pagina: Page, contexto: ContextoAceptacion): Promise<void> {
  await pagina.goto('/iniciar-sesion');
  await pagina.getByLabel('Correo electrónico').fill(contexto.correo);
  await pagina.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasena);
  await pagina.getByRole('button', { name: 'Iniciar sesión' }).click();
  await pagina.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
}

/** Crea una oportunidad desde el tablero con una sola línea y datos mínimos. */
async function crearOportunidadSimple(
  pagina: Page,
  contexto: ContextoAceptacion,
  opciones: { empresa: string; interna?: boolean; descripcion: string; precio: string },
): Promise<void> {
  await pagina.goto('/pipeline');
  await pagina.getByRole('button', { name: 'Nueva oportunidad' }).click();
  await pagina.getByLabel('Nombre del contacto').fill('Ana QA');
  await pagina.getByLabel('Empresa').fill(opciones.empresa);
  await pagina.getByLabel('Correo (opcional)').fill('ana.qa@qa-func.local');
  await pagina.getByLabel('Cliente (opcional)').fill(contexto.empresa);
  await pagina.getByRole('button', { name: new RegExp(contexto.empresa) }).first().click();
  if (opciones.interna) {
    await pagina.getByLabel(/Orden interna \(TI\)/).check();
  }
  await pagina.getByRole('button', { name: 'Crear oportunidad' }).click();

  const tarjeta = pagina.locator('article', { hasText: opciones.empresa });
  await expect(tarjeta).toBeVisible();
  await tarjeta.getByRole('button', { name: 'Cotización' }).click();
  await expect(pagina.getByLabel('Descripción')).toBeVisible();
  await pagina.getByLabel('Descripción').fill(opciones.descripcion);
  await pagina.getByLabel('Cantidad').fill('1');
  await pagina.getByLabel('Precio unitario').fill(opciones.precio);
  await pagina.getByRole('button', { name: 'Guardar cotización' }).click();
    await expect(pagina.getByText('Cotización guardada.')).toBeVisible();
    await pagina.keyboard.press('Escape');
    await expect(pagina.getByRole('dialog')).toHaveCount(0);
  }

/** Avanza una etapa adyacente y confirma el cambio en la base (con reintento). */
async function avanzarEtapa(
  pagina: Page,
  admin: SupabaseClient<Database>,
  empresa: string,
  etiqueta: string,
  etapaEsperada: string,
): Promise<void> {
  for (let intento = 0; intento < 5; intento += 1) {
    const tarjeta = pagina.locator('article', { hasText: empresa });
    await expect(tarjeta).toBeVisible({ timeout: 10_000 });
    const boton = tarjeta.getByRole('button', { name: etiqueta });
    await expect(boton).toBeEnabled({ timeout: 10_000 });
    await boton.click();
    try {
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from('pipeline')
              .select('etapa')
              .eq('empresa', empresa)
              .single();
            return data?.etapa ?? null;
          },
          { timeout: 5_000 },
        )
        .toBe(etapaEsperada);
      return;
    } catch {
      // La tarjeta pudo re-montarse (refetch) y perder el clic: se reintenta.
      await pagina.waitForTimeout(400);
      await pagina.reload();
    }
  }
  throw new Error(`No se pudo avanzar a la etapa "${etapaEsperada}" por la interfaz`);
}

/** Avanza la oportunidad por etapas adyacentes hasta `ganada` y crea la OP. */
async function ganarOportunidad(
  pagina: Page,
  admin: SupabaseClient<Database>,
  empresa: string,
): Promise<void> {
  await avanzarEtapa(pagina, admin, empresa, 'Contactado', 'contactado');
  await avanzarEtapa(pagina, admin, empresa, 'Cotizado', 'cotizado');
  await avanzarEtapa(pagina, admin, empresa, 'Negociación', 'negociacion');

  for (let intento = 0; intento < 4; intento += 1) {
    const tarjeta = pagina.locator('article', { hasText: empresa });
    const ganar = tarjeta.getByRole('button', { name: 'Ganada' });
    await expect(ganar).toBeEnabled({ timeout: 10_000 });
    await ganar.click();
    await tarjeta.getByLabel('Fecha de compromiso de producción').fill('2099-12-31T10:00');
    await tarjeta.getByRole('button', { name: 'Confirmar ganada y crear OP' }).click();
    try {
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from('pipeline')
              .select('etapa')
              .eq('empresa', empresa)
              .single();
            return data?.etapa ?? null;
          },
          { timeout: 5_000 },
        )
        .toBe('ganada');
      return;
    } catch {
      await pagina.waitForTimeout(400);
      await pagina.reload();
    }
  }
  throw new Error('No se pudo marcar la oportunidad como ganada por la interfaz');
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

    await page.goto('/pipeline');
    await page.getByRole('button', { name: 'Nueva oportunidad' }).click();
    await page.getByLabel('Nombre del contacto').fill('Ana QA');
    await page.getByLabel('Empresa').fill(datos.empresa);
    await page.getByLabel('Correo (opcional)').fill('ana.qa@qa-func.local');
    await page.getByLabel('Cliente (opcional)').fill(datos.empresa);
    await page.getByRole('button', { name: new RegExp(datos.empresa) }).first().click();
    await page.getByRole('button', { name: 'Crear oportunidad' }).click();

    const tarjeta = page.locator('article', { hasText: datos.empresa });
    await expect(tarjeta).toBeVisible();
    await tarjeta.getByRole('button', { name: 'Cotización' }).click();
    await expect(page.getByLabel('Descripción')).toBeVisible();

    // Línea 1: fabricable con área del catálogo y procesos.
    await page.getByLabel('Descripción').nth(0).fill('Soporte QA');
    await page.getByLabel('Cantidad').nth(0).fill('10');
    await page.getByLabel('Precio unitario').nth(0).fill('100');
    await page.getByLabel('Área / departamento (opcional)').nth(0).selectOption(datos.areaCodigo);
    await page.getByLabel('Procesos (opcional)').nth(0).fill('corte');

    // Línea 2: trabajo externo con proveedor.
    await page.getByRole('button', { name: 'Agregar línea' }).click();
    await page.getByLabel('Descripción').nth(1).fill('Servicio externo QA');
    await page.getByLabel('Cantidad').nth(1).fill('1');
    await page.getByLabel('Precio unitario').nth(1).fill('300');
    await page.locator('#linea-1-externo').check();
    await page.getByLabel('Proveedor externo').fill('Taller QA Externo');

    // Línea 3: descuento removible que resta del subtotal antes del IVA.
    await page.getByRole('button', { name: 'Agregar descuento' }).click();
    await page.getByLabel('Monto del descuento').fill('100');

    // 1000 + 300 − 100 = 1200; IVA 16% = 192; total 1392.
    await expect(page.getByText('$1,392.00')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar cotización' }).click();
    await expect(page.getByText('Cotización guardada.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await ganarOportunidad(page, datos.admin, datos.empresa);

    // Efectos persistidos: una sola cadena cotización→OP, con AR no cobrable (D-04).
    const { data: oportunidad } = await datos.admin
      .from('pipeline')
      .select('id, etapa, cliente_id, es_orden_interna')
      .eq('empresa', datos.empresa)
      .single();
    expect(oportunidad?.etapa).toBe('ganada');
    expect(oportunidad?.cliente_id).toBe(datos.clienteId);
    expect(oportunidad?.es_orden_interna).toBe(false);

    const { data: orden } = await datos.admin
      .from('ordenes_produccion')
      .select('id, folio, estado, es_interna')
      .eq('cotizacion_id', oportunidad!.id)
      .single();
    expect(orden?.estado).toBe('borrador');
    expect(orden?.es_interna).toBe(false);

    const { data: partidas } = await datos.admin
      .from('partidas_orden_produccion')
      .select('codigo_pieza, area_trabajo_codigo, procesos, es_externo, proveedor_externo, cantidad_solicitada')
      .eq('orden_id', orden!.id)
      .order('codigo_pieza');
    expect(partidas).toHaveLength(2);
    expect(partidas?.[0]).toMatchObject({
      codigo_pieza: 'COT-001',
      area_trabajo_codigo: datos.areaCodigo,
      es_externo: false,
      proveedor_externo: null,
    });
    expect(partidas?.[0]?.procesos).toEqual(['corte']);
    expect(partidas?.[1]).toMatchObject({ codigo_pieza: 'COT-002', es_externo: true, proveedor_externo: 'Taller QA Externo' });
    expect(partidas?.some((partida) => partida.codigo_pieza === 'COT-003')).toBe(false);

    // D-04: la aprobación crea la AR no cobrable; será cobrable al entregar.
    const { data: cuentas } = await datos.admin
      .from('cuentas_por_cobrar')
      .select('monto_total, estado, cobrable_desde, fecha_vencimiento')
      .eq('orden_id', orden!.id);
    expect(cuentas).toHaveLength(1);
    expect(cuentas?.[0]).toMatchObject({
      estado: 'pendiente',
      cobrable_desde: null,
      fecha_vencimiento: null,
    });
    expect(Number(cuentas?.[0]?.monto_total)).toBeGreaterThan(0);

    // RFQ-10: la orden muestra el folio comercial de su cotización.
    await page.goto('/ordenes');
    const fila = page.getByRole('row', { name: new RegExp(orden!.folio) });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('CNC-');

    // OBS-06/ORD-09: el taller ve y sube documentos de la orden desde el piso.
    await page.goto('/produccion');
    await page
      .getByTestId(`tarjeta-produccion-${orden!.id}`)
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
    await crearOportunidadSimple(page, datos, {
      empresa: empresaInterna,
      interna: true,
      descripcion: 'Trabajo interno QA',
      precio: '500',
    });
    await ganarOportunidad(page, datos.admin, empresaInterna);

    const { data: oportunidad } = await datos.admin
      .from('pipeline')
      .select('id, es_orden_interna')
      .eq('empresa', empresaInterna)
      .single();
    expect(oportunidad?.es_orden_interna).toBe(true);

    const { data: orden } = await datos.admin
      .from('ordenes_produccion')
      .select('id, folio, es_interna')
      .eq('cotizacion_id', oportunidad!.id)
      .single();
    expect(orden?.es_interna).toBe(true);

    // La cobranza comercial rechaza una OP interna (RFQ-09).
    const { error } = await datos.admin.rpc('abrir_cuenta_por_cobrar', {
      p_orden_id: orden!.id,
      p_monto_total: 500,
      p_moneda: 'MXN',
      p_tipo_cambio_origen: 1,
      p_fecha_vencimiento: '2100-01-31T00:00:00.000Z',
    });
    expect(error?.message).toContain('orden_interna_sin_cobranza');

    await page.goto('/ordenes');
    const fila = page.getByRole('row', { name: new RegExp(orden!.folio) });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('TI');
  });
});
