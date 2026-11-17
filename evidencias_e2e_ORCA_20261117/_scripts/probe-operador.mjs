import { abrirNavegador, nuevoContexto, registrar, dumpPantalla, captura, escribirNota } from './driver.mjs';

const pin = process.argv[2] ?? process.env.E2E_OPERADOR_PIN ?? '';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
try {
  await pagina.goto('/operador', { waitUntil: 'networkidle' });
  const antes = await dumpPantalla(pagina);
  console.log('ANTES:', JSON.stringify(antes, null, 2));
  await captura(pagina, '00_sesion', 'login-operador-teclado', { usuario: 'operador' });
  for (const d of String(pin)) await pagina.getByRole('button', { name: d, exact: true }).click();
  await pagina.getByRole('button', { name: 'Confirmar PIN' }).click();
  await pagina.waitForTimeout(1500);
  const despues = await dumpPantalla(pagina);
  console.log('DESPUES:', JSON.stringify(despues, null, 2));
  await captura(pagina, '00_sesion', 'login-operador-resultado', { usuario: 'operador' });
  escribirNota('00_sesion', 'dump-login-operador', `# Login operador\n\nANTES:\n\`\`\`json\n${JSON.stringify(antes, null, 2)}\n\`\`\`\n\nDESPUES:\n\`\`\`json\n${JSON.stringify(despues, null, 2)}\n\`\`\`\n`);
  registrar('operador', '00_sesion', 'probe_login_operador', 'ok', { url: pagina.url() });
} catch (e) {
  registrar('operador', '00_sesion', 'probe_login_operador', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
