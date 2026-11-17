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
  await ficha.locator('button[aria-pressed]').filter({ hasText: /^B/ }).first().click();
  await ficha.getByRole('tab', { name: 'Ruteo/Costeo' }).click();
  const texto = (await pagina.getByTestId('panel-ruteo-costeo').innerText()).slice(0, 5000);
  const botones = await pagina.getByTestId('panel-ruteo-costeo').getByRole('button').evaluateAll((ns) => ns.map((n) => ({ t: n.innerText.trim().replace(/\s+/g, ' '), d: n.disabled, title: n.title, aria: n.getAttribute('aria-label') })));
  console.log('TEXTO:', texto);
  console.log('BOTONES:', JSON.stringify(botones, null, 2));
  await captura(pagina, '04_propuesta_versiones', 'probe-confirmar-B', { usuario: 'admin' });
  escribirNota('04_propuesta_versiones', 'probe-confirmar-B', `# B: confirmación de ruteo/costos\n\nTEXTO:\n${texto}\n\nBOTONES:\n\`\`\`json\n${JSON.stringify(botones, null, 2)}\n\`\`\`\n`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
