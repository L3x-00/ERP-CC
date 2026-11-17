import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, escribirNota } from './driver.mjs';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(10000);
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();
  await pagina.goto('/inventario', { waitUntil: 'networkidle' });
  const texto = (await pagina.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 5000);
  const idx = texto.indexOf('MDF');
  console.log('INVENTARIO:', texto.slice(0, 1800));
  console.log('MDF CONTEXTO:', idx >= 0 ? texto.slice(Math.max(0, idx - 200), idx + 900) : 'no encontrado');
  const botones = await pagina.getByRole('button').evaluateAll((ns) => ns.map((n) => n.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 60));
  console.log('BOTONES:', JSON.stringify(botones));
  await captura(pagina, '10_validacion_tecnica', 'probe-inventario', { usuario: 'admin' });
  escribirNota('10_validacion_tecnica', 'probe-inventario', `# Inventario\n\n${texto}\n\nBOTONES:\n${JSON.stringify(botones)}\n`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
