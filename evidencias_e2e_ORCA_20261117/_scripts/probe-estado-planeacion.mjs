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
  await pagina.goto('/planeacion', { waitUntil: 'networkidle' });
  console.log('BOLSA TRAS RECARGA:', (await pagina.getByTestId('bolsa-planeacion').innerText()).slice(-1200));
  await pagina.goto(ESTADO.ordenUrl, { waitUntil: 'networkidle' });
  const txt = (await pagina.locator('body').innerText()).slice(0, 2200);
  const botones = await pagina.getByRole('button').evaluateAll((ns) => ns.map((n) => n.innerText.trim()).filter(Boolean).slice(-40));
  console.log('ORDEN:', txt);
  console.log('BOTONES:', JSON.stringify(botones));
  await captura(pagina, '05_produccion', 'probe-estado-orden', { usuario: 'admin' });
  escribirNota('05_produccion', 'probe-estado-planeacion', `# Estado tras asignación\n\nORDEN:\n${txt}\n\nBOTONES:\n${JSON.stringify(botones)}\n`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
