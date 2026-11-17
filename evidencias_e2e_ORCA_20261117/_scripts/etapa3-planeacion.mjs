import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota, guardarDescarga } from './driver.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
const resultados = [];
async function paso(etapa, nombre, fn, critico = true) {
  try {
    const r = await fn();
    resultados.push({ etapa, paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('admin', etapa, nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ etapa, paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', etapa, nombre, 'error', { mensaje: msg });
    await captura(pagina, etapa, `error3-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
try {
  await paso('05_produccion', 'login', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
  });

  await paso('05_produccion', 'asignar-operaciones', async () => {
    await pagina.goto('/planeacion', { waitUntil: 'networkidle' });
    const antes = (await pagina.getByTestId('bolsa-planeacion').innerText()).slice(0, 1800);
    for (let i = 0; i < 2; i += 1) {
      const b = pagina.getByRole('button', { name: 'Asignar aquí' }).first();
      if (!(await b.count())) break;
      await b.click({ force: true });
      await pagina.waitForTimeout(1500);
    }
    const despues = (await pagina.getByTestId('bolsa-planeacion').innerText()).slice(0, 1800);
    await captura(pagina, '05_produccion', '02-operaciones-asignadas', { usuario: 'admin' });
    return { antes: antes.slice(-700), despues: despues.slice(-700) };
  });

  await paso('05_produccion', 'liberar-orden', async () => {
    await pagina.goto('/ordenes', { waitUntil: 'networkidle' });
    const abrir = pagina.getByTestId('abrir-ficha-O-1126_07');
    await abrir.waitFor({ timeout: 15000 });
    await abrir.click();
    await pagina.waitForTimeout(1200);
    ESTADO.ordenUrl = pagina.url();
    ESTADO.ordenId = new URL(pagina.url()).pathname.split('/').pop();
    const antes = (await pagina.locator('body').innerText()).slice(0, 1400);
    await captura(pagina, '05_produccion', '03-ficha-orden-antes-liberar', { usuario: 'admin' });
    const liberar = pagina.getByRole('button', { name: 'Liberar' }).first();
    const habia = (await liberar.count()) > 0;
    if (habia) { await liberar.click(); await pagina.waitForTimeout(1800); }
    await pagina.reload({ waitUntil: 'networkidle' });
    const despues = (await pagina.locator('body').innerText()).slice(0, 1400);
    await captura(pagina, '05_produccion', '04-orden-liberada', { usuario: 'admin' });
    return { habia, antes: antes.slice(0, 700), despues: despues.slice(0, 700), url: pagina.url() };
  });
} catch (e) {
  registrar('admin', '05_produccion', 'etapa3_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('05_produccion', 'resultado-etapa3', `# Planeación y liberación\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 8000));
}
