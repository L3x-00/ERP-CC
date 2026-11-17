import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota, guardarDescarga } from './driver.mjs';
import { readFileSync } from 'node:fs';
const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
const resultados = [];
const eventos = [];
pagina.on('console', (m) => { if (m.type() === 'error') eventos.push(`CONSOLE ${m.text().slice(0, 200)}`); });
pagina.on('pageerror', (e) => eventos.push(`PAGEERROR ${e.message.slice(0, 200)}`));
pagina.on('response', (r) => { if (r.status() >= 400) eventos.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });

async function paso(nombre, fn, critico = true) {
  try {
    const r = await fn();
    resultados.push({ paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('admin', '04_propuesta_versiones', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '04_propuesta_versiones', nombre, 'error', { mensaje: msg });
    await captura(pagina, '04_propuesta_versiones', `error2i-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
try {
  await paso('costear-y-guardar-costos-B', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.locator('button[aria-pressed]').filter({ hasText: /^B/ }).first().click();
    await ficha.getByRole('tab', { name: 'Ruteo/Costeo' }).click();
    const costear = pagina.getByRole('button', { name: 'Costear ruteo' });
    const costearHabilitado = await costear.isEnabled();
    if (costearHabilitado) { await costear.click(); await pagina.waitForTimeout(1600); }
    const alternar = pagina.getByTestId('alternar-costeo-interno');
    if ((await alternar.getAttribute('aria-label'))?.includes('Mostrar')) await alternar.click();
    const antes = await pagina.getByTestId('costeo-fabricacion').innerText();
    await pagina.locator('#costo-material').fill('1250');
    await pagina.locator('#costo-gastos_directos').fill('322');
    await pagina.getByLabel('Detalle de Material').fill('Lámina CRS-14 y MDF-12');
    await pagina.getByLabel('Detalle de Otros').fill('Embalaje, consumibles y flete');
    await pagina.getByRole('button', { name: 'Guardar costos' }).click();
    await pagina.waitForTimeout(2200);
    const despues = await pagina.getByTestId('costeo-fabricacion').innerText();
    await captura(pagina, '04_propuesta_versiones', '28-costos-B-guardados-intento', { usuario: 'admin' });
    await pagina.reload({ waitUntil: 'networkidle' });
    return { costearHabilitado, antes: antes.slice(-400), despues: despues.slice(-400), eventos: eventos.slice(0, 8) };
  });

  await paso('estado-tras-recarga', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.locator('button[aria-pressed]').filter({ hasText: /^B/ }).first().click();
    const falt = (await pagina.getByTestId('faltantes-validacion').innerText().catch(() => '')).slice(0, 900);
    const habilitado = await ficha.getByRole('button', { name: 'Validar', exact: true }).first().isEnabled();
    await captura(pagina, '04_propuesta_versiones', '29-estado-final-B', { usuario: 'admin' });
    return { falt, habilitado };
  }, false);
} catch (e) {
  registrar('admin', '04_propuesta_versiones', 'etapa2i_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('04_propuesta_versiones', 'resultado-etapa2i', `# Cierre B\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 7000));
}
