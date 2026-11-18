import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, guardarDescarga } from './driver.mjs';
import { readFileSync } from 'node:fs';
const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
const resultados = [];
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();

  await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
  const ficha = pagina.getByTestId('ficha-propuesta');
  await ficha.locator('button[aria-pressed]').filter({ hasText: /^B/ }).first().dispatchEvent('click');
  await ficha.getByRole('tab', { name: 'PDFs' }).dispatchEvent('click');
  await pagina.waitForTimeout(1000);
  const desc = pagina.getByTestId('descargar-pdf-propuesta').first();
  console.log('BOTON DESCARGAR PDF:', await desc.count());
  if (await desc.count()) {
    // B-2: el botón dispara una descarga directa (Content-Disposition), no un
    // popup. El listener se registra ANTES del clic para no perder el evento.
    const [descarga] = await Promise.all([
      pagina.waitForEvent('download', { timeout: 20000 }),
      desc.click(),
    ]);
    const archivo = await guardarDescarga(descarga, '08_documentos', 'propuesta-CNC-1126_08-B');
    resultados.push({ documento: 'propuesta', archivo, sugerido: descarga.suggestedFilename() });
  }
  await captura(pagina, '08_documentos', 'pdf-aprobado-B-panel', { usuario: 'admin' });

  await pagina.goto('/entregas', { waitUntil: 'networkidle' });
  const nota = pagina.getByRole('tab', { name: /Notas/ });
  if (await nota.count()) await nota.dispatchEvent('click');
  await pagina.waitForTimeout(1000);
  const abrir = pagina.getByRole('button', { name: /Abrir/ }).filter({ hasText: /NE-O-1126_07/ }).first();
  console.log('ABRIR NOTA:', await abrir.count());
  if (await abrir.count()) {
    await abrir.dispatchEvent('click');
    await pagina.waitForTimeout(1000);
    await captura(pagina, '08_documentos', 'acta-entrega-detalle', { usuario: 'admin' });
    const enlace = pagina.getByTestId('descargar-acta-NE-O-1126_07-01');
    console.log('ENLACE DESCARGA ACTA:', await enlace.count());
    if (await enlace.count()) {
      // El acta usa PDFDownloadLink (blob local + <a download>): también es descarga.
      const [descarga] = await Promise.all([
        pagina.waitForEvent('download', { timeout: 30000 }),
        enlace.click(),
      ]);
      const archivo = await guardarDescarga(descarga, '08_documentos', 'acta-entrega-NE-O-1126_07-01');
      resultados.push({ documento: 'acta', archivo, sugerido: descarga.suggestedFilename() });
    }
  }
  registrar('admin', '08_documentos', 'descargas', 'ok', { resultados });
  console.log(JSON.stringify(resultados, null, 2));
} catch (e) {
  registrar('admin', '08_documentos', 'descargas', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
