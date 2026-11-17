import { abrirNavegador, nuevoContexto, iniciarSesionAdmin } from './driver.mjs';
import { readFileSync } from 'node:fs';
const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(10000);
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();
  await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
  await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ruteo/Costeo' }).click();
  const info = await pagina.getByRole('button', { name: 'Guardar ruteo' }).evaluateAll((ns) => ns.map((n) => {
    const r = n.getBoundingClientRect();
    return { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, visible: !!n.offsetParent, aria: n.getAttribute('aria-label'), id: n.id, title: n.title };
  }));
  console.log('INFO:', JSON.stringify(info, null, 2));
  for (let i = 0; i < info.length; i += 1) {
    await pagina.locator('[aria-label="Setup horas IT02 fila 1"]').fill('0.5');
    await pagina.locator('[aria-label="Run horas IT02 fila 1"]').fill('1.5');
    await pagina.getByRole('button', { name: 'Guardar ruteo' }).nth(i).click({ force: true });
    await pagina.waitForTimeout(2000);
    console.log(`TRAS BOTON ${i}: STATUS=`, (await pagina.getByRole('status').allInnerTexts()).join(' | '), 'MARCADORES=', await pagina.locator('[data-testid^="ruteo-sin-guardar-"]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid'))));
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
