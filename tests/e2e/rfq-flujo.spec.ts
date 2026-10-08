import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

// playwright.config.ts exige URL de loopback antes de importar esta prueba.
const correoAdmin = process.env.E2E_CONFIGURACION_ADMIN_EMAIL;
const contrasenaAdmin = process.env.E2E_CONFIGURACION_ADMIN_PASSWORD;
const carpetaVisual = '.ai-shared/qa/sii-b3-ola2/visual';

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

type ContextoRfq = {
  admin: SupabaseClient<Database>;
  sufijo: string;
  empresa: string;
  clienteId: string;
  contactoId: string;
  materialId: string;
  espesorId: string;
  procesoId: string;
  procesoCodigo: string;
  procesoNombre: string;
  materialNombre: string;
  rfqId?: string;
};

async function prepararContexto(): Promise<ContextoRfq> {
  const admin = clienteAdmin();
  const sufijo = randomUUID().slice(0, 8).toUpperCase();

  const empresa = `QA RFQ Flujo ${sufijo}`;
  const cliente = await admin
    .from('clientes')
    .insert({
      razon_social: empresa,
      nombre_comercial: `RFQ Flujo ${sufijo}`,
      estado: 'activo',
    })
    .select('id')
    .single();
  if (cliente.error || !cliente.data) throw new Error(cliente.error?.message ?? 'Sin cliente');

  const contacto = await admin
    .from('contactos_cliente')
    .insert({
      cliente_id: cliente.data.id,
      nombre: `Contacto RFQ ${sufijo}`,
      es_principal: true,
      activo: true,
    })
    .select('id')
    .single();
  if (contacto.error || !contacto.data) throw new Error(contacto.error?.message ?? 'Sin contacto');

  const materialNombre = `Material E2E ${sufijo}`;
  const material = await admin
    .from('catalogo_materiales')
    .insert({ codigo: `E2E_${sufijo}`, nombre: materialNombre, activo: true })
    .select('id')
    .single();
  if (material.error || !material.data) throw new Error(material.error?.message ?? 'Sin material');

  const espesor = await admin
    .from('catalogo_espesores')
    .insert({ material_id: material.data.id, etiqueta: '5 mm', espesor_mm: 5, activo: true })
    .select('id')
    .single();
  if (espesor.error || !espesor.data) throw new Error(espesor.error?.message ?? 'Sin espesor');

  const procesoCodigo = `E2E_${sufijo.slice(0, 6)}`;
  const procesoNombre = `Proceso E2E ${sufijo}`;
  const proceso = await admin
    .from('catalogo_procesos')
    .insert({
      codigo: procesoCodigo,
      nombre: procesoNombre,
      prefijo_corrida: 'QAR',
      requiere_archivo_tecnico: true,
      activo: true,
    })
    .select('id')
    .single();
  if (proceso.error || !proceso.data) throw new Error(proceso.error?.message ?? 'Sin proceso');

  return {
    admin,
    sufijo,
    empresa,
    clienteId: cliente.data.id,
    contactoId: contacto.data.id,
    materialId: material.data.id,
    espesorId: espesor.data.id,
    procesoId: proceso.data.id,
    procesoCodigo,
    procesoNombre,
    materialNombre,
  };
}

async function limpiarContexto(contexto: ContextoRfq): Promise<void> {
  const { admin, rfqId } = contexto;
  if (rfqId) {
    const { data: items } = await admin.from('rfq_items').select('id').eq('rfq_id', rfqId);
    const carpetas = [`rfq/${rfqId}`, ...(items ?? []).map((item) => `rfq_item/${item.id}`)];
    for (const carpeta of carpetas) {
      const { data: objetos } = await admin.storage.from('adjuntos-cotizacion').list(carpeta, { limit: 100 });
      const rutas = (objetos ?? []).filter((objeto) => objeto.id !== null).map((objeto) => `${carpeta}/${objeto.name}`);
      if (rutas.length > 0) await admin.storage.from('adjuntos-cotizacion').remove(rutas);
    }
    await admin.from('archivos').delete().eq('entidad', 'rfq').eq('entidad_id', rfqId);
    if (items && items.length > 0) {
      await admin.from('archivos').delete().eq('entidad', 'rfq_item').in('entidad_id', items.map((item) => item.id));
    }
    await admin.from('pipeline').delete().eq('id', rfqId);
  }
  // Los catálogos no se borran (trigger `catalogo_sin_borrado`): las fixtures se desactivan.
  await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_procesos').eq('entidad_id', contexto.procesoId);
  await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_espesores').eq('entidad_id', contexto.espesorId);
  await admin.from('versiones_catalogo').delete().eq('entidad', 'catalogo_materiales').eq('entidad_id', contexto.materialId);
  await admin.from('catalogo_espesores').update({ activo: false }).eq('id', contexto.espesorId);
  await admin.from('catalogo_procesos').update({ activo: false }).eq('id', contexto.procesoId);
  await admin.from('catalogo_materiales').update({ activo: false }).eq('id', contexto.materialId);
  await admin.from('contactos_cliente').delete().eq('id', contexto.contactoId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
}

test.describe.serial('SII-B3 ola 2 — flujo RFQ por UI', () => {
  test('crear RFQ, ítems con espesor y operaciones, archivo, gate LISTO y ITxx sin reutilizar', async ({ page }) => {
    test.skip(!correoAdmin || !contrasenaAdmin, 'Requiere administrador del stack local');
    const contexto = await prepararContexto();
    const { admin, empresa, sufijo } = contexto;

    try {
      await iniciarSesion(page);
      await page.goto('/rfq');
      await expect(page.getByTestId('cola-rfq')).toBeVisible();

      // 1. Alta del RFQ desde la cola.
      await page.getByRole('button', { name: 'Nuevo RFQ' }).click();
      if (process.env.E2E_CAPTURAR_VISUAL === '1') {
        for (const [nombre, ancho, alto] of [
          ['movil', 320, 800],
          ['tablet', 768, 900],
          ['escritorio', 1440, 900],
        ] as const) {
          await page.setViewportSize({ width: ancho, height: alto });
          for (const tema of ['claro', 'oscuro'] as const) {
            await page.locator('html').evaluate((nodo, oscuro) => nodo.classList.toggle('dark', oscuro), tema === 'oscuro');
            await page.screenshot({
              path: `${carpetaVisual}/rfq-alta-${nombre}-${tema}.png`,
              fullPage: true,
              animations: 'disabled',
            });
          }
        }
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.locator('html').evaluate((nodo) => nodo.classList.remove('dark'));
      }
      await page.getByLabel('Nombre del contacto').fill('Contacto QA');
      await page.getByLabel('Empresa', { exact: true }).fill(empresa);
      await page.getByLabel('Cliente (opcional)', { exact: true }).fill(empresa);
      await page.getByRole('button', { name: new RegExp(empresa) }).first().click();
      await page.getByRole('button', { name: 'Crear RFQ', exact: true }).click();

      const ficha = page.getByTestId('ficha-rfq');
      await expect(ficha).toBeVisible();
      const rfq = await admin.from('pipeline').select('id').eq('empresa', empresa).single();
      if (rfq.error || !rfq.data) throw new Error(rfq.error?.message ?? 'RFQ no persistido');
      contexto.rfqId = rfq.data.id;
      await expect.poll(() => new URL(page.url()).searchParams.get('rfq')).toBe(contexto.rfqId);
      await expect(ficha).toContainText('Incompleto');

      // 2. Ítems: material con espesor dependiente y operaciones del catálogo.
      await ficha.getByRole('tab', { name: 'Ítems' }).click();
      await page.getByRole('button', { name: 'Agregar ítem' }).click();
      if (process.env.E2E_CAPTURAR_VISUAL === '1') {
        const dialogoItem = page.getByRole('dialog', { name: 'Nuevo ítem' });
        for (const [nombre, ancho, alto] of [
          ['movil', 320, 800],
          ['escritorio', 1440, 900],
        ] as const) {
          await page.setViewportSize({ width: ancho, height: alto });
          for (const tema of ['claro', 'oscuro'] as const) {
            await page.locator('html').evaluate((nodo, oscuro) => nodo.classList.toggle('dark', oscuro), tema === 'oscuro');
            await dialogoItem.screenshot({
              path: `${carpetaVisual}/rfq-item-espesor-${nombre}-${tema}.png`,
              animations: 'disabled',
            });
          }
        }
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.locator('html').evaluate((nodo) => nodo.classList.remove('dark'));
      }
      await page.getByLabel('Descripción', { exact: true }).fill('Pieza E2E');
      await page.getByLabel('Cantidad').fill('3');
      await page.getByLabel('Material').selectOption({ label: contexto.materialNombre });
      await page.getByLabel('Espesor').selectOption({ label: '5 mm' });
      await page.getByLabel(contexto.procesoNombre).check();
      await page.getByRole('button', { name: 'Guardar ítem' }).click();
      await expect(page.getByTestId('tabla-items-rfq')).toContainText('IT01');

      await page.getByRole('button', { name: 'Agregar ítem' }).click();
      await page.getByLabel('Descripción', { exact: true }).fill('Pieza cancelada E2E');
      await page.getByLabel('Cantidad').fill('1');
      await page.getByRole('button', { name: 'Guardar ítem' }).click();
      await expect(page.getByTestId('tabla-items-rfq')).toContainText('IT02');

      const filaIt02 = page.getByRole('row', { name: /IT02/ });
      await filaIt02.getByRole('button', { name: 'Cancelar' }).click();
      await page.getByLabel('Motivo (opcional)').fill('pieza duplicada');
      await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
      await expect(page.getByRole('row', { name: /IT02/ })).toContainText('Cancelado');

      await page.getByRole('button', { name: 'Agregar ítem' }).click();
      await page.getByLabel('Descripción', { exact: true }).fill('Pieza siguiente E2E');
      await page.getByLabel('Cantidad').fill('2');
      await page.getByLabel('Material').selectOption({ label: contexto.materialNombre });
      await page.getByLabel('Espesor').selectOption({ label: '5 mm' });
      await page.getByLabel(contexto.procesoNombre).check();
      await page.getByRole('button', { name: 'Guardar ítem' }).click();
      // IT02 cancelado no se reutiliza: el siguiente código es IT03.
      await expect(page.getByRole('row', { name: /IT03/ })).toBeVisible();
      await expect(page.getByRole('row', { name: /IT03/ })).toContainText('Pieza siguiente E2E');

      // 3. Gate LISTO incompleto: faltantes visibles.
      await page.getByRole('button', { name: 'Marcar listo' }).click();
      const validacion = page.getByTestId('validacion-listo');
      await expect(validacion).toContainText('Faltan requisitos');
      await expect(validacion).toContainText('archivo técnico');
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

      // 4. Completar Resumen (general + seguimiento).
      await ficha.getByRole('tab', { name: 'Resumen' }).click();
      await page.getByRole('button', { name: 'Editar resumen' }).click();
      await page.getByLabel('Canal').fill('correo');
      await page.getByLabel('Fecha de solicitud').fill('2026-10-05');
      await page.getByLabel('Descripción general').fill(`Solicitud E2E ${sufijo}`);
      await page.getByLabel('Contacto del cliente').selectOption({ label: `Contacto RFQ ${sufijo}` });
      const selectoresResponsable = page.getByLabel('Responsable', { exact: true });
      const valorResponsableGeneral = await selectoresResponsable.locator('option').nth(1).getAttribute('value');
      await selectoresResponsable.selectOption(valorResponsableGeneral!);
      await page.getByLabel('Acción', { exact: true }).selectOption('FOLLOW_UP');
      await page.getByLabel('Fecha', { exact: true }).fill('2026-10-15');
      const responsables = page.getByLabel('Responsable de la acción');
      const opcionesResponsable = await responsables.locator('option').all();
      const valorResponsable = await opcionesResponsable[1]?.getAttribute('value');
      await responsables.selectOption(valorResponsable!);
      await page.getByRole('button', { name: 'Guardar datos' }).click();
      await expect(page.getByText('Datos guardados.')).toBeVisible();

      const propuestasTrasEditar = await admin
        .from('propuestas')
        .select('id', { count: 'exact', head: true })
        .eq('rfq_id', contexto.rfqId);
      expect(propuestasTrasEditar.error).toBeNull();
      expect(propuestasTrasEditar.count).toBe(0);

      // 5. Archivo técnico general.
      await ficha.getByRole('tab', { name: 'Archivos' }).click();
      await page.getByLabel('Tipo').selectOption('DIBUJO');
      await page.getByLabel('Archivo').setInputFiles({
        name: 'plano-e2e.dxf',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('0\nSECTION\nEOF'),
      });
      await page.getByRole('button', { name: 'Subir archivo' }).click();
      await expect(page.getByTestId('panel-archivos-rfq')).toContainText('plano-e2e.dxf');

      // 6. Marcar listo con todo completo.
      await page.getByRole('button', { name: 'Marcar listo' }).click();
      await expect(page.getByTestId('validacion-listo')).toContainText('cumple todos los requisitos');
      await page.getByRole('button', { name: 'Confirmar y marcar listo' }).click();
      await expect(ficha).toContainText('Listo para propuesta');

      const estado = await admin.from('pipeline').select('estado_rfq').eq('id', contexto.rfqId).single();
      expect(estado.data?.estado_rfq).toBe('READY_FOR_PROPOSAL');

      if (process.env.E2E_CAPTURAR_VISUAL === '1') {
        await ficha.getByRole('tab', { name: 'Resumen' }).click();
        await expect(page.getByTestId('rfq-datos-generales')).toBeVisible();
        for (const [nombre, ancho, alto] of [
          ['movil', 320, 900],
          ['tableta', 768, 1024],
          ['laptop', 1024, 900],
          ['escritorio', 1440, 900],
        ] as const) {
          await page.setViewportSize({ width: ancho, height: alto });
          for (const tema of ['claro', 'oscuro'] as const) {
            await page.locator('html').evaluate((nodo, oscuro) => nodo.classList.toggle('dark', oscuro), tema === 'oscuro');
            await page.screenshot({
              path: `${carpetaVisual}/rfq-ficha-${nombre}-${tema}.png`,
              fullPage: true,
              animations: 'disabled',
            });
          }
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator('html').evaluate((nodo) => nodo.classList.remove('dark'));
      }
    } finally {
      await limpiarContexto(contexto);
    }
  });
});
