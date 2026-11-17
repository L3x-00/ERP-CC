import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, escribirNota } from './driver.mjs';
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
  const ficha = pagina.getByTestId('ficha-propuesta');
  const botonesRevision = await ficha.locator('button[aria-pressed]').evaluateAll((ns) => ns.map((n) => ({ t: n.innerText.trim(), pressed: n.getAttribute('aria-pressed') })));
  console.log('REVISIONES:', JSON.stringify(botonesRevision, null, 2));
  console.log('CABECERA:', (await ficha.innerText()).slice(0, 900));
  await ficha.getByRole('tab', { name: 'Resumen' }).click();
  const historial = (await pagina.getByTestId('historial-versiones-propuesta').innerText()).slice(0, 1600);
  console.log('HISTORIAL:', historial);
  await captura(pagina, '04_propuesta_versiones', 'probe-revisiones-estado', { usuario: 'admin' });
  escribirNota('04_propuesta_versiones', 'probe-revisiones', `# Estado de revisiones\n\nREVISIONES:\n\`\`\`json\n${JSON.stringify(botonesRevision, null, 2)}\n\`\`\`\n\nHISTORIAL:\n${historial}\n`);
  if (botonesRevision.some((b) => b.t.startsWith('B'))) {
    await ficha.locator('button[aria-pressed]').filter({ hasText: /^B/ }).first().click();
    await pagina.waitForTimeout(800);
    console.log('TRAS SELECCIONAR B:', (await ficha.innerText()).slice(0, 600));
    await captura(pagina, '04_propuesta_versiones', 'probe-revision-B-activa', { usuario: 'admin' });
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
