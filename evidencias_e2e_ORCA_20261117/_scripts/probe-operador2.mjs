import { abrirNavegador, nuevoContexto, registrar, dumpPantalla, captura, escribirNota } from './driver.mjs';

const pin = process.argv[2] ?? process.env.E2E_OPERADOR_PIN ?? '';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
try {
  await pagina.goto('/operador', { waitUntil: 'networkidle' });
  for (const d of String(pin)) await pagina.getByRole('button', { name: d, exact: true }).click();
  await pagina.getByRole('button', { name: /^(OK|Confirmar PIN)$/ }).click();
  await pagina.waitForTimeout(8000);
  const despues = await dumpPantalla(pagina);
  const texto = (await pagina.locator('body').innerText()).slice(0, 2500);
  console.log('URL:', despues.url);
  console.log('TEXTO:', texto);
  console.log('BOTONES:', JSON.stringify(despues.botones));
  console.log('TESTIDS:', JSON.stringify(despues.testids));
  await captura(pagina, '00_sesion', 'login-operador-paso2', { usuario: 'operador' });
  escribirNota('00_sesion', 'dump-login-operador-paso2', `# Login operador tras PIN\n\nURL: ${despues.url}\n\nTEXTO:\n${texto}\n\nBOTONES:\n${JSON.stringify(despues.botones)}\n\nTESTIDS:\n${JSON.stringify(despues.testids)}\n`);
  registrar('operador', '00_sesion', 'probe_login_operador_paso2', 'ok', { url: pagina.url() });
} catch (e) {
  registrar('operador', '00_sesion', 'probe_login_operador_paso2', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
