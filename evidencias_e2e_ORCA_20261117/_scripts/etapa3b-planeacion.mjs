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
    await captura(pagina, '05_produccion', `error3b-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
try {
  await paso('asignar-todas', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto('/planeacion', { waitUntil: 'networkidle' });
    const asignadas = [];
    for (let i = 0; i < 6; i += 1) {
      const cards = await pagina.locator('[data-testid^="asignar-sugerencia-"]').evaluateAll((ns) =>
        ns.map((n) => ({ id: n.getAttribute('data-testid'), texto: n.closest('div')?.parentElement?.innerText?.slice(0, 300) ?? '' })),
      );
      const mia = cards.find((c) => c.texto.includes('O-1126_07'));
      if (!mia) break;
      await pagina.locator(`[data-testid="${mia.id}"]`).dispatchEvent('click');
      await pagina.waitForTimeout(1800);
      asignadas.push(mia.texto.replace(/\s+/g, ' ').slice(0, 140));
    }
    await pagina.reload({ waitUntil: 'networkidle' });
    const bolsa = (await pagina.getByTestId('bolsa-planeacion').innerText()).slice(-1000);
    await captura(pagina, '05_produccion', '05-todas-operaciones-asignadas', { usuario: 'admin' });
    return { asignadas, bolsa };
  });

  await paso('liberar-orden', async () => {
    await pagina.goto(ESTADO.ordenUrl, { waitUntil: 'networkidle' });
    const antes = (await pagina.locator('body').innerText()).slice(0, 1200);
    const liberar = pagina.getByRole('button', { name: 'Liberar' }).first();
    const habia = (await liberar.count()) > 0;
    if (habia) await liberar.dispatchEvent('click');
    await pagina.waitForTimeout(2000);
    await pagina.reload({ waitUntil: 'networkidle' });
    const despues = (await pagina.locator('body').innerText()).slice(0, 1200);
    const botones = await pagina.getByRole('button').evaluateAll((ns) => ns.map((n) => n.innerText.trim()).filter(Boolean).slice(-25));
    await captura(pagina, '05_produccion', '06-orden-estado-tras-liberar', { usuario: 'admin' });
    return { habia, antes: antes.slice(-500), despues: despues.slice(0, 500), botones };
  }, false);
} catch (e) {
  registrar('admin', '05_produccion', 'etapa3b_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('05_produccion', 'resultado-etapa3b', `# Planeación 3b\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 8000));
}
