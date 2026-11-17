import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, escribirNota } from './driver.mjs';
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
  await ficha.waitFor();
  const h = (await pagina.locator('h1').allInnerTexts()).join(' | ');
  const cabecera = (await ficha.innerText()).slice(0, 700);
  await ficha.getByRole('tab', { name: 'Ruteo/Costeo' }).click();
  const texto = (await ficha.innerText()).slice(0, 5000);
  const botones = await ficha.getByRole('button').evaluateAll((ns) => ns.map((n) => ({ t: n.innerText.trim(), d: n.disabled, title: n.title })));
  const testids = await ficha.locator('[data-testid]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid')).filter(Boolean));
  console.log('H1:', h);
  console.log('CABECERA:', cabecera);
  console.log('TEXTO RUTEO:', texto);
  console.log('BOTONES:', JSON.stringify(botones, null, 2));
  console.log('TESTIDS:', JSON.stringify(testids, null, 2));
  await captura(pagina, '03_costeo', 'probe-estado-ruteo', { usuario: 'admin' });
  escribirNota('03_costeo', 'probe-ruteo', `# Estado real del ruteo\n\nH1: ${h}\n\nCABECERA:\n${cabecera}\n\nTEXTO:\n${texto}\n\nBOTONES:\n\`\`\`json\n${JSON.stringify(botones, null, 2)}\n\`\`\`\n`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
