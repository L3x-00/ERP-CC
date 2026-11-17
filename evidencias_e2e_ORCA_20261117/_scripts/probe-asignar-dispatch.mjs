import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura } from './driver.mjs';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(10000);
const eventos = [];
pagina.on('console', (m) => { if (m.type() === 'error') eventos.push(`CONSOLE ${m.text().slice(0, 250)}`); });
pagina.on('response', (r) => { if (r.status() >= 400) eventos.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();
  await pagina.goto('/planeacion', { waitUntil: 'networkidle' });
  const botones = pagina.locator('[data-testid^="asignar-sugerencia-"]');
  console.log('NUM SUGERENCIAS:', await botones.count());
  for (let i = 0; i < 2; i += 1) {
    const b = botones.first();
    if (!(await b.count())) break;
    const id = await b.getAttribute('data-testid');
    await b.dispatchEvent('click');
    await pagina.waitForTimeout(2000);
    console.log(`TRAS ${id}: STATUS=`, (await pagina.getByRole('status').allInnerTexts()).join(' | ').slice(0, 400), 'ALERT=', (await pagina.getByRole('alert').allInnerTexts()).join(' | ').slice(0, 400));
  }
  console.log('EVENTOS:', eventos.slice(0, 10).join('\n'));
  await captura(pagina, '05_produccion', 'probe-asignar-dispatch', { usuario: 'admin' });
  await pagina.reload({ waitUntil: 'networkidle' });
  console.log('BOLSA TRAS RECARGA:', (await pagina.getByTestId('bolsa-planeacion').innerText()).slice(-900));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
