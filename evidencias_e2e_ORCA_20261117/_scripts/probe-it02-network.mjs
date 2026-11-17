import { abrirNavegador, nuevoContexto, iniciarSesionAdmin } from './driver.mjs';
import { readFileSync } from 'node:fs';
const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(10000);
const eventos = [];
pagina.on('console', (m) => { if (m.type() === 'error') eventos.push(`CONSOLE: ${m.text()}`); });
pagina.on('pageerror', (e) => eventos.push(`PAGEERROR: ${e.message}`));
pagina.on('response', (r) => { if (r.status() >= 400) eventos.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`); });
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();
  await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
  await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ruteo/Costeo' }).click();
  const selects = await pagina.getByTestId('panel-ruteo-costeo').locator('select').evaluateAll((ns) => ns.map((n) => ({ aria: n.getAttribute('aria-label'), val: n.value, texto: n.options[n.selectedIndex]?.text })));
  console.log('SELECTS:', JSON.stringify(selects, null, 2));
  await pagina.locator('[aria-label="Setup horas IT02 fila 1"]').fill('0.5');
  await pagina.locator('[aria-label="Run horas IT02 fila 1"]').fill('1.5');
  const b = pagina.getByRole('button', { name: 'Guardar ruteo' }).last();
  await b.click();
  await pagina.waitForTimeout(3000);
  console.log('EVENTOS:', eventos.join('\n'));
  console.log('HTML BOTON IT02:', (await b.evaluate((n) => n.parentElement?.outerHTML)).slice(0, 800));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
