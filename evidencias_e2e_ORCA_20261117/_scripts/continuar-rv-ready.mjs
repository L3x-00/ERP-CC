import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, descartarModalTipoCambio, captura, registrar, escribirNota } from './driver.mjs';

const RFQ_URL = 'https://erp-cc-flame.vercel.app/rfq?rfq=dd18497d-9d37-456a-92f7-1245bfe61b4d';
const PDF_REAL = 'evidencias_e2e_ORCA_20261117/08_documentos/propuesta-CNC-1126_08-B-Propuesta_CNC-1126_08-B.pdf';
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
    await captura(pagina, '11_reverificacion', `error2-${nombre}`, { usuario: 'admin' }).catch(() => {});
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

  await paso('pdf-dibujo', async () => {
    await pagina.goto(RFQ_URL, { waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Archivos' }).click();
    await pagina.getByLabel('Tipo').selectOption({ label: 'DIBUJO' });
    await pagina.getByLabel('Archivo').setInputFiles(PDF_REAL);
    await pagina.getByRole('button', { name: 'Subir archivo' }).click();
    const panel = pagina.getByTestId('panel-archivos-rfq');
    try {
      await panel.getByText('Propuesta_CNC-1126_08-B.pdf').first().waitFor({ timeout: 20000 });
    } catch {
      const texto = await panel.innerText();
      throw new Error(`No aparece el PDF. Panel: ${texto.slice(0, 700)}`);
    }
    await captura(pagina, '11_reverificacion', 'rv-pdf-dibujo', { usuario: 'admin' });
    return { archivo: 'Propuesta_CNC-1126_08-B.pdf' };
  });

  await paso('seguimiento', async () => {
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Resumen' }).click();
    await pagina.getByRole('button', { name: 'Editar resumen' }).click();
    const form = pagina.getByTestId('resumen-rfq');
    await form.getByLabel('Acción', { exact: true }).selectOption({ index: 1 });
    const fecha = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await form.getByLabel('Fecha', { exact: true }).fill(fecha);
    const responsables = await opciones(form.getByLabel('Responsable de la acción', { exact: true }));
    const responsable = responsables.find((r) => r.valor);
    if (!responsable) throw new Error('Sin responsables disponibles');
    await form.getByLabel('Responsable de la acción', { exact: true }).selectOption(responsable.valor);
    await pagina.getByRole('button', { name: 'Guardar datos' }).click();
    await pagina.getByText('Datos guardados.').first().waitFor({ timeout: 15000 });
    return { fecha, responsable: responsable.texto };
  });

  await paso('marcar-listo', async () => {
    await pagina.getByRole('button', { name: 'Marcar listo' }).click();
    const panel = pagina.getByTestId('validacion-listo');
    const texto = await panel.innerText();
    await captura(pagina, '11_reverificacion', 'rv-validacion2', { usuario: 'admin' });
    const confirmar = pagina.getByRole('button', { name: 'Confirmar y marcar listo' });
    if (!(await confirmar.count()) || await confirmar.isDisabled()) {
      throw new Error(`No se puede marcar listo: ${texto.slice(0, 900)}`);
    }
    await confirmar.click();
    await pagina.waitForTimeout(2000);
    const ficha = await pagina.getByTestId('ficha-rfq').innerText();
    await captura(pagina, '11_reverificacion', 'rv-listo2', { usuario: 'admin' });
    return { ready: ficha.includes('Listo para propuesta'), texto: texto.slice(0, 900) };
  });

  escribirNota('11_reverificacion', 'rv-listo2', '# RFQ nuevo llevado a READY\n\n' + JSON.stringify(resultados, null, 2) + '\n');
  const ok = resultados.every((r) => r.resultado === 'ok') && Boolean(resultados.find((r) => r.paso === 'marcar-listo')?.detalle?.ready);
  registrar('admin', '11_reverificacion', 'rv-listo2-resumen', ok ? 'ok' : 'error', { total: resultados.length });
  console.log(JSON.stringify(resultados, null, 2));
  if (!ok) process.exitCode = 1;
} catch (e) {
  registrar('admin', '11_reverificacion', 'rv-listo2-fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
