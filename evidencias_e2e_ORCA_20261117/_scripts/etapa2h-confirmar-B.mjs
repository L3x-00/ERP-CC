import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
import { readFileSync } from 'node:fs';
const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
const resultados = [];
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
    await captura(pagina, '04_propuesta_versiones', `error2h-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
try {
  await paso('confirmar-ruteo-y-costos', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.locator('button[aria-pressed]').filter({ hasText: /^B/ }).first().click();
    await ficha.getByRole('tab', { name: 'Ruteo/Costeo' }).click();
    const bRuteo = pagina.getByRole('button', { name: 'Guardar ruteo' }).nth(1);
    await bRuteo.scrollIntoViewIfNeeded();
    await bRuteo.click();
    await pagina.waitForTimeout(1800);
    const statusRuteo = (await pagina.getByRole('status').allInnerTexts()).join(' | ');
    const alternar = pagina.getByTestId('alternar-costeo-interno');
    if ((await alternar.getAttribute('aria-label'))?.includes('Mostrar')) await alternar.click();
    await pagina.locator('#costo-gastos_directos').fill('321');
    await pagina.getByLabel('Detalle de Otros').fill('Embalaje y consumibles (revisado)');
    const bCostos = pagina.getByRole('button', { name: 'Guardar costos' });
    await bCostos.scrollIntoViewIfNeeded();
    await bCostos.click();
    await pagina.waitForTimeout(1800);
    const statusCostos = (await pagina.getByRole('status').allInnerTexts()).join(' | ');
    await captura(pagina, '04_propuesta_versiones', '26-confirmacion-ruteo-costos-B', { usuario: 'admin' });
    await pagina.reload({ waitUntil: 'networkidle' });
    return { statusRuteo, statusCostos };
  });

  await paso('verificar-faltantes', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.locator('button[aria-pressed]').filter({ hasText: /^B/ }).first().click();
    const falt = (await pagina.getByTestId('faltantes-validacion').innerText().catch(() => 'sin panel')).slice(0, 900);
    const validar = ficha.getByRole('button', { name: 'Validar', exact: true }).first();
    const habilitado = await validar.isEnabled();
    await captura(pagina, '04_propuesta_versiones', '27-faltantes-tras-confirmar', { usuario: 'admin' });
    return { falt, habilitado };
  }, false);
} catch (e) {
  registrar('admin', '04_propuesta_versiones', 'etapa2h_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('04_propuesta_versiones', 'resultado-etapa2h', `# Confirmación B\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 6000));
}
