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
    await captura(pagina, '07_entrega_cobro', `error6b-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
try {
  await paso('login', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
  });

  await paso('entrega', async () => {
    await pagina.goto('/entregas', { waitUntil: 'networkidle' });
    const tabla = (await pagina.getByTestId('tabla-pendientes-entrega').innerText()).slice(0, 1200);
    const boton = pagina.getByTestId('preparar-entrega-O-1126_07');
    if (!(await boton.count())) throw new Error(`Sin botón de entrega. ${tabla}`);
    await boton.dispatchEvent('click');
    const panel = pagina.getByTestId('panel-preparar-entrega');
    await panel.waitFor();
    await captura(pagina, '07_entrega_cobro', '25-panel-entrega-final', { usuario: 'admin' });
    const cantidad = panel.locator('input[type="number"]').first();
    await cantidad.fill('75');
    const recibido = panel.getByTestId('recibido-por-entrega');
    if (await recibido.count()) await recibido.fill('Laura Méndez');
    await captura(pagina, '07_entrega_cobro', '26-entrega-llena', { usuario: 'admin' });
    await panel.getByTestId('confirmar-registrar-entrega').dispatchEvent('click');
    await pagina.waitForTimeout(2200);
    const mensaje = (await pagina.getByTestId('entrega-mensaje').innerText().catch(() => '')).slice(0, 400);
    await captura(pagina, '07_entrega_cobro', '27-nota-entrega-final', { usuario: 'admin' });
    return { tabla, mensaje };
  });

  await paso('nota-entrega-detalle-y-descarga', async () => {
    await pagina.goto('/entregas', { waitUntil: 'networkidle' });
    const nota = pagina.getByRole('tab', { name: /Notas/ });
    if (await nota.count()) await nota.dispatchEvent('click');
    await pagina.waitForTimeout(1000);
    const texto = (await pagina.locator('body').innerText()).replace(/\s+/g, ' ');
    const idx = texto.indexOf('NE-O-1126_07');
    await captura(pagina, '08_documentos', 'acta-entrega-lista', { usuario: 'admin' });
    const imprimir = pagina.getByRole('button', { name: /Imprimir|Ver nota|Abrir/ }).first();
    if (await imprimir.count()) {
      try {
        const [popup] = await Promise.all([pagina.waitForEvent('popup', { timeout: 6000 }), imprimir.dispatchEvent('click')]);
        await popup.waitForLoadState('domcontentloaded');
        await popup.pdf({ path: 'evidencias_e2e_ORCA_20261117/08_documentos/acta-entrega-NE-O-1126_07.pdf' }).catch(() => {});
        await popup.close();
      } catch { /* sin popup */ }
    }
    return { contexto: idx >= 0 ? texto.slice(idx, idx + 500) : texto.slice(-700) };
  }, false);

  await paso('cobro', async () => {
    await pagina.goto('/cobros', { waitUntil: 'networkidle' });
    await pagina.waitForTimeout(800);
    const texto = (await pagina.locator('body').innerText()).replace(/\s+/g, ' ');
    const idx = texto.indexOf('O-1126_07');
    await captura(pagina, '07_entrega_cobro', '28-cobros-cola', { usuario: 'admin' });
    const fila = pagina.getByRole('row', { name: /O-1126_07/ }).first();
    const habiaFila = (await fila.count()) > 0;
    if (!habiaFila) return { habiaFila, contexto: idx >= 0 ? texto.slice(idx, idx + 500) : 'sin fila' };
    const factura = fila.getByRole('button', { name: 'Factura' });
    if (await factura.count()) {
      await factura.dispatchEvent('click');
      await pagina.waitForTimeout(600);
      const venc = pagina.getByLabel('Fecha de vencimiento');
      if (await venc.count()) await venc.fill(new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10));
      await pagina.getByRole('button', { name: 'Guardar factura' }).dispatchEvent('click');
      await pagina.waitForTimeout(1500);
    }
    const cobrar = fila.getByRole('button', { name: 'Cobrar' });
    if (await cobrar.count()) {
      await cobrar.dispatchEvent('click');
      await pagina.waitForTimeout(600);
      await pagina.getByLabel('Monto').fill('128470');
      await pagina.getByLabel('Referencia bancaria').fill('E2E-QA1711-001');
      await captura(pagina, '07_entrega_cobro', '29-formulario-cobro', { usuario: 'admin' });
      await pagina.getByRole('button', { name: 'Registrar pago' }).dispatchEvent('click');
      await pagina.waitForTimeout(1800);
    }
    await captura(pagina, '07_entrega_cobro', '30-cobro-registrado', { usuario: 'admin' });
    return { habiaFila, contexto: (await pagina.locator('body').innerText()).replace(/\s+/g, ' ').slice(-800) };
  }, false);

  await paso('cierre-administrativo', async () => {
    await pagina.goto('/cierre-administrativo', { waitUntil: 'networkidle' });
    const fila = pagina.getByTestId('cierre-fila-O-1126_07');
    const habia = (await fila.count()) > 0;
    await captura(pagina, '07_entrega_cobro', '31-panel-cierre-administrativo', { usuario: 'admin' });
    if (!habia) return { habia, nota: 'Orden no aparece en cierre administrativo' };
    await fila.dispatchEvent('click');
    await pagina.waitForTimeout(900);
    const detalle = (await pagina.getByTestId('detalle-cierre-administrativo').innerText().catch(() => '')).slice(0, 1400);
    await captura(pagina, '07_entrega_cobro', '32-detalle-cierre', { usuario: 'admin' });
    const cerrar = pagina.getByRole('button', { name: /Completar cierre administrativo|Cerrar administrativa/ }).first();
    const teniaBoton = (await cerrar.count()) > 0;
    if (teniaBoton) {
      await cerrar.dispatchEvent('click');
      await pagina.waitForTimeout(700);
      const conf = pagina.getByTestId('ficha-confirmar-cierre');
      if (await conf.count()) await conf.dispatchEvent('click');
      await pagina.waitForTimeout(1800);
    }
    await captura(pagina, '07_entrega_cobro', '33-cierre-administrativo-final', { usuario: 'admin' });
    return { habia, detalle, teniaBoton };
  }, false);
} catch (e) {
  registrar('admin', '07_entrega_cobro', 'etapa6b_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('07_entrega_cobro', 'resultado-cierre-comercial', `# Cierre comercial\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 11000));
}
