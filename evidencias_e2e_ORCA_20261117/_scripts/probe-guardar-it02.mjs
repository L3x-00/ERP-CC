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
  await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ruteo/Costeo' }).click();
  console.log('MARCADORES INICIALES:', await pagina.locator('[data-testid^="ruteo-sin-guardar-"]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid'))));
  const botones = pagina.getByRole('button', { name: 'Guardar ruteo' });
  console.log('BOTONES GUARDAR:', await botones.count(), await botones.evaluateAll((ns) => ns.map((n) => ({ disabled: n.disabled, text: n.innerText.trim() }))));
  await pagina.locator('[aria-label="Setup horas IT02 fila 1"]').fill('0.5');
  await pagina.locator('[aria-label="Run horas IT02 fila 1"]').fill('1.5');
  console.log('VALORES IT02:', await pagina.locator('[aria-label="Setup horas IT02 fila 1"]').inputValue(), await pagina.locator('[aria-label="Run horas IT02 fila 1"]').inputValue());
  await captura(pagina, '03_costeo', 'probe-it02-antes-guardar', { usuario: 'admin' });
  const b = botones.last();
  await b.click();
  await pagina.waitForTimeout(2500);
  console.log('MARCADORES DESPUES:', await pagina.locator('[data-testid^="ruteo-sin-guardar-"]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid'))));
  console.log('STATUS:', (await pagina.getByRole('status').allInnerTexts()).join(' | '));
  console.log('ALERTAS:', (await pagina.getByRole('alert').allInnerTexts()).join(' | '));
  console.log('BOTONES DESPUES:', await botones.count(), await botones.evaluateAll((ns) => ns.map((n) => ({ disabled: n.disabled, text: n.innerText.trim() }))));
  await captura(pagina, '03_costeo', 'probe-it02-despues-guardar', { usuario: 'admin' });
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
