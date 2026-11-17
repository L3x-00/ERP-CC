import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
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
  await pagina.goto(ESTADO.ordenUrl, { waitUntil: 'networkidle' });
  await pagina.waitForTimeout(1000);
  const botones = await pagina.getByRole('button').evaluateAll((ns) => ns.map((n) => ({ t: n.innerText.trim().replace(/\s+/g, ' '), id: n.getAttribute('data-testid'), d: n.disabled })).filter((b) => b.t));
  console.log('BOTONES ORDEN:', JSON.stringify(botones, null, 2));
  await captura(pagina, '08_documentos', 'orden-ficha-final', { usuario: 'admin' });
  const cerrar = pagina.getByTestId('ficha-cierre');
  const habia = (await cerrar.count()) > 0;
  if (habia) {
    await cerrar.dispatchEvent('click');
    await pagina.waitForTimeout(800);
    const conf = pagina.getByTestId('ficha-confirmar-cierre');
    if (await conf.count()) await conf.dispatchEvent('click');
    await pagina.waitForTimeout(2000);
  }
  await pagina.reload({ waitUntil: 'networkidle' });
  const texto = (await pagina.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1400);
  console.log('ESTADO FINAL ORDEN:', texto);
  await captura(pagina, '08_documentos', 'orden-cierre-administrativo-final', { usuario: 'admin' });
  registrar('admin', '08_documentos', 'cierre_orden', habia ? 'ok' : 'error', { habia, estado: texto.slice(0, 400) });
  escribirNota('08_documentos', 'cierre-orden', `# Cierre de orden\n\nBOTONES: ${JSON.stringify(botones)}\nESTADO FINAL: ${texto}\n`);
} catch (e) {
  registrar('admin', '08_documentos', 'cierre_orden', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
