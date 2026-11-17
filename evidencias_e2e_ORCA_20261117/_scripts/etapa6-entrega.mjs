import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota, guardarDescarga } from './driver.mjs';
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
    registrar('admin', '07_entrega_cobro', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '07_entrega_cobro', nombre, 'error', { mensaje: msg });
    await captura(pagina, '07_entrega_cobro', `error6-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
try {
  await paso('preparar-entrega', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto('/entregas', { waitUntil: 'networkidle' });
    const tabla = (await pagina.getByTestId('tabla-pendientes-entrega').innerText()).slice(0, 1500);
    await captura(pagina, '07_entrega_cobro', '14-cola-entregas', { usuario: 'admin' });
    const boton = pagina.getByTestId('preparar-entrega-O-1126_07');
    const habia = (await boton.count()) > 0;
    if (!habia) throw new Error(`No aparece O-1126_07 en pendientes. Tabla: ${tabla}`);
    await boton.dispatchEvent('click');
    const panel = pagina.getByTestId('panel-preparar-entrega');
    await panel.waitFor();
    const campos = await panel.locator('input,textarea,select').evaluateAll((ns) => ns.map((n) => ({ id: n.id, aria: n.getAttribute('aria-label'), type: n.type, val: n.value })));
    await captura(pagina, '07_entrega_cobro', '15-panel-preparar-entrega', { usuario: 'admin' });
    await panel.getByTestId('entrega-cantidad-0').fill('50');
    await panel.getByTestId('recibido-por-entrega').fill('Laura Méndez');
    await captura(pagina, '07_entrega_cobro', '16-entrega-capturada', { usuario: 'admin' });
    await panel.getByTestId('confirmar-registrar-entrega').dispatchEvent('click');
    await pagina.waitForTimeout(2000);
    const mensaje = (await pagina.getByTestId('entrega-mensaje').innerText().catch(() => '')).slice(0, 400);
    await captura(pagina, '07_entrega_cobro', '17-nota-entrega-generada', { usuario: 'admin' });
    return { tabla, campos, mensaje };
  });

  await paso('modificar-entrega', async () => {
    await pagina.goto('/entregas', { waitUntil: 'networkidle' });
    await pagina.getByRole('tab', { name: /Notas/ }).click().catch(() => {});
    await pagina.waitForTimeout(800);
    const abrir = pagina.getByRole('button', { name: /Ver|Detalle|Abrir/ }).filter({ hasText: /NE-/ }).first();
    const hay = (await abrir.count()) > 0;
    if (!hay) {
      await captura(pagina, '07_entrega_cobro', '18-lista-notas', { usuario: 'admin' });
      return { modificado: false, nota: 'No se encontró botón de detalle de nota en la cola' };
    }
    await abrir.dispatchEvent('click');
    await pagina.waitForTimeout(900);
    await captura(pagina, '07_entrega_cobro', '18-detalle-nota-entrega', { usuario: 'admin' });
    const fecha = pagina.getByTestId('fecha-entrega-edicion');
    const teniaFecha = (await fecha.count()) > 0;
    if (teniaFecha) {
      await fecha.fill(new Date().toISOString().slice(0, 10));
      await pagina.getByTestId('guardar-fecha-entrega').dispatchEvent('click');
      await pagina.waitForTimeout(1200);
    }
    await captura(pagina, '07_entrega_cobro', '19-nota-entrega-modificada', { usuario: 'admin' });
    return { modificado: teniaFecha };
  }, false);
} catch (e) {
  registrar('admin', '07_entrega_cobro', 'etapa6_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('07_entrega_cobro', 'resultado-entrega', `# Entrega\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 9000));
}
