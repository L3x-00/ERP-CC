import { abrirNavegador, nuevoContexto, iniciarSesionOperador, captura, escribirNota } from './driver.mjs';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
try {
  await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
  await pagina.waitForTimeout(1500);
  const cuerpo = (await pagina.locator('body').innerText()).replace(/\s+/g, ' ');
  const idx = cuerpo.indexOf('O-1126_07');
  console.log('TABLA (recorte):', idx >= 0 ? cuerpo.slice(Math.max(0, idx - 250), idx + 900) : 'NO APARECE O-1126_07');
  const testids = await pagina.locator('[data-testid]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid')).filter((x) => x && /proceso-|abrir-detalle|orden-operador/.test(x)));
  console.log('TESTIDS PROCESO:', JSON.stringify(testids, null, 2));
  await captura(pagina, '05_produccion', 'probe-tablero-operador-orden', { usuario: 'operador' });
  const mios = testids.filter((t) => t && t.includes('O-1126_07'));
  const proceso = testids.find((t) => t.startsWith('proceso-') && !t.includes(':')) ?? testids.find((t) => t.startsWith('proceso-'));
  const abrir = testids.find((t) => t.startsWith('abrir-detalle-'));
  if (abrir) {
    await pagina.locator(`[data-testid="${abrir}"]`).first().click();
    await pagina.getByTestId('detalle-proceso').waitFor({ timeout: 10000 });
    await pagina.waitForTimeout(1000);
    const detalle = (await pagina.getByTestId('detalle-proceso').innerText()).replace(/\s+/g, ' ').slice(0, 3000);
    const botones = await pagina.getByTestId('detalle-proceso').getByRole('button').evaluateAll((ns) => ns.map((n) => ({ t: n.innerText.trim().replace(/\s+/g, ' '), id: n.getAttribute('data-testid'), d: n.disabled })));
    console.log('DETALLE:', detalle);
    console.log('BOTONES DETALLE:', JSON.stringify(botones, null, 2));
    await captura(pagina, '05_produccion', 'probe-detalle-proceso', { usuario: 'operador' });
    escribirNota('05_produccion', 'probe-detalle-proceso', `# Detalle de proceso\n\n${detalle}\n\nBOTONES:\n\`\`\`json\n${JSON.stringify(botones, null, 2)}\n\`\`\`\n`);
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
