import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';
import { hoyIso, sumarDias } from '@/modulos/planeacion/utilidades/fechas-planeacion';

// playwright.config.ts exige URL de loopback antes de importar esta prueba.
const correoAdmin = process.env.E2E_CONFIGURACION_ADMIN_EMAIL;
const contrasenaAdmin = process.env.E2E_CONFIGURACION_ADMIN_PASSWORD;
const carpetaVisual = '.ai-shared/qa/sii-b4-ola2/visual';

function clienteAdmin(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function iniciarSesion(page: Page): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(correoAdmin!);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasenaAdmin!);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => ['/dashboard', '/tablero'].includes(url.pathname));
}

type Contexto = {
  admin: SupabaseClient<Database>;
  sufijo: string;
  empresa: string;
  clienteId: string;
  contactoId: string;
  materialId: string;
  espesorId: string;
  procesoId: string;
  grupoId: string;
  rfqId: string;
  rfqItemIds: string[];
  propuestaId?: string;
  revisionIds: string[];
};

async function prepararContexto(): Promise<Contexto> {
  const admin = clienteAdmin();
  const sufijo = randomUUID().slice(0, 8).toUpperCase();
  const empresa = `QA Propuestas ${sufijo}`;

  const cliente = await admin
    .from('clientes')
    .insert({ razon_social: empresa, nombre_comercial: `Propuestas ${sufijo}`, estado: 'activo' })
    .select('id')
    .single();
  if (cliente.error || !cliente.data) throw new Error(cliente.error?.message ?? 'Sin cliente');

  const contacto = await admin
    .from('contactos_cliente')
    .insert({
      cliente_id: cliente.data.id,
      nombre: `Contacto Propuestas ${sufijo}`,
      correo: `contacto-${sufijo.toLowerCase()}@cliente.mx`,
      es_principal: true,
      activo: true,
    })
    .select('id')
    .single();
  if (contacto.error || !contacto.data) throw new Error(contacto.error?.message ?? 'Sin contacto');

  const material = await admin
    .from('catalogo_materiales')
    .insert({ codigo: `E2EP_${sufijo}`, nombre: `Material E2E P ${sufijo}`, activo: true })
    .select('id')
    .single();
  if (material.error || !material.data) throw new Error(material.error?.message ?? 'Sin material');

  const espesor = await admin
    .from('catalogo_espesores')
    .insert({ material_id: material.data.id, etiqueta: '6 mm', espesor_mm: 6, activo: true })
    .select('id')
    .single();
  if (espesor.error || !espesor.data) throw new Error(espesor.error?.message ?? 'Sin espesor');

  // Obs. cliente 2026-10-13: validar exige ruteo costeado por proceso, así que el
  // grupo de equipo del proceso lleva tarifa (se sugiere solo al abrir el ruteo).
  const grupo = await admin
    .from('grupos_equipo')
    .insert({
      codigo: `E2EP_GRP_${sufijo}`,
      nombre: `Grupo E2E P ${sufijo}`,
      orden: 99,
      tarifa_hora: 100,
      tarifa_moneda: 'MXN',
    })
    .select('id')
    .single();
  if (grupo.error || !grupo.data) throw new Error(grupo.error?.message ?? 'Sin grupo de equipo');

  const proceso = await admin
    .from('catalogo_procesos')
    .insert({
      codigo: `E2EP_${sufijo.slice(0, 5)}`,
      nombre: `Proceso E2E P ${sufijo}`,
      prefijo_corrida: 'QPE',
      requiere_archivo_tecnico: false,
      grupo_equipo_id: grupo.data.id,
      activo: true,
    })
    .select('id')
    .single();
  if (proceso.error || !proceso.data) throw new Error(proceso.error?.message ?? 'Sin proceso');

  const rfq = await admin
    .from('pipeline')
    .insert({
      folio_op: `OP-E2EP-${sufijo}`,
      etapa: 'negociacion',
      estado_rfq: 'READY_FOR_PROPOSAL',
      nombre_contacto: `Contacto Propuestas ${sufijo}`,
      empresa,
      cliente_id: cliente.data.id,
      contacto_id: contacto.data.id,
      vendedor_id: (await usuarioAdminId(admin)),
      moneda: 'MXN',
      iva_porcentaje: 16,
      condiciones_pago: 'contado',
      descripcion_general: `Solicitud propuestas ${sufijo}`,
      canal: 'correo',
      fecha_solicitud: hoyIso(),
      proxima_accion_codigo: 'FOLLOW_UP',
      fecha_proxima_accion: sumarDias(hoyIso(), 7),
      responsable_proxima_accion_id: await usuarioAdminId(admin),
    })
    .select('id')
    .single();
  if (rfq.error || !rfq.data) throw new Error(rfq.error?.message ?? 'Sin RFQ');

  const items = await admin
    .from('rfq_items')
    .insert([
      {
        rfq_id: rfq.data.id,
        numero: 1,
        codigo: 'IT01',
        descripcion: 'Pieza propuesta E2E',
        cantidad: 10,
        material_id: material.data.id,
        espesor_id: espesor.data.id,
      },
      {
        rfq_id: rfq.data.id,
        numero: 2,
        codigo: 'IT02',
        descripcion: 'Servicio propuesta E2E',
        cantidad: 1,
      },
    ])
    .select('id');
  if (items.error || !items.data) throw new Error(items.error?.message ?? 'Sin ítems');

  const operaciones = await admin.from('rfq_item_operaciones').insert(
    items.data.map((item) => ({
      rfq_item_id: item.id,
      proceso_id: proceso.data.id,
      orden: 0,
    })),
  );
  if (operaciones.error) throw new Error(operaciones.error.message);

  return {
    admin,
    sufijo,
    empresa,
    clienteId: cliente.data.id,
    contactoId: contacto.data.id,
    materialId: material.data.id,
    espesorId: espesor.data.id,
    procesoId: proceso.data.id,
    grupoId: grupo.data.id,
    rfqId: rfq.data.id,
    rfqItemIds: items.data.map((item) => item.id),
    revisionIds: [],
  };
}

async function idItemPropuesta(
  admin: SupabaseClient<Database>,
  revisionId: string,
  codigo: string,
): Promise<string> {
  const { data, error } = await admin
    .from('propuesta_items')
    .select('id')
    .eq('revision_id', revisionId)
    .eq('codigo', codigo)
    .single();
  if (error || !data) throw new Error(error?.message ?? `Sin ítem ${codigo}`);
  return data.id;
}

async function usuarioAdminId(admin: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await admin
    .from('usuarios')
    .select('id')
    .eq('rol', 'admin')
    .eq('activo', true)
    .limit(1)
    .single();
  if (error || !data) throw new Error('Sin administrador activo en el stack local');
  return data.id;
}

async function limpiarContexto(contexto: Contexto): Promise<void> {
  const { admin } = contexto;
  if (contexto.propuestaId) {
    const { data: revisiones } = await admin
      .from('propuesta_revisiones')
      .select('id')
      .eq('propuesta_id', contexto.propuestaId);
    const idsRevisiones = (revisiones ?? []).map((revision) => revision.id);
    const { data: itemsPropuesta } = idsRevisiones.length > 0
      ? await admin.from('propuesta_items').select('id').in('revision_id', idsRevisiones)
      : { data: [] as { id: string }[] };
    const idsItemsPropuesta = (itemsPropuesta ?? []).map((item) => item.id);
    if (idsItemsPropuesta.length > 0) {
      const { data: archivosItems } = await admin
        .from('archivos')
        .select('bucket, ruta_storage')
        .eq('entidad', 'propuesta_item')
        .in('entidad_id', idsItemsPropuesta);
      for (const bucket of new Set((archivosItems ?? []).map((archivo) => archivo.bucket))) {
        const rutas = (archivosItems ?? [])
          .filter((archivo) => archivo.bucket === bucket)
          .map((archivo) => archivo.ruta_storage);
        if (rutas.length > 0) await admin.storage.from(bucket).remove(rutas);
      }
      await admin.from('archivos').delete().eq('entidad', 'propuesta_item').in(
        'entidad_id',
        idsItemsPropuesta,
      );
    }
    for (const revision of revisiones ?? []) {
      for (const bucket of ['propuestas-pdf', 'propuestas-archivos'] as const) {
        const { data: objetos } = await admin.storage
          .from(bucket)
          .list(`propuesta_revision/${revision.id}`, { limit: 100 });
        const rutas = (objetos ?? [])
          .filter((objeto) => objeto.id !== null)
          .map((objeto) => `propuesta_revision/${revision.id}/${objeto.name}`);
        if (rutas.length > 0) await admin.storage.from(bucket).remove(rutas);
      }
    }
    await admin.from('archivos').delete().eq('entidad', 'propuesta_revision').in(
      'entidad_id',
      (revisiones ?? []).map((revision) => revision.id),
    );
    // La Orden creada automáticamente al aceptar debe retirarse antes de borrar
    // la propuesta (FK sin cascada desde `ordenes_produccion`).
    if (idsRevisiones.length > 0) {
      const { data: ordenes } = await admin
        .from('ordenes_produccion')
        .select('id')
        .in('propuesta_revision_id', idsRevisiones);
      const idsOrdenes = (ordenes ?? []).map((orden) => orden.id);
      if (idsOrdenes.length > 0) {
        await admin.from('cuentas_por_cobrar').delete().in('orden_id', idsOrdenes);
        await admin.from('sesiones_trabajo').delete().in('orden_id', idsOrdenes);
        await admin.from('programacion_areas').delete().in('orden_id', idsOrdenes);
        await admin.from('orden_eventos_cambio').delete().in('orden_id', idsOrdenes);
        await admin.from('ordenes_produccion').delete().in('id', idsOrdenes);
      }
    }
    await admin.from('propuestas').delete().eq('id', contexto.propuestaId);
  }
  await admin.from('pipeline').delete().eq('id', contexto.rfqId);
  await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_procesos').eq('entidad_id', contexto.procesoId);
  await admin.from('versiones_catalogo').delete().eq('entidad', 'grupos_equipo').eq('entidad_id', contexto.grupoId);
  await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_espesores').eq('entidad_id', contexto.espesorId);
  await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_materiales').eq('entidad_id', contexto.materialId);
  await admin.from('catalogo_espesores').update({ activo: false }).eq('id', contexto.espesorId);
  await admin.from('catalogo_procesos').update({ activo: false }).eq('id', contexto.procesoId);
  await admin.from('grupos_equipo').update({ activo: false }).eq('id', contexto.grupoId);
  await admin.from('catalogo_materiales').update({ activo: false }).eq('id', contexto.materialId);
  await admin.from('contactos_cliente').delete().eq('id', contexto.contactoId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
}

async function capturar(page: Page, nombre: string): Promise<void> {
  if (!['1', 'si'].includes(process.env.E2E_CAPTURAR_VISUAL ?? '')) return;
  for (const [vista, ancho, alto] of [
    ['1440', 1440, 900],
    ['768', 768, 1024],
  ] as const) {
    await page.setViewportSize({ width: ancho, height: alto });
    for (const tema of ['claro', 'oscuro'] as const) {
      await page
        .locator('html')
        .evaluate((elemento, oscuro) => elemento.classList.toggle('dark', oscuro), tema === 'oscuro');
      await page.screenshot({
        path: `${carpetaVisual}/${nombre}-${vista}-${tema}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));
}

test.describe.serial('SII-B4 ola 2 — propuestas por UI: PDF, envío, revisiones y aceptación', () => {
  test('Rev A admite ítems nuevos y no se valida sin ruteo costeado ni archivo', async ({ page }) => {
    test.skip(!correoAdmin || !contrasenaAdmin, 'Requiere administrador del stack local');
    const contexto = await prepararContexto();
    const { admin, rfqId } = contexto;

    try {
      await iniciarSesion(page);
      await page.goto(`/rfq?rfq=${rfqId}`);
      await page.getByTestId('ficha-rfq').getByRole('tab', { name: 'Propuestas' }).click();
      await page.getByRole('button', { name: 'Crear propuesta' }).click();
      const ficha = page.getByTestId('ficha-propuesta');
      await expect(ficha).toBeVisible();

      const propuesta = await admin.from('propuestas').select('id').eq('rfq_id', rfqId).single();
      if (propuesta.error || !propuesta.data) throw new Error('Propuesta no persistida');
      contexto.propuestaId = propuesta.data.id;
      const revisionA = await admin
        .from('propuesta_revisiones')
        .select('id')
        .eq('propuesta_id', propuesta.data.id)
        .eq('letra', 'A')
        .single();
      if (revisionA.error || !revisionA.data) throw new Error('Revisión A no persistida');
      contexto.revisionIds.push(revisionA.data.id);

      // Obs. cliente 2026-10-13: la revisión A ya ofrece «Agregar ítem» (DC-08).
      await page.getByRole('tab', { name: 'Ítems' }).click();
      await page.locator('#alta-item-descripcion').fill('Ítem agregado en revisión A');
      await page.locator('#alta-item-cantidad').fill('2');
      await page.locator('#alta-item-material').selectOption(contexto.materialId);
      await page.locator('#alta-item-espesor').selectOption(contexto.espesorId);
      await page.getByRole('button', { name: 'Agregar ítem' }).click();
      await expect(page.getByText('Ítem IT03 agregado en la revisión A.')).toBeVisible();
      await expect(page.getByTestId('material-IT03')).toContainText(`Material E2E P ${contexto.sufijo}`);
      await expect(page.getByTestId('espesor-IT03')).toContainText('6 mm');

      const itemNuevo = await admin
        .from('propuesta_items')
        .select('codigo, revision_origen_id, rfq_item_id, material_id, espesor_id')
        .eq('revision_id', revisionA.data.id)
        .eq('codigo', 'IT03')
        .single();
      expect(itemNuevo.error).toBeNull();
      expect(itemNuevo.data).toMatchObject({
        codigo: 'IT03',
        revision_origen_id: revisionA.data.id,
        rfq_item_id: null,
        material_id: contexto.materialId,
        espesor_id: contexto.espesorId,
      });
      const itemsRfq = await admin
        .from('rfq_items')
        .select('id', { count: 'exact', head: true })
        .eq('rfq_id', rfqId);
      expect(itemsRfq.count).toBe(2);

      // El ítem nuevo no tiene ruteo y la propuesta no tiene archivos: no se valida.
      await expect(ficha.getByRole('button', { name: 'Validar', exact: true }).first()).toBeDisabled();
      const faltantes = ficha.getByTestId('faltantes-validacion');
      await expect(faltantes).toContainText('ítem IT03: ruteo por proceso');
      await expect(faltantes).toContainText('al menos un archivo');
      await capturar(page, 'propuesta-faltantes-validar');

      // Los atajos llevan a la pestaña que corresponde.
      await faltantes.getByRole('button', { name: 'Ir a Archivos' }).click();
      await expect(page.getByTestId('archivo-propuesta-requerido')).toBeVisible();
    } finally {
      await limpiarContexto(contexto);
    }
  });

  test('RFQ LISTO → propuesta A → editar → validar → PDF → enviar → B → aceptar A → venta', async ({
    page,
  }) => {
    test.skip(!correoAdmin || !contrasenaAdmin, 'Requiere administrador del stack local');
    const contexto = await prepararContexto();
    const { admin, rfqId } = contexto;

    try {
      await iniciarSesion(page);

      // 1. Navegar por el RFQ no crea una propuesta implícita.
      await page.goto(`/rfq?rfq=${rfqId}`);
      const fichaRfq = page.getByTestId('ficha-rfq');
      await expect(fichaRfq).toBeVisible();
      await fichaRfq.getByRole('tab', { name: 'Resumen' }).click();
      await fichaRfq.getByRole('tab', { name: 'Ítems' }).click();
      await fichaRfq.getByRole('tab', { name: 'Archivos' }).click();
      await fichaRfq.getByRole('tab', { name: 'Propuestas' }).click();

      const propuestasAntes = await admin
        .from('propuestas')
        .select('id', { count: 'exact', head: true })
        .eq('rfq_id', rfqId);
      expect(propuestasAntes.error).toBeNull();
      expect(propuestasAntes.count).toBe(0);

      // 2. Solo la acción explícita crea Propuesta Rev A.
      await page.getByRole('button', { name: 'Crear propuesta' }).click();

      const ficha = page.getByTestId('ficha-propuesta');
      await expect(ficha).toBeVisible();
      await expect(ficha).toContainText('CNC-');
      const propuesta = await admin
        .from('propuestas')
        .select('id, folio_cnc')
        .eq('rfq_id', rfqId)
        .single();
      if (propuesta.error || !propuesta.data) throw new Error('Propuesta no persistida');
      contexto.propuestaId = propuesta.data.id;
      const revisionA = await admin
        .from('propuesta_revisiones')
        .select('id, folio_revision')
        .eq('propuesta_id', propuesta.data.id)
        .eq('letra', 'A')
        .single();
      if (revisionA.error || !revisionA.data) throw new Error('Revisión A no persistida');
      contexto.revisionIds.push(revisionA.data.id);
      await expect(ficha).toContainText(revisionA.data.folio_revision);

      // Obs. cliente 2026-10-12 (3): la cola muestra la columna RFQ con el
      // folio del RFQ de origen y enlaza a su ficha.
      await page.goto('/propuestas');
      const rfqFila = await admin
        .from('pipeline')
        .select('folio_rfq, folio_op')
        .eq('id', rfqId)
        .single();
      const folioRfq = rfqFila.data?.folio_rfq ?? rfqFila.data?.folio_op;
      expect(folioRfq).toBeTruthy();
      const filaCola = page.getByRole('row', { name: new RegExp(propuesta.data.folio_cnc) });
      await expect(filaCola.getByRole('link', { name: folioRfq! })).toHaveAttribute(
        'href',
        `/rfq?rfq=${rfqId}`,
      );
      await page.goto(`/propuestas?propuesta=${propuesta.data.id}`);
      await expect(ficha).toBeVisible();

      // C2.1: crear Rev A registra la versión final y congela la definición del RFQ.
      const versionFinal = await admin
        .from('rfq_versiones')
        .select('causa')
        .eq('rfq_id', rfqId)
        .eq('causa', 'CREAR_REV_A');
      expect(versionFinal.error).toBeNull();
      expect(versionFinal.data).toHaveLength(1);
      const cambioTardio = await admin
        .from('pipeline')
        .update({ descripcion_general: 'Cambio tras Rev A' })
        .eq('id', rfqId);
      expect(cambioTardio.error?.message).toContain('rfq_congelado');

      // 3. Editar ítems (precio) y costos.
      await page.getByRole('tab', { name: 'Ítems' }).click();
      // Obs. cliente 2026-10-13: la tabla muestra el material y el espesor del RFQ.
      await expect(page.getByTestId('material-IT01')).toContainText(`Material E2E P ${contexto.sufijo}`);
      await expect(page.getByTestId('espesor-IT01')).toContainText('6 mm');
      await expect(page.getByTestId('item-propuesta-' + (await idItemPropuesta(admin, revisionA.data.id, 'IT01')))).toContainText('Heredado del RFQ');
      await page.getByLabel('Precio IT01').fill('100');
      await page.getByRole('row', { name: /IT01/ }).getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('status')).toContainText('IT01');

      await page.getByRole('tab', { name: 'Ruteo/Costeo' }).click();
      // Obs. cliente: etiquetas visibles del ruteo y desglose de fabricación.
      await expect(page.getByText('Preparación (h)').first()).toBeVisible();
      await expect(page.getByText('Operación (h)').first()).toBeVisible();
      await expect(page.getByText('Costo total estimado de fabricación')).toBeVisible();
      await capturar(page, 'ruteo-etiquetas-costeo');

      // Obs. cliente 2026-10-13: sin máquina; el grupo de equipo se sugiere desde el
      // proceso aunque la fila nazca del RFQ; solo Material y Otros en el costeo.
      await expect(page.getByLabel(/^Máquina IT01/)).toHaveCount(0);
      await expect(page.getByLabel('Grupo de equipo IT01 fila 1')).toHaveValue(contexto.grupoId);
      await expect(page.getByLabel('Grupo de equipo IT02 fila 1')).toHaveValue(contexto.grupoId);
      await expect(page.getByLabel('Costo Máquina')).toHaveCount(0);
      await expect(page.getByLabel('Costo Mano de obra')).toHaveCount(0);

      // Validar está bloqueado y la ficha dice qué falta (en rojo suave).
      const botonValidar = ficha.getByRole('button', { name: 'Validar', exact: true }).first();
      await expect(botonValidar).toBeDisabled();
      const faltantes = ficha.getByTestId('faltantes-validacion');
      await expect(faltantes).toContainText('al menos un archivo');
      await expect(faltantes).toContainText('ítem IT01: costear el ruteo');

      // Costear antes de guardar lo sugerido no está permitido.
      await page.getByRole('button', { name: 'Costear ruteo' }).click();
      await expect(page.getByRole('status')).toContainText('Guarda el ruteo de');
      const botonesGuardarRuteo = page.getByRole('button', { name: 'Guardar ruteo' });
      await botonesGuardarRuteo.nth(0).click();
      await expect(page.getByRole('status')).toContainText('Ruteo de IT01 guardado.');
      await botonesGuardarRuteo.nth(1).click();
      await expect(page.getByRole('status')).toContainText('Ruteo de IT02 guardado.');
      await expect(faltantes).toContainText('ítem IT01: costear el ruteo');
      await page.getByRole('button', { name: 'Costear ruteo' }).click();
      await expect(page.getByRole('status')).toContainText('Ruteo costeado');
      await expect(faltantes).not.toContainText('costear el ruteo');

      await page.getByLabel('Costo Material').fill('400');
      await page.getByLabel('Costo Otros').fill('100');
      await page.getByRole('button', { name: 'Guardar costos' }).click();
      await expect(page.getByRole('status')).toContainText('Costos guardados.');

      // 3b. Obs. cliente 2026-10-13 (6): multi-subida y «Quitar» con historial.
      await page.getByRole('tab', { name: 'Archivos' }).click();
      await expect(page.getByTestId('archivo-propuesta-requerido')).toBeVisible();
      await expect(page.getByLabel('Archivo de la propuesta')).toHaveAttribute('aria-invalid', 'true');
      const nombreUno = `ficha-general-${contexto.sufijo}.pdf`;
      const nombreDos = `ficha-auxiliar-${contexto.sufijo}.dxf`;
      await page.getByLabel('Archivo de la propuesta').setInputFiles([
        { name: nombreUno, mimeType: 'application/pdf', buffer: Buffer.alloc(1024 * 256, 0x42) },
        { name: nombreDos, mimeType: 'application/dxf', buffer: Buffer.alloc(1024 * 128, 0x43) },
      ]);
      await page.getByRole('button', { name: 'Subir archivos' }).click();
      await expect(page.getByRole('status')).toContainText('2 archivos subidos.');
      await expect(page.getByTestId('archivo-propuesta-requerido')).toBeHidden();
      const archivosSubidos = await admin
        .from('archivos')
        .select('id, nombre_original, retirado_en')
        .eq('entidad', 'propuesta_revision')
        .eq('entidad_id', revisionA.data.id)
        .in('nombre_original', [nombreUno, nombreDos]);
      expect(archivosSubidos.error).toBeNull();
      expect(archivosSubidos.data).toHaveLength(2);
      await capturar(page, 'archivos-multi-subida');

      // «Quitar» el segundo: desaparece de la vista principal y la fila queda
      // con marcador y actor (historial auditable; el binario se conserva).
      const archivoQuitar = archivosSubidos.data!.find(
        (fila) => fila.nombre_original === nombreDos,
      )!;
      await page.getByRole('button', { name: `Quitar ${nombreDos}, versión 1` }).click();
      await expect(page.getByRole('status')).toContainText('Archivo quitado.');
      await expect(page.getByTestId(`archivo-propuesta-${archivoQuitar.id}`)).toHaveCount(0);
      const retirado = await admin
        .from('archivos')
        .select('retirado_en, retirado_por')
        .eq('id', archivoQuitar.id)
        .single();
      expect(retirado.error).toBeNull();
      expect(retirado.data?.retirado_en).toBeTruthy();
      expect(retirado.data?.retirado_por).toBeTruthy();
      const logRetiro = await admin
        .from('logs')
        .select('accion, recurso_id')
        .eq('accion', 'retirar_archivo_propuesta')
        .eq('recurso_id', revisionA.data.id)
        .maybeSingle();
      expect(logRetiro.error).toBeNull();
      expect(logRetiro.data?.accion).toBe('retirar_archivo_propuesta');
      await capturar(page, 'archivos-quitar');

      // 4. Validar: obs. cliente 2026-10-11 — modal obligatorio de próxima acción.
      await ficha.getByRole('button', { name: 'Validar', exact: true }).first().click();
      const dialogoValidar = page.getByTestId('dialogo-seguimiento-propuesta');
      await expect(dialogoValidar).toBeVisible();
      await capturar(page, 'dialogo-validar-seguimiento');
      await dialogoValidar.getByRole('button', { name: 'Registrar y validar' }).click();
      await expect(ficha.getByTestId('validacion-resultado')).toContainText('Propuesta validada');
      await expect
        .poll(async () => {
          const { data } = await admin
            .from('propuesta_revisiones')
            .select('estado')
            .eq('id', revisionA.data.id)
            .single();
          return data?.estado;
        })
        .toBe('READY_TO_SEND');
      // La próxima acción quedó registrada al validar (obligatoria en el flujo).
      const seguimientoValidado = await admin
        .from('propuesta_revision_acciones')
        .select('id, codigo')
        .eq('revision_id', revisionA.data.id)
        .eq('codigo', 'FOLLOW_UP');
      expect(seguimientoValidado.error).toBeNull();
      expect(seguimientoValidado.data?.length ?? 0).toBeGreaterThan(0);

      // 5. Generar PDF v1 y verlo en la pestaña PDFs.
      await ficha.getByRole('button', { name: 'Generar PDF', exact: true }).first().click();
      await expect(page.getByText(/PDF vigente v1/)).toBeVisible();
      // Obs. PO: el resultado de «Generar PDF» debe ser visible y abrible.
      await expect(ficha.getByTestId('pdf-resultado')).toContainText('PDF generado (v1).');
      await expect(ficha.getByRole('button', { name: 'Ver PDF' })).toBeVisible();
      await page.getByRole('tab', { name: 'PDFs' }).click();
      await expect(page.getByTestId('panel-pdfs-propuesta')).toContainText('vigente');
      await page.getByRole('tab', { name: 'Resumen' }).click();

      // 5b. Obs. cliente 2026-10-12: «Editar» en Lista para enviar devuelve la
      // revisión a borrador, invalida el PDF vigente, se revalida y regenera.
      await ficha.getByTestId('boton-editar-revision').click();
      const dialogoEditar = page.getByTestId('dialogo-editar-revision');
      await expect(dialogoEditar).toBeVisible();
      await capturar(page, 'dialogo-editar-revision');
      await dialogoEditar
        .getByLabel('Motivo de la edición')
        .fill('Ajustar cantidades antes de enviar');
      await dialogoEditar.getByRole('button', { name: 'Editar versión' }).click();
      await expect
        .poll(async () => {
          const { data } = await admin
            .from('propuesta_revisiones')
            .select('estado')
            .eq('id', revisionA.data.id)
            .single();
          return data?.estado;
        })
        .toBe('DRAFT');
      // El PDF vigente queda invalidado: hay que regenerarlo.
      await expect(page.getByText(/PDF vigente v1/)).toHaveCount(0);
      await ficha.getByRole('button', { name: 'Validar', exact: true }).first().click();
      await expect(dialogoValidar).toBeVisible();
      await dialogoValidar.getByRole('button', { name: 'Registrar y validar' }).click();
      await expect
        .poll(async () => {
          const { data } = await admin
            .from('propuesta_revisiones')
            .select('estado')
            .eq('id', revisionA.data.id)
            .single();
          return data?.estado;
        })
        .toBe('READY_TO_SEND');
      // Sin cambios de contenido, regenerar reactiva el mismo PDF (v1).
      await ficha.getByRole('button', { name: 'Generar PDF', exact: true }).first().click();
      await expect(page.getByText(/PDF vigente v1/)).toBeVisible();
      await expect(ficha.getByTestId('pdf-resultado')).toContainText('ya existía');

      // 6. Seguimiento posterior en modal (obs. cliente: captura en modal).
      await page.getByRole('tab', { name: 'Seguimiento' }).click();
      await page.getByTestId('abrir-registrar-seguimiento').click();
      const dialogoSeguimiento = page.getByTestId('dialogo-seguimiento-propuesta');
      await expect(dialogoSeguimiento).toBeVisible();
      await dialogoSeguimiento
        .getByLabel('Fecha de la próxima acción')
        .fill(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
      await dialogoSeguimiento
        .getByRole('button', { name: 'Registrar seguimiento' })
        .click();
      await expect(
        page.getByTestId('panel-seguimiento-propuesta').getByRole('status'),
      ).toContainText('Seguimiento registrado.');

      // 7. Enviar con canal y destino (congela atómicamente).
      await ficha.getByRole('button', { name: 'Enviar', exact: true }).first().click();
      await page.getByLabel('Destino de envío').fill('compras@cliente.mx');
      await page.getByRole('button', { name: 'Confirmar envío' }).click();
      await expect
        .poll(async () => {
          const { data } = await admin
            .from('propuesta_revisiones')
            .select('estado')
            .eq('id', revisionA.data.id)
            .single();
          return data?.estado;
        })
        .toBe('SENT');

      // Congelamiento: ni la UI ni un UPDATE directo pueden editar la revisión.
      await page.getByRole('tab', { name: 'Ítems' }).click();
      await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
      const { data: itemA1 } = await admin
        .from('propuesta_items')
        .select('id')
        .eq('revision_id', revisionA.data.id)
        .eq('codigo', 'IT01')
        .single();
      const intentoDirecto = await admin
        .from('propuesta_items')
        .update({ precio_unitario: 1 })
        .eq('id', itemA1!.id);
      expect(intentoDirecto.error?.message ?? '').toContain('revision_congelada');

      // Obs. cliente 6: una revisión enviada no ofrece Quitar (solo lectura).
      await page.getByRole('tab', { name: 'Archivos' }).click();
      await expect(page.getByRole('button', { name: /^Quitar / })).toHaveCount(0);

      await capturar(page, 'ficha-enviada');

      // 8. Nueva versión B con motivo (CTA del encabezado, obs. cliente).
      await page.getByRole('button', { name: /^A · Enviada/ }).click();
      await page.getByRole('tab', { name: 'Resumen' }).click();
      const historial = page.getByTestId('historial-versiones-propuesta');
      await expect(historial).toContainText('Historial de versiones');
      await expect(historial).toContainText(revisionA.data.folio_revision);
      const dialogoVersion = page.getByTestId('dialogo-nueva-version');
      await page.getByTestId('boton-crear-nueva-version').click();
      await expect(dialogoVersion).toBeVisible();
      await capturar(page, 'dialogo-nueva-version');
      await dialogoVersion
        .getByLabel('Motivo de la nueva versión')
        .fill('El cliente pidió ajustar precios');
      await dialogoVersion.getByRole('button', { name: 'Crear versión' }).click();
      await expect
        .poll(async () => {
          const { data } = await admin
            .from('propuesta_revisiones')
            .select('letra, estado')
            .eq('propuesta_id', propuesta.data.id)
            .eq('letra', 'B')
            .maybeSingle();
          return data?.estado ?? null;
        })
        .toBe('DRAFT');
      const revisionB = await admin
        .from('propuesta_revisiones')
        .select('id')
        .eq('propuesta_id', propuesta.data.id)
        .eq('letra', 'B')
        .single();
      contexto.revisionIds.push(revisionB.data!.id);

      // C3.1: B admite ítems nuevos con IT consecutivo y origen propio sin tocar el RFQ.
      await page.getByRole('button', { name: /^B · Borrador/ }).click();
      await page.getByRole('tab', { name: 'Ítems' }).click();
      await page.locator('#alta-item-descripcion').fill('Ítem agregado en revisión B');
      await page.locator('#alta-item-cantidad').fill('3');
      await page.getByRole('button', { name: 'Agregar ítem' }).click();
      await expect(page.getByText('Ítem IT03 agregado en la revisión B.')).toBeVisible();

      const itemNuevo = await admin
        .from('propuesta_items')
        .select('id, codigo, revision_origen_id, rfq_item_id')
        .eq('revision_id', revisionB.data!.id)
        .eq('codigo', 'IT03')
        .single();
      expect(itemNuevo.error).toBeNull();
      expect(itemNuevo.data).toMatchObject({
        codigo: 'IT03',
        revision_origen_id: revisionB.data!.id,
        rfq_item_id: null,
      });
      const itemsRfqTrasAlta = await admin
        .from('rfq_items')
        .select('id', { count: 'exact', head: true })
        .eq('rfq_id', rfqId);
      expect(itemsRfqTrasAlta.count).toBe(2);

      // El ítem propio recibe su plano sin tocar RFQ; la Orden ya congela
      // archivos `propuesta_item` y Producción los resuelve por ese ID exacto.
      await page.getByRole('tab', { name: 'Archivos' }).click();
      await page.getByLabel('Destino del archivo').selectOption(itemNuevo.data!.id);
      const nombrePlanoB = `plano-revision-b-${contexto.sufijo}.dxf`;
      await page.getByLabel('Archivo de la propuesta').setInputFiles({
        name: nombrePlanoB,
        mimeType: 'application/dxf',
        buffer: Buffer.alloc(1024 * 1024 + 37, 0x41),
      });
      await page.getByRole('button', { name: 'Subir archivo' }).click();
      await expect(page.getByRole('status')).toContainText('Archivo subido.');
      const archivoItemNuevo = await admin
        .from('archivos')
        .select('entidad, entidad_id, nombre_original, tamano_bytes')
        .eq('entidad', 'propuesta_item')
        .eq('entidad_id', itemNuevo.data!.id)
        .eq('nombre_original', nombrePlanoB)
        .single();
      expect(archivoItemNuevo.error).toBeNull();
      expect(archivoItemNuevo.data).toMatchObject({
        entidad: 'propuesta_item',
        entidad_id: itemNuevo.data!.id,
        nombre_original: nombrePlanoB,
        tamano_bytes: 1024 * 1024 + 37,
      });

      // 9. Aceptar la revisión ANTERIOR (A) aunque exista una B posterior.
      await page.getByRole('button', { name: /^A · Enviada/ }).click();
      await page.getByRole('tab', { name: 'Ítems' }).click();
      await expect(page.getByRole('row', { name: /IT03/ })).toHaveCount(0);
      // C4.1: la fecha compromiso comercial es obligatoria al aceptar.
      await page.getByLabel('Fecha compromiso comercial').fill(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
      await page.getByRole('button', { name: 'Aceptar revisión' }).click();
      await expect
        .poll(async () => {
          const { data } = await admin
            .from('propuestas')
            .select('accepted_revision_id, estado')
            .eq('id', propuesta.data.id)
            .single();
          return data?.accepted_revision_id;
        })
        .toBe(revisionA.data.id);

      // C4.1/DC-09 + observación del cliente: la aceptación deja una solicitud
      // durable y, con permiso de liberar, la Orden nace de inmediato.
      await expect(page.getByTestId('propuesta-orden-creada')).toBeVisible();
      const solicitud = await admin
        .from('solicitudes_orden')
        .select('estado, orden_id')
        .eq('revision_id', revisionA.data.id)
        .single();
      expect(solicitud.data?.estado).toBe('CREATED');
      const ordenCreada = await admin
        .from('ordenes_produccion')
        .select('id, folio, folio_sii')
        .eq('propuesta_revision_id', revisionA.data.id)
        .single();
      expect(ordenCreada.error).toBeNull();
      await expect
        .poll(async () => {
          const { data } = await admin
            .from('propuesta_revisiones')
            .select('estado')
            .eq('id', revisionA.data.id)
            .single();
          return data?.estado;
        })
        .toBe('SALE_CONFIRMED');

      // 10. Obs. cliente 2026-10-12: tras aceptar, las demás versiones quedan
      // como historial de solo lectura (sin acciones de negocio).
      await page.getByRole('button', { name: /^B · / }).click();
      await expect(page.getByTestId('panel-acciones-solo-lectura')).toBeVisible();
      await expect(page.getByText('Versión histórica')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Aceptar revisión' })).toHaveCount(0);
      await expect(page.getByTestId('boton-crear-nueva-version')).toHaveCount(0);
      await expect(page.getByTestId('boton-editar-revision')).toHaveCount(0);

      // 11. La propuesta aceptada ya aparece en Órdenes sin capturar de nuevo.
      await capturar(page, 'ficha-orden-creada');
      await page.goto('/ordenes');
      const folioOrden = ordenCreada.data!.folio_sii ?? ordenCreada.data!.folio;
      await expect(page.getByTestId(`fila-orden-${folioOrden}`)).toBeVisible();
    } finally {
      await limpiarContexto(contexto);
    }
  });
});
