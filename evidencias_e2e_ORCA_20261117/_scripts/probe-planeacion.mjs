import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, escribirNota } from './driver.mjs';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(10000);
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();
  await pagina.goto('/planeacion', { waitUntil: 'networkidle' });
  const bolsa = (await pagina.getByTestId('bolsa-planeacion').innerText()).slice(0, 3000);
  const botones = await pagina.getByTestId('bolsa-planeacion').getByRole('button').evaluateAll((ns) => ns.map((n) => ({ t: n.innerText.trim().replace(/\s+/g, ' '), aria: n.getAttribute('aria-label'), disabled: n.disabled })));
  console.log('BOLSA:', bolsa);
  console.log('BOTONES:', JSON.stringify(botones, null, 2));
  await captura(pagina, '05_produccion', 'probe-bolsa-planeacion', { usuario: 'admin' });
  escribirNota('05_produccion', 'probe-planeacion', `# Bolsa de planeación\n\n${bolsa}\n\nBOTONES:\n\`\`\`json\n${JSON.stringify(botones, null, 2)}\n\`\`\`\n`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
