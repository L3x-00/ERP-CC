import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
import { writeFileSync, readFileSync } from 'node:fs';

const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const RFQ_ID = 'cc86f00f-fb5e-413c-a7f5-e8b788c86f7a';
const SUFIJO = 'QA1711';
const DESCRIPCION = `Soporte metálico SM-2026-02 y panel decorativo MDF-12. Corte laser, doblado CNC y router CNC segun planos adjuntos. Caso E2E ${SUFIJO}.`;

const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(10000);
const resultados = [];
const hallazgos = [];

async function paso(nombre, fn, critico = true) {
  try {
    const r = await fn();
    resultados.push({ paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('admin', '01_rfq', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1400);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '01_rfq', nombre, 'error', { mensaje: msg });
    hallazgos.push({ severidad: 'media', paso: nombre, mensaje: msg });
    await captura(pagina, '01_rfq', `error1c-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}

try {
  await paso('login', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(`/rfq?rfq=${RFQ_ID}&continuar=1`, { waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-rfq').waitFor();
  });

  await paso('estado-items-y-archivos', async () => {
    const nav = (await pagina.locator('[data-testid="navegacion-captura-rfq"]').innerText().catch(() => ''));
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Ítems' }).click();
    const tabla = (await pagina.getByTestId('tabla-items-rfq').innerText()).slice(0, 1500);
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Archivos' }).click();
    const panel = (await pagina.getByTestId('panel-archivos-rfq').innerText()).slice(0, 1000);
    await captura(pagina, '01_rfq', '27-estado-items-archivos', { usuario: 'admin' });
    return { nav, tabla, panel };
  });

  await paso('subir-pdf', async () => {
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Archivos' }).click();
    await pagina.getByLabel('Tipo').selectOption({ label: 'DIBUJO' });
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
    const input = pagina.locator('input[type="file"]').first();
    await input.setInputFiles({ name: 'SOPORTE-SM-2026-02.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
    await pagina.getByRole('button', { name: 'Subir archivo' }).click();
    await pagina.getByTestId('panel-archivos-rfq').getByText('SOPORTE-SM-2026-02.pdf').first().waitFor({ timeout: 20000 });
    await captura(pagina, '01_rfq', '28-pdf-tecnico-subido', { usuario: 'admin' });
    return { ok: true };
  });

  await paso('finalizar-captura', async () => {
    await pagina.getByRole('button', { name: 'Finalizar captura' }).click();
    const dlg = pagina.getByTestId('dialogo-finalizar-captura');
    await dlg.waitFor();
    const resumen = (await dlg.getByRole('region', { name: 'Resumen del RFQ' }).innerText()).slice(0, 1000);
    const acciones = await dlg.getByLabel('Acción a seguir', { exact: true }).locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
    await dlg.getByLabel('Acción a seguir', { exact: true }).selectOption({ index: 1 });
    await dlg.getByLabel('Fecha de la acción').fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
    await captura(pagina, '01_rfq', '29-finalizar-captura', { usuario: 'admin' });
    await dlg.getByRole('button', { name: 'Guardar y finalizar' }).click();
    await dlg.waitFor({ state: 'hidden' });
    return { resumen, acciones };
  });

  await paso('validar-y-editar', async () => {
    await pagina.getByRole('button', { name: 'Marcar listo' }).click();
    const txt1 = await pagina.getByTestId('validacion-listo').innerText();
    await captura(pagina, '01_rfq', '30-validacion-inicial', { usuario: 'admin' });
    const conf = pagina.getByRole('button', { name: 'Confirmar y marcar listo' });
    if (await conf.count() && await conf.isEnabled()) await conf.click();
    await pagina.waitForTimeout(1200);
    await captura(pagina, '01_rfq', '31-estado-tras-validar', { usuario: 'admin' });
    const fichaTexto = await pagina.getByTestId('ficha-rfq').innerText();
    const estado = fichaTexto.includes('Listo para propuesta') ? 'READY_FOR_PROPOSAL' : 'INCOMPLETE';
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Resumen' }).click();
    const boton = pagina.getByRole('button', { name: 'Editar resumen' });
    const editable = (await boton.count()) > 0;
    if (editable) {
      await boton.click();
      await pagina.getByTestId('resumen-rfq').getByLabel('Descripción general').fill(`${DESCRIPCION} Validado y editado: se confirma calibre 14, doblado CNC y cronograma de entrega.`);
      await captura(pagina, '01_rfq', '32-edicion-post-validacion', { usuario: 'admin' });
      await pagina.getByRole('button', { name: 'Guardar datos' }).click();
      await pagina.getByText('Datos guardados.').first().waitFor({ timeout: 15000 });
    }
    await captura(pagina, '01_rfq', '33-estado-tras-edicion', { usuario: 'admin' });
    return { txt1, estado, editable };
  });

  await paso('activar-cliente', async () => {
    await pagina.goto('/clientes', { waitUntil: 'networkidle' });
    const boton = pagina.getByRole('button', { name: new RegExp(SUFIJO) }).first();
    await boton.waitFor({ timeout: 15000 });
    await boton.click();
    const dlg = pagina.getByRole('dialog', { name: 'Ficha del cliente' });
    await dlg.waitFor();
    const antes = (await dlg.innerText()).slice(0, 1100);
    await captura(pagina, '01_rfq', '34-cliente-prospecto', { usuario: 'admin' });
    const activar = dlg.getByRole('button', { name: 'Activar' });
    const habia = (await activar.count()) > 0;
    if (habia) { await activar.click(); await pagina.waitForTimeout(1500); }
    const despues = (await dlg.innerText().catch(() => 'drawer cerrado')).slice(0, 1100);
    await captura(pagina, '01_rfq', '35-cliente-activado', { usuario: 'admin' });
    return { habia, antes, despues };
  }, false);

  await paso('verificar-relacion', async () => {
    await pagina.goto(`/rfq?rfq=${RFQ_ID}`, { waitUntil: 'networkidle' });
    const ficha = pagina.getByTestId('ficha-rfq');
    await ficha.getByRole('tab', { name: 'Resumen' }).click();
    const txt = (await pagina.getByTestId('rfq-datos-generales').innerText()).slice(0, 1400);
    await captura(pagina, '01_rfq', '36-relacion-conservada', { usuario: 'admin' });
    return { txt };
  }, false);
} catch (e) {
  registrar('admin', '01_rfq', 'etapa1c_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('01_rfq', 'resultado-etapa1c', `# Resultado etapa 1c\n\n\`\`\`json\n${JSON.stringify({ resultados, hallazgos, ESTADO }, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify({ resultados, hallazgos }, null, 2).slice(0, 9000));
}
