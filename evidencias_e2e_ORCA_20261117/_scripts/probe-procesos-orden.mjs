import { abrirNavegador, nuevoContexto, iniciarSesionOperador, captura } from './driver.mjs';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(10000);
try {
  await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
  await pagina.waitForTimeout(800);
  const cards = await pagina.locator('[data-testid^="proceso-"]').evaluateAll((ns) => ns.map((n) => ({
    id: n.getAttribute('data-testid'),
    texto: n.innerText.replace(/\s+/g, ' ').slice(0, 300),
  })));
  console.log(JSON.stringify(cards, null, 2));
  await captura(pagina, '05_produccion', 'probe-procesos-orden', { usuario: 'operador' });
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
