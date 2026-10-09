import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

// playwright.config.ts exige URL de loopback antes de importar esta prueba.
const correoAdmin = process.env.E2E_CONFIGURACION_ADMIN_EMAIL;
const contrasenaAdmin = process.env.E2E_CONFIGURACION_ADMIN_PASSWORD;
const correoOperador = process.env.E2E_DASHBOARD_OPERADOR_EMAIL;
const contrasenaOperador = process.env.E2E_DASHBOARD_OPERADOR_PASSWORD;
const carpetaVisual = '.ai-shared/qa/sii-b1-e4/visual';

async function iniciarSesion(page: Page, correo: string, contrasena: string): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => ['/dashboard', '/tablero', '/produccion'].includes(url.pathname));
}

function clienteAdmin(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

test.describe.serial('SII-B1.10 Actividad', () => {
  test('admin ve actividad agrupada, etiquetas legibles y filtros sin UUID crudo', async ({ page }) => {
    test.skip(!correoAdmin || !contrasenaAdmin, 'Requiere administrador del stack local');
    const admin = clienteAdmin();
    const sufijo = randomUUID().slice(0, 8);
    const actor = `Admin Actividad E2E ${sufijo}`;
    const correlationId = randomUUID();
    const recursoSuelto = randomUUID();
    let clienteId: string | null = null;
    let pipelineId: string | null = null;
    let ordenId: string | null = null;

    try {
      const { data: perfil, error: errorPerfil } = await admin.from('usuarios')
        .select('id').eq('email', correoAdmin!).single();
      if (errorPerfil) throw errorPerfil;

      const razonSocial = `Cliente Actividad E2E ${sufijo}`;
      const cliente = await admin.from('clientes').insert({
        razon_social: razonSocial,
        nombre_comercial: `Actividad ${sufijo}`,
        estado: 'activo',
      }).select('id, folio').single();
      if (cliente.error) throw cliente.error;
      clienteId = cliente.data.id;
      const folioCliente = cliente.data.folio ?? razonSocial;

      const folioOp = await admin.rpc('generar_folio_op');
      if (folioOp.error || !folioOp.data) throw new Error(folioOp.error?.message ?? 'Sin folio OP');
      const folioCnc = `CNC-E2E-${sufijo}`;
      const pipeline = await admin.from('pipeline').insert({
        folio_op: folioOp.data,
        folio_cnc: folioCnc,
        vendedor_id: perfil.id,
        empresa: `Empresa Actividad ${sufijo}`,
        nombre_contacto: 'Contacto Actividad',
        etapa: 'prospecto',
      }).select('id, folio_rfq').single();
      if (pipeline.error) throw pipeline.error;
      pipelineId = pipeline.data.id;
      const folioRfq = pipeline.data.folio_rfq ?? folioCnc;

      const folioOrden = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
      if (folioOrden.error || !folioOrden.data) throw new Error(folioOrden.error?.message ?? 'Sin folio de orden');
      const orden = await admin.from('ordenes_produccion').insert({
        folio: folioOrden.data,
        cliente_id: clienteId,
        estado: 'borrador',
        prioridad: 'normal',
        fecha_compromiso: '2100-12-31T00:00:00Z',
      }).select('id, folio, folio_sii').single();
      if (orden.error) throw orden.error;
      ordenId = orden.data.id;
      const folioOrdenVisible = orden.data.folio_sii ?? orden.data.folio;

      const eventos = await admin.from('logs').insert([
        {
          usuario_id: perfil.id, nombre_usuario: actor, rol: 'admin', accion: 'crear',
          modulo: 'pipeline', recurso_id: pipelineId, correlation_id: correlationId,
          detalles: { canal: 'e2e' },
        },
        {
          usuario_id: perfil.id, nombre_usuario: actor, rol: 'admin', accion: 'actualizar',
          modulo: 'clientes', recurso_id: clienteId, correlation_id: correlationId,
          detalles: { nota: 'misma accion de negocio' },
        },
        {
          usuario_id: perfil.id, nombre_usuario: actor, rol: 'admin', accion: 'liberar',
          modulo: 'ordenes', recurso_id: ordenId, correlation_id: null,
          detalles: { nota: 'evento suelto' },
        },
        {
          usuario_id: perfil.id, nombre_usuario: actor, rol: 'admin', accion: 'ajustar',
          modulo: 'sistema', recurso_id: recursoSuelto, correlation_id: null,
          detalles: { nota: 'sin table conocida' },
        },
      ]);
      if (eventos.error) throw eventos.error;

      await iniciarSesion(page, correoAdmin!, contrasenaAdmin!);
      await page.goto('/actividad');
      await expect(page.getByTestId('pagina-actividad')).toBeVisible();
      const vista = page.getByTestId('vista-actividad');
      await vista.getByLabel('Usuario').fill(actor);

      await expect(vista.getByTestId('fila-actividad')).toHaveCount(4);
      const grupo = vista.getByTestId('grupo-correlacion');
      await expect(grupo).toHaveCount(1);
      await expect(grupo).toContainText('2 eventos');

      const enlacePipeline = vista.getByRole('link', { name: folioRfq });
      await expect(enlacePipeline).toHaveAttribute('href', `/rfq?rfq=${pipelineId}`);
      const enlaceCliente = vista.getByRole('link', { name: folioCliente });
      await expect(enlaceCliente).toHaveAttribute('href', `/clientes?cliente=${clienteId}`);
      const enlaceOrden = vista.getByRole('link', { name: folioOrdenVisible });
      await expect(enlaceOrden).toHaveAttribute('href', `/ordenes?ordenId=${ordenId}`);

      // Ningún UUID técnico visible (ni el correlacionado ni el recurso sin tabla).
      await expect(vista).not.toContainText(pipelineId!);
      await expect(vista).not.toContainText(clienteId!);
      await expect(vista).not.toContainText(ordenId!);
      await expect(vista).not.toContainText(recursoSuelto);
      await expect(vista).not.toContainText(correlationId);

      if (process.env.E2E_CAPTURAR_VISUAL === '1') {
        for (const [nombre, ancho, alto] of [
          ['escritorio', 1440, 900], ['tableta', 768, 1024],
        ] as const) {
          await page.setViewportSize({ width: ancho, height: alto });
          for (const tema of ['claro', 'oscuro'] as const) {
            await page.locator('html').evaluate((nodo, oscuro) => nodo.classList.toggle('dark', oscuro), tema === 'oscuro');
            await expect.poll(() => vista.getByLabel('Módulo').evaluate((nodo) => getComputedStyle(nodo).backgroundColor))
              .toBe(tema === 'oscuro' ? 'rgb(51, 65, 85)' : 'rgb(241, 243, 245)');
            await page.screenshot({
              path: `${carpetaVisual}/actividad-${nombre}-${tema}.png`,
              fullPage: true,
              animations: 'disabled',
            });
          }
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator('html').evaluate((nodo) => nodo.classList.remove('dark'));
      }

      // Filtro por módulo: deja solo el evento suelto de sistema.
      await vista.getByLabel('Módulo').selectOption('sistema');
      await expect(vista.getByTestId('fila-actividad')).toHaveCount(1);
      await expect(vista.getByTestId('grupo-correlacion')).toHaveCount(0);
      await expect(vista.getByTestId('fila-actividad')).toContainText('Ajustar');
      await expect(vista.getByTestId('fila-actividad')).toContainText('—');

      // Sin resultados: estado vacío.
      await vista.getByLabel('Desde').fill('2099-01-01');
      await expect(vista.getByText('Sin actividad para estos filtros')).toBeVisible();
    } finally {
      await admin.from('logs').delete().eq('nombre_usuario', actor);
      if (ordenId) await admin.from('ordenes_produccion').delete().eq('id', ordenId);
      if (pipelineId) await admin.from('pipeline').delete().eq('id', pipelineId);
      if (clienteId) await admin.from('clientes').delete().eq('id', clienteId);
    }
  });

  test('un operador no ve la sección de Actividad', async ({ page }) => {
    test.skip(!correoOperador || !contrasenaOperador, 'Requiere operador del stack local');
    await iniciarSesion(page, correoOperador!, contrasenaOperador!);
    await expect(page.getByRole('link', { name: 'Actividad' })).toHaveCount(0);
    await page.goto('/actividad');
    await expect(page.getByTestId('pagina-actividad')).toHaveCount(0);
  });
});
