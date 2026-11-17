import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
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
    await captura(pagina, '07_entrega_cobro', `error6d-${nombre}`, { usuario: 'admin' }).catch(() => {});
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

  await paso('cobro', async () => {
    await pagina.goto('/cobros', { waitUntil: 'networkidle' });
    await pagina.waitForTimeout(1000);
    const fila = pagina.getByRole('row', { name: /O-1126_07/ }).first();
    if (!(await fila.count())) throw new Error('Sin fila O-1126_07');
    const estado = (await fila.innerText()).replace(/\s+/g, ' ').slice(0, 400);
    await captura(pagina, '07_entrega_cobro', '36-cuenta-cobrable', { usuario: 'admin' });
    const factura = fila.getByRole('button', { name: 'Factura' });
    if (await factura.count()) {
      await factura.dispatchEvent('click');
      await pagina.waitForTimeout(600);
      const num = pagina.getByLabel('Número de factura o remisión');
      if (await num.count()) await num.fill('FAC-E2E-QA1711-001');
      await pagina.getByRole('button', { name: 'Guardar factura' }).dispatchEvent('click');
      await pagina.waitForTimeout(1400);
    }
    const cobrar = fila.getByRole('button', { name: 'Cobrar' });
    if (await cobrar.count()) {
      await cobrar.dispatchEvent('click');
      await pagina.waitForTimeout(700);
      const campos = await pagina.locator('input').evaluateAll((ns) => ns.map((n) => ({ aria: n.getAttribute('aria-label'), id: n.id, val: n.value, type: n.type })));
      const monto = pagina.getByLabel('Monto').first();
      if (await monto.count()) await monto.fill('128470');
      const ref = pagina.getByLabel('Referencia bancaria').first();
      if (await ref.count()) await ref.fill('E2E-QA1711-001');
      await captura(pagina, '07_entrega_cobro', '37-formulario-cobro-final', { usuario: 'admin' });
      await pagina.getByRole('button', { name: 'Registrar pago' }).dispatchEvent('click');
      await pagina.waitForTimeout(2200);
    }
    await captura(pagina, '07_entrega_cobro', '38-pago-registrado', { usuario: 'admin' });
    const texto = (await pagina.locator('body').innerText()).replace(/\s+/g, ' ');
    const rec = texto.match(/REC-\d{6}/);
    return { estado, rec: rec ? rec[0] : null, cola: texto.slice(-700) };
  });

  await paso('cierre-administrativo', async () => {
    await pagina.goto('/cierre-administrativo', { waitUntil: 'networkidle' });
    const fila = pagina.getByTestId('cierre-fila-O-1126_07');
    if (!(await fila.count())) throw new Error('Sin fila de cierre para O-1126_07');
    await fila.dispatchEvent('click');
    await pagina.waitForTimeout(1800);
    const detalle = (await pagina.getByTestId('detalle-cierre-administrativo').innerText().catch(() => '')).slice(0, 1800);
    await captura(pagina, '07_entrega_cobro', '39-detalle-cierre-completo', { usuario: 'admin' });
    const botones = await pagina.getByRole('button').evaluateAll((ns) => ns.map((n) => n.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(-25));
    const cerrar = pagina.getByRole('button', { name: /Completar cierre administrativo|Cerrar administrativa/ }).first();
    const habia = (await cerrar.count()) > 0;
    if (habia) {
      await cerrar.dispatchEvent('click');
      await pagina.waitForTimeout(700);
      const conf = pagina.getByTestId('ficha-confirmar-cierre');
      if (await conf.count()) await conf.dispatchEvent('click');
      await pagina.waitForTimeout(2000);
    }
    await captura(pagina, '07_entrega_cobro', '40-cierre-administrativo-final', { usuario: 'admin' });
    return { detalle, botones, habia };
  }, false);

  await paso('modificar-nota-entrega', async () => {
    await pagina.goto('/entregas', { waitUntil: 'networkidle' });
    const nota = pagina.getByRole('tab', { name: /Notas/ });
    if (await nota.count()) await nota.dispatchEvent('click');
    await pagina.waitForTimeout(1000);
    const abrir = pagina.getByRole('button', { name: /Abrir/ }).filter({ hasText: /NE-O-1126_07/ }).first();
    const habia = (await abrir.count()) > 0;
    if (!habia) return { habia };
    await abrir.dispatchEvent('click');
    await pagina.waitForTimeout(1000);
    const fecha = pagina.getByTestId('fecha-entrega-edicion');
    if (await fecha.count()) {
      await fecha.fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
      await pagina.getByTestId('guardar-fecha-entrega').dispatchEvent('click');
      await pagina.waitForTimeout(1400);
    }
    await captura(pagina, '07_entrega_cobro', '41-nota-entrega-modificada', { usuario: 'admin' });
    return { habia, fecha: await fecha.inputValue().catch(() => null) };
  }, false);
} catch (e) {
  registrar('admin', '07_entrega_cobro', 'etapa6d_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('07_entrega_cobro', 'resultado-cobro-cierre', `# Cobro y cierre\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 11000));
}
