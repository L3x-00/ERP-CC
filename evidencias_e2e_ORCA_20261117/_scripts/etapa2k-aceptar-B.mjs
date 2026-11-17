import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
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
    registrar('admin', '05_produccion', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '05_produccion', nombre, 'error', { mensaje: msg });
    await captura(pagina, '04_propuesta_versiones', `error2k-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
async function seleccionar(letra) {
  await pagina.getByTestId('ficha-propuesta').locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${letra}\\b`) }).first().click();
  await pagina.waitForTimeout(500);
}
try {
  await paso('historial-versiones', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.getByRole('tab', { name: 'Resumen' }).click();
    const historial = (await pagina.getByTestId('historial-versiones-propuesta').innerText()).slice(0, 2200);
    await captura(pagina, '04_propuesta_versiones', '37-historial-A-B-C', { usuario: 'admin' });
    return { historial };
  });

  await paso('aceptar-B', async () => {
    await seleccionar('B');
    const ficha = pagina.getByTestId('ficha-propuesta');
    await pagina.getByLabel('Fecha compromiso comercial').fill(new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10));
    await captura(pagina, '04_propuesta_versiones', '38-aceptar-rev-B', { usuario: 'admin' });
    await ficha.getByRole('button', { name: 'Aceptar revisión' }).click();
    await pagina.waitForTimeout(2200);
    await pagina.reload({ waitUntil: 'networkidle' });
    const cabecera = (await pagina.getByTestId('ficha-propuesta').innerText()).slice(0, 1500);
    await captura(pagina, '04_propuesta_versiones', '39-rev-B-aceptada', { usuario: 'admin' });
    return { cabecera };
  });

  await paso('verificar-solo-lectura-A-C', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    const out = {};
    for (const letra of ['A', 'C']) {
      await seleccionar(letra);
      const txt = (await ficha.innerText()).slice(0, 600);
      const botones = await ficha.getByRole('button').evaluateAll((ns) => ns.map((n) => n.innerText.trim()).filter(Boolean).slice(0, 25));
      out[letra] = { txt, botones, tieneAceptar: botones.includes('Aceptar revisión'), tieneNuevaVersion: botones.includes('Crear nueva versión') };
      await captura(pagina, '04_propuesta_versiones', `40-version-${letra}-solo-lectura`, { usuario: 'admin' });
    }
    return out;
  }, false);

  await paso('verificar-orden-generada', async () => {
    await pagina.goto('/ordenes', { waitUntil: 'networkidle' });
    const tabla = (await pagina.getByTestId('tabla-ordenes').innerText()).slice(0, 2000);
    await captura(pagina, '05_produccion', '01-orden-generada-desde-propuesta', { usuario: 'admin' });
    const fila = pagina.getByRole('row', { name: /QA1711|Soporte metálico/ }).first();
    const textoFila = await fila.innerText().catch(() => 'sin fila');
    return { tabla: tabla.slice(0, 900), textoFila };
  }, false);
} catch (e) {
  registrar('admin', '05_produccion', 'etapa2k_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('04_propuesta_versiones', 'resultado-etapa2k', `# Aceptación de B\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 11000));
}
