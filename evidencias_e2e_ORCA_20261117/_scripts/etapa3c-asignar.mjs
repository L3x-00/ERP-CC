import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
import { readFileSync } from 'node:fs';
const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
const resultados = [];
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();
  const historial = [];
  for (let i = 0; i < 6; i += 1) {
    await pagina.goto('/planeacion', { waitUntil: 'networkidle' });
    const bolsa = (await pagina.getByTestId('bolsa-planeacion').innerText()).replace(/\s+/g, ' ');
    const ids = await pagina.locator('[data-testid^="asignar-sugerencia-"]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid')));
    const mios = bolsa.includes('O-1126_07');
    historial.push({ i, mios, ids, bolsa: bolsa.slice(-420) });
    if (!mios || ids.length === 0) break;
    await pagina.locator(`[data-testid="${ids[0]}"]`).dispatchEvent('click');
    await pagina.waitForTimeout(2500);
  }
  await captura(pagina, '05_produccion', '07-asignacion-iterada', { usuario: 'admin' });
  registrar('admin', '05_produccion', 'asignacion_iterada', 'ok', { pasos: historial.length });
  escribirNota('05_produccion', 'asignacion-iterada', `# Asignación iterada\n\n\`\`\`json\n${JSON.stringify(historial, null, 2)}\n\`\`\`\n`);
  console.log(JSON.stringify(historial, null, 2).slice(0, 6000));
} catch (e) {
  registrar('admin', '05_produccion', 'etapa3c_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
