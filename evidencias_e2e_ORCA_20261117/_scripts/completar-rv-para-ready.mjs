import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, descartarModalTipoCambio, captura, registrar, escribirNota } from './driver.mjs';

const RFQ_URL = 'https://erp-cc-flame.vercel.app/rfq?rfq=dd18497d-9d37-456a-92f7-1245bfe61b4d';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(20000);
const resultados = [];

async function paso(nombre, fn) {
  try {
    const r = await fn();
    resultados.push({ paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('admin', '11_reverificacion', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const mensaje = String(e && e.message || e).slice(0, 1200);
    resultados.push({ paso: nombre, resultado: 'error', detalle: mensaje });
    registrar('admin', '11_reverificacion', nombre, 'error', { mensaje });
    await captura(pagina, '11_reverificacion', `error-${nombre}`, { usuario: 'admin' }).catch(() => {});
    throw new Error(`${nombre}: ${mensaje}`);
  }
}

async function opciones(selector) {
  return selector.locator('option').evaluateAll((ns) => ns.map((n) => ({ valor: n.value, texto: n.textContent.trim() })));
}

try {
  await paso('login', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    await descartarModalTipoCambio(pagina);
  });

  await paso('abrir-rfq-rv', async () => {
    await pagina.goto(RFQ_URL, { waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-rfq').waitFor();
    return { url: pagina.url() };
  });

  await paso('items', async () => {
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Ítems' }).click();
    const agregar = async (desc, cant, materialTexto, espesorTexto, proceso, notas) => {
      await pagina.getByRole('button', { name: 'Agregar ítem' }).click();
      const d = pagina.getByRole('dialog', { name: 'Nuevo ítem' });
      await d.waitFor();
      await d.getByLabel('Descripción', { exact: true }).fill(desc);
      await d.getByLabel('Cantidad').fill(cant);
      const mats = await opciones(d.getByLabel('Material'));
      const mat = mats.find((m) => m.texto.includes(materialTexto));
      if (!mat) throw new Error(`Sin material ${materialTexto}: ${JSON.stringify(mats)}`);
      await d.getByLabel('Material').selectOption({ label: mat.texto });
      const espesores = await opciones(d.getByLabel('Espesor'));
      const esp = espesores.find((e) => e.texto.includes(espesorTexto));
      if (!esp) throw new Error(`Sin espesor ${espesorTexto}: ${JSON.stringify(espesores)}`);
      await d.getByLabel('Espesor').selectOption({ label: esp.texto });
      await d.getByLabel(new RegExp(proceso, 'i')).first().check();
      await d.getByLabel('Notas (opcional)').fill(notas);
      await d.getByRole('button', { name: 'Guardar ítem' }).click();
      await d.waitFor({ state: 'hidden' });
      return { desc, material: mat.texto, espesor: esp.texto };
    };
    const items = [];
    items.push(await agregar('Soporte metálico RV', '10', 'calibre 14', '14', 'Corte laser', 'Corte laser según DXF RV'));
    items.push(await agregar('Panel decorativo RV', '5', 'MDF 12', '12', 'CNC ROUTER', 'Router CNC RV'));
    await captura(pagina, '11_reverificacion', 'rv-items', { usuario: 'admin' });
    return { items };
  });

  await paso('archivos', async () => {
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Archivos' }).click();
    const dxf = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nCORTE\n10\n0\n20\n0\n11\n120\n21\n80\n0\nENDSEC\n0\nEOF\n';
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
    await pagina.getByLabel('Tipo').selectOption({ label: 'CAD' });
    await pagina.getByLabel('Archivo').setInputFiles({ name: 'RV-SOPORTE.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf) });
    await pagina.getByRole('button', { name: 'Subir archivo' }).click();
    await pagina.getByTestId('panel-archivos-rfq').getByText('RV-SOPORTE.dxf').first().waitFor({ timeout: 25000 });
    await pagina.getByLabel('Tipo').selectOption({ label: 'DIBUJO' });
    await pagina.getByLabel('Archivo').setInputFiles({ name: 'RV-SOPORTE.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
    await pagina.getByRole('button', { name: 'Subir archivo' }).click();
    await pagina.getByTestId('panel-archivos-rfq').getByText('RV-SOPORTE.pdf').first().waitFor({ timeout: 25000 });
    await captura(pagina, '11_reverificacion', 'rv-archivos', { usuario: 'admin' });
    return { archivos: ['RV-SOPORTE.dxf', 'RV-SOPORTE.pdf'] };
  });

  await paso('seguimiento', async () => {
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Resumen' }).click();
    await pagina.getByRole('button', { name: 'Editar resumen' }).click();
    const form = pagina.getByTestId('resumen-rfq');
    await form.getByLabel('Acción a seguir', { exact: true }).selectOption({ index: 1 });
    const fecha = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await form.getByLabel('Fecha de la acción').fill(fecha);
    const responsables = await opciones(form.getByLabel('Responsable de la acción a seguir'));
    const responsable = responsables.find((r) => r.valor);
    if (!responsable) throw new Error('Sin responsables disponibles');
    await form.getByLabel('Responsable de la acción a seguir').selectOption(responsable.valor);
    await pagina.getByRole('button', { name: 'Guardar datos' }).click();
    await pagina.getByText('Datos guardados.').first().waitFor({ timeout: 15000 });
    return { fecha, responsable: responsable.texto };
  });

  await paso('marcar-listo', async () => {
    await pagina.getByRole('button', { name: 'Marcar listo' }).click();
    const panel = pagina.getByTestId('validacion-listo');
    const texto = await panel.innerText();
    await captura(pagina, '11_reverificacion', 'rv-validacion', { usuario: 'admin' });
    const confirmar = pagina.getByRole('button', { name: 'Confirmar y marcar listo' });
    if (!(await confirmar.count()) || await confirmar.isDisabled()) {
      throw new Error(`No se puede marcar listo: ${texto.slice(0, 700)}`);
    }
    await confirmar.click();
    await pagina.waitForTimeout(2000);
    const ficha = await pagina.getByTestId('ficha-rfq').innerText();
    const ready = ficha.includes('Listo para propuesta');
    await captura(pagina, '11_reverificacion', 'rv-listo', { usuario: 'admin' });
    return { ready, texto: texto.slice(0, 900) };
  });

  escribirNota('11_reverificacion', 'rv-listo', '# RFQ nuevo llevado a READY\n\n' + JSON.stringify(resultados, null, 2) + '\n');
  registrar('admin', '11_reverificacion', 'rv-listo-resumen', readyGlobal(resultados) ? 'ok' : 'error', { total: resultados.length });
  console.log(JSON.stringify(resultados, null, 2));
  if (!readyGlobal(resultados)) process.exitCode = 1;
} catch (e) {
  registrar('admin', '11_reverificacion', 'rv-listo-fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}

function readyGlobal(lista) {
  const ultimo = lista.find((r) => r.paso === 'marcar-listo');
  return Boolean(ultimo?.detalle?.ready);
}
