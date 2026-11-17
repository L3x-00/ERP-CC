import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
import { readFileSync } from 'node:fs';
const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(10000);
const resultados = [];

async function paso(nombre, fn, critico = true) {
  try {
    const r = await fn();
    resultados.push({ paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('admin', '03_costeo', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1800);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '03_costeo', nombre, 'error', { mensaje: msg });
    await captura(pagina, '03_costeo', `error2c-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}

try {
  await paso('inspeccionar-y-llenar', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ruteo/Costeo' }).click();
    const inputs = await pagina.getByTestId('panel-ruteo-costeo').locator('input').evaluateAll((ns) =>
      ns.map((n) => ({ aria: n.getAttribute('aria-label'), type: n.type, val: n.value, id: n.id })),
    );
    console.log('INPUTS:', JSON.stringify(inputs, null, 2));
    const configs = [
      ['IT01', 1, '0.5', '2'],
      ['IT01', 2, '0.25', '1.5'],
      ['IT02', 1, '0.5', '1.5'],
    ];
    const verificacion = [];
    for (const [item, fila, setup, run] of configs) {
      const aSetup = `Setup horas ${item} fila ${fila}`;
      const aRun = `Run horas ${item} fila ${fila}`;
      const s = pagina.locator(`[aria-label="${aSetup}"]`).first();
      const r = pagina.locator(`[aria-label="${aRun}"]`).first();
      if (!(await s.count()) || !(await r.count())) {
        verificacion.push({ item, fila, error: 'label no encontrado' });
        continue;
      }
      await s.fill(setup);
      await r.fill(run);
      await s.blur().catch(() => {});
      await r.blur().catch(() => {});
      await pagina.waitForTimeout(200);
      verificacion.push({ item, fila, setup: await s.inputValue(), run: await r.inputValue() });
    }
    await captura(pagina, '03_costeo', 'ruteo-filas-verificadas', { usuario: 'admin' });
    escribirNota('03_costeo', 'inputs-ruteo', `# Inputs del ruteo\n\n\`\`\`json\n${JSON.stringify(inputs, null, 2)}\n\`\`\`\n\nVerificación:\n\`\`\`json\n${JSON.stringify(verificacion, null, 2)}\n\`\`\`\n`);
    return { verificacion };
  });

  await paso('guardar-y-costear', async () => {
    for (const [i, item] of ['IT01', 'IT02'].entries()) {
      const marcador = pagina.getByTestId(`ruteo-sin-guardar-${item}`);
      await pagina.getByRole('button', { name: 'Guardar ruteo' }).nth(i).click();
      try {
        await marcador.waitFor({ state: 'detached', timeout: 12000 });
      } catch {
        const alertas = await pagina.getByRole('alert').allInnerTexts();
        const status = (await pagina.getByRole('status').allInnerTexts()).join(' | ');
        throw new Error(`No se guardó ${item}. Alertas: ${alertas.join(' | ')}. Status: ${status}`);
      }
    }
    const costear = pagina.getByRole('button', { name: 'Costear ruteo' });
    const habilitado = await costear.isEnabled();
    if (!habilitado) throw new Error('Costear ruteo deshabilitado tras guardar');
    await costear.click();
    await pagina.waitForTimeout(1200);
    const fabricacion = (await pagina.getByTestId('costeo-fabricacion').innerText()).slice(0, 2400);
    await captura(pagina, '03_costeo', 'ruteo-costeado-confirmado', { usuario: 'admin' });
    return { habilitado, fabricacion };
  });

  await paso('costos-y-persistencia', async () => {
    const alternar = pagina.getByTestId('alternar-costeo-interno');
    if (await alternar.count()) {
      const aria = await alternar.getAttribute('aria-label');
      if (aria && aria.includes('Mostrar')) await alternar.click();
    }
    await pagina.locator('[aria-label="Costo Material"]').fill('1250');
    await pagina.locator('[aria-label="Detalle de Material"]').fill('Lámina CRS-14 y MDF-12');
    await pagina.locator('[aria-label="Costo Otros"]').fill('320');
    await pagina.locator('[aria-label="Detalle de Otros"]').fill('Embalaje y consumibles');
    await pagina.getByRole('button', { name: 'Guardar costos' }).click();
    await pagina.waitForTimeout(1400);
    const status = (await pagina.getByRole('status').allInnerTexts()).join(' | ').slice(0, 400);
    await pagina.reload({ waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ruteo/Costeo' }).click();
    const fabricacion = (await pagina.getByTestId('costeo-fabricacion').innerText()).slice(0, 2400);
    const importes = (await pagina.getByTestId('resumen-importes-propuesta').innerText()).slice(0, 800);
    await captura(pagina, '03_costeo', 'costeo-persistente', { usuario: 'admin' });
    return { status, fabricacion, importes };
  }, false);
} catch (e) {
  registrar('admin', '03_costeo', 'etapa2c_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('03_costeo', 'resultado-etapa2c', `# Resultado etapa2c\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 10000));
}
