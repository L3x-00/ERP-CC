import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota, guardarDescarga } from './driver.mjs';
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
    await captura(pagina, '04_propuesta_versiones', `error2j-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
async function seleccionar(letra) {
  await pagina.getByTestId('ficha-propuesta').locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${letra}\\b`) }).first().click();
  await pagina.waitForTimeout(500);
}
async function estabilizarCosteo(letra) {
  for (let intento = 0; intento < 4; intento += 1) {
    await seleccionar(letra);
    const falt = (await pagina.getByTestId('faltantes-validacion').innerText().catch(() => '')).slice(0, 900);
    if (!falt.includes('costear') && !falt.includes('guardar el ruteo') && !falt.includes('guardar los costos')) return { falt, intento };
    await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ruteo/Costeo' }).click();
    if (falt.includes('guardar el ruteo')) {
      for (let i = 0; i < 2; i += 1) {
        const b = pagina.getByRole('button', { name: 'Guardar ruteo' }).nth(i);
        if (await b.count()) { await b.scrollIntoViewIfNeeded(); await b.click(); await pagina.waitForTimeout(900); }
      }
    }
    const costear = pagina.getByRole('button', { name: 'Costear ruteo' });
    if (await costear.isEnabled()) { await costear.click(); await pagina.waitForTimeout(1200); }
    if (falt.includes('guardar los costos')) {
      const alt = pagina.getByTestId('alternar-costeo-interno');
      if ((await alt.getAttribute('aria-label'))?.includes('Mostrar')) await alt.click();
      const actual = Number((await pagina.locator('#costo-gastos_directos').inputValue()).replace(/[^\d.]/g, '')) || 320;
      await pagina.locator('#costo-gastos_directos').fill(String(actual + intento + 1));
      await pagina.getByRole('button', { name: 'Guardar costos' }).click();
      await pagina.waitForTimeout(1200);
    }
    await pagina.reload({ waitUntil: 'networkidle' });
  }
  return { falt: (await pagina.getByTestId('faltantes-validacion').innerText()).slice(0, 900), intento: 4 };
}

try {
  await paso('B-validar-pdf-enviar', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
    await seleccionar('B');
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.getByRole('button', { name: 'Validar', exact: true }).first().click();
    await pagina.getByTestId('dialogo-seguimiento-propuesta').getByRole('button', { name: 'Registrar y validar' }).click();
    await pagina.waitForTimeout(1500);
    await ficha.getByTestId('boton-pdf-propuesta').click();
    await pagina.waitForTimeout(1500);
    await ficha.getByRole('tab', { name: 'PDFs' }).click();
    await captura(pagina, '04_propuesta_versiones', '30-pdf-rev-B', { usuario: 'admin' });
    const desc = pagina.getByRole('button', { name: /Descargar PDF/ }).first();
    if (await desc.count()) {
      const [d] = await Promise.all([pagina.waitForEvent('download'), desc.click()]);
      await guardarDescarga(d, '08_documentos', 'propuesta-rev-B-aprobada');
    }
    await ficha.getByRole('button', { name: 'Enviar', exact: true }).first().click();
    await pagina.getByLabel('Destino de envío').fill('compras@clienteqa.mx');
    await pagina.getByRole('button', { name: 'Confirmar envío' }).click();
    await pagina.waitForTimeout(2000);
    await pagina.reload({ waitUntil: 'networkidle' });
    await captura(pagina, '04_propuesta_versiones', '31-rev-B-enviada-final', { usuario: 'admin' });
    return { cabecera: (await pagina.getByTestId('ficha-propuesta').innerText()).slice(0, 500) };
  });

  await paso('crear-y-modificar-C', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.getByRole('tab', { name: 'Resumen' }).click();
    await pagina.getByTestId('boton-crear-nueva-version').click();
    const dlg = pagina.getByTestId('dialogo-nueva-version');
    await dlg.getByLabel('Motivo de la nueva versión').fill('Versión C: ajuste final de precio del panel por negociación con el cliente.');
    await captura(pagina, '04_propuesta_versiones', '32-dialogo-version-C', { usuario: 'admin' });
    await dlg.getByRole('button', { name: 'Crear versión' }).click();
    await pagina.waitForTimeout(1800);
    await captura(pagina, '04_propuesta_versiones', '33-rev-C-creada', { usuario: 'admin' });
    await seleccionar('C');
    await ficha.getByRole('tab', { name: 'Ítems' }).click();
    await pagina.getByLabel('Precio IT02').fill('1050');
    await pagina.getByRole('row', { name: /IT02/ }).getByRole('button', { name: 'Guardar' }).click();
    await pagina.waitForTimeout(900);
    const importes = (await pagina.getByTestId('resumen-importes-propuesta').innerText()).slice(0, 600);
    await captura(pagina, '04_propuesta_versiones', '34-rev-C-modificada', { usuario: 'admin' });
    return { importes };
  });

  await paso('C-estabilizar-validar-pdf-enviar', async () => {
    const est = await estabilizarCosteo('C');
    await seleccionar('C');
    const ficha = pagina.getByTestId('ficha-propuesta');
    const validar = ficha.getByRole('button', { name: 'Validar', exact: true }).first();
    const habilitado = await validar.isEnabled();
    if (!habilitado) throw new Error(`C no validable: ${est.falt}`);
    await validar.click();
    await pagina.getByTestId('dialogo-seguimiento-propuesta').getByRole('button', { name: 'Registrar y validar' }).click();
    await pagina.waitForTimeout(1500);
    await ficha.getByTestId('boton-pdf-propuesta').click();
    await pagina.waitForTimeout(1500);
    await ficha.getByRole('tab', { name: 'PDFs' }).click();
    await captura(pagina, '04_propuesta_versiones', '35-pdf-rev-C', { usuario: 'admin' });
    const desc = pagina.getByRole('button', { name: /Descargar PDF/ }).first();
    if (await desc.count()) {
      const [d] = await Promise.all([pagina.waitForEvent('download'), desc.click()]);
      await guardarDescarga(d, '08_documentos', 'propuesta-rev-C');
    }
    await ficha.getByRole('button', { name: 'Enviar', exact: true }).first().click();
    await pagina.getByLabel('Destino de envío').fill('compras@clienteqa.mx');
    await pagina.getByRole('button', { name: 'Confirmar envío' }).click();
    await pagina.waitForTimeout(2000);
    await pagina.reload({ waitUntil: 'networkidle' });
    await captura(pagina, '04_propuesta_versiones', '36-rev-C-enviada', { usuario: 'admin' });
    return { est, cabecera: (await pagina.getByTestId('ficha-propuesta').innerText()).slice(0, 500) };
  });
} catch (e) {
  registrar('admin', '04_propuesta_versiones', 'etapa2j_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('04_propuesta_versiones', 'resultado-etapa2j', `# Versiones B y C\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 10000));
}
