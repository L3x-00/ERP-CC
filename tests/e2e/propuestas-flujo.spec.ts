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

  const proceso = await admin
    .from('catalogo_procesos')
    .insert({
      codigo: `E2EP_${sufijo.slice(0, 5)}`,
      nombre: `Proceso E2E P ${sufijo}`,
      prefijo_corrida: 'QPE',
      requiere_archivo_tecnico: false,
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
    rfqId: rfq.data.id,
    rfqItemIds: items.data.map((item) => item.id),
    revisionIds: [],
  };
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
    await admin.from('propuestas').delete().eq('id', contexto.propuestaId);
  }
  await admin.from('pipeline').delete().eq('id', contexto.rfqId);
  await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_procesos').eq('entidad_id', contexto.procesoId);
  await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_espesores').eq('entidad_id', contexto.espesorId);
  await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_materiales').eq('entidad_id', contexto.materialId);
  await admin.from('catalogo_espesores').update({ activo: false }).eq('id', contexto.espesorId);
  await admin.from('catalogo_procesos').update({ activo: false }).eq('id', contexto.procesoId);
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
      await page.getByLabel('Precio IT01').fill('100');
      await page.getByRole('row', { name: /IT01/ }).getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('status')).toContainText('IT01');

      await page.getByRole('tab', { name: 'Ruteo/Costeo' }).click();
      await page.getByLabel('Costo Material').fill('400');
      await page.getByLabel('Costo Máquina').fill('100');
      await page.getByRole('button', { name: 'Guardar costos' }).click();
      await expect(page.getByRole('status')).toContainText('Costos guardados.');

      // 4. Validar (la revisión queda lista para enviar).
      await ficha.getByRole('button', { name: 'Validar', exact: true }).first().click();
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

      // 5. Generar PDF y verlo en la pestaña PDFs.
      await ficha.getByRole('button', { name: 'Generar PDF', exact: true }).first().click();
      await expect(page.getByText(/PDF vigente v1/)).toBeVisible();
      await page.getByRole('tab', { name: 'PDFs' }).click();
      await expect(page.getByTestId('panel-pdfs-propuesta')).toContainText('vigente');

      // 6. Seguimiento: próxima acción obligatoria para enviar.
      await page.getByRole('tab', { name: 'Seguimiento' }).click();
      await page.getByLabel('Acción de seguimiento').selectOption('FOLLOW_UP');
      await page.getByLabel('Fecha de la próxima acción').fill('2026-11-15');
      await page.getByRole('button', { name: 'Registrar seguimiento' }).click();
      await expect(page.getByRole('status')).toContainText('Seguimiento registrado.');

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

      await capturar(page, 'ficha-enviada');

      // 8. Nueva revisión B con motivo.
      await page.getByRole('button', { name: /^A · Enviada/ }).click();
      await ficha.getByRole('button', { name: 'Nueva revisión', exact: true }).first().click();
      await page.getByLabel('Motivo').fill('El cliente pidió ajustar precios');
      await page.getByRole('button', { name: 'Crear revisión' }).click();
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

      // C4.1: la aceptación deja una solicitud de Orden visible como «Orden pendiente».
      await expect(page.getByTestId('propuesta-orden-pendiente')).toBeVisible();
      const solicitud = await admin
        .from('solicitudes_orden')
        .select('estado')
        .eq('revision_id', revisionA.data.id)
        .single();
      expect(solicitud.data?.estado).toBe('PENDING');

      // 10. Confirmar venta (SALE_CONFIRMED habilita la orden en B5).
      await page.getByRole('button', { name: 'Confirmar venta' }).click();
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

      await capturar(page, 'ficha-venta-confirmada');
    } finally {
      await limpiarContexto(contexto);
    }
  });
});
