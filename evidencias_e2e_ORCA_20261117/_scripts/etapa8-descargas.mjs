import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar } from './driver.mjs';
import { readFileSync } from 'node:fs';
const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();

  await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
  const ficha = pagina.getByTestId('ficha-propuesta');
  await ficha.locator('button[aria-pressed]').filter({ hasText: /^B/ }).first().dispatchEvent('click');
  await ficha.getByRole('tab', { name: 'PDFs' }).dispatchEvent('click');
  await pagina.waitForTimeout(1000);
  const desc = pagina.getByRole('button', { name: /Descargar PDF/ }).first();
  console.log('BOTON DESCARGAR PDF:', await desc.count());
  if (await desc.count()) {
    const [popup] = await Promise.all([pagina.waitForEvent('popup', { timeout: 8000 }).catch(() => null), desc.dispatchEvent('click')]);
    await pagina.waitForTimeout(800);
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {});
      const url = popup.url();
      console.log('URL PDF:', url.slice(0, 120));
      await popup.pdf({ path: 'evidencias_e2e_ORCA_20261117/08_documentos/propuesta-CNC-1126_08-B.pdf', format: 'A4' }).catch((e) => console.log('pdf error', e.message));
      await popup.close();
    } else {
      const descarga = await pagina.waitForEvent('download', { timeout: 5000 }).catch(() => null);
      if (descarga) await descarga.saveAs('evidencias_e2e_ORCA_20261117/08_documentos/propuesta-CNC-1126_08-B.pdf');
    }
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
    const imprimir = pagina.getByRole('button', { name: /Imprimir|Descargar|Ver documento/ }).first();
    if (await imprimir.count()) {
      const [popup] = await Promise.all([pagina.waitForEvent('popup', { timeout: 8000 }).catch(() => null), imprimir.dispatchEvent('click')]);
      if (popup) {
        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        await popup.pdf({ path: 'evidencias_e2e_ORCA_20261117/08_documentos/acta-entrega-NE-O-1126_07-01.pdf', format: 'A4' }).catch(() => {});
        await popup.close();
      }
    }
  }
  registrar('admin', '08_documentos', 'descargas', 'ok', { nota: 'Se intentó PDF de propuesta B y acta de entrega' });
} catch (e) {
  registrar('admin', '08_documentos', 'descargas', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
