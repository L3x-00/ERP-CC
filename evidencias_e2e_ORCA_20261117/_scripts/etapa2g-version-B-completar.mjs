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
    const msg = String(e && e.message || e).slice(0, 1800);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '04_propuesta_versiones', nombre, 'error', { mensaje: msg });
    await captura(pagina, '04_propuesta_versiones', `error2g-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}

try {
  await paso('ruteo-y-costos-B', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.locator('button[aria-pressed]').filter({ hasText: /^B/ }).first().click();
    await ficha.getByRole('tab', { name: 'Ruteo/Costeo' }).click();
    for (const [item, fila, setup, run] of [['IT01', 1, '0.5', '2'], ['IT01', 2, '0.25', '1.5'], ['IT02', 1, '0.5', '1.5']]) {
      await pagina.locator(`[aria-label="Setup horas ${item} fila ${fila}"]`).fill(setup);
      await pagina.locator(`[aria-label="Run horas ${item} fila ${fila}"]`).fill(run);
    }
    await captura(pagina, '04_propuesta_versiones', '22-ruteo-B-capturado', { usuario: 'admin' });
    for (let i = 0; i < 2; i += 1) {
      await pagina.getByRole('button', { name: 'Guardar ruteo' }).nth(i).click({ force: true });
      await pagina.waitForTimeout(1400);
    }
    const marcadores = await pagina.locator('[data-testid^="ruteo-sin-guardar-"]').count();
    await pagina.getByRole('button', { name: 'Costear ruteo' }).click();
    await pagina.waitForTimeout(1500);
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
    await pagina.waitForTimeout(1500);
    await pagina.reload({ waitUntil: 'networkidle' });
    const ficha2 = pagina.getByTestId('ficha-propuesta');
    await ficha2.locator('button[aria-pressed]').filter({ hasText: /^B/ }).first().click();
    await ficha2.getByRole('tab', { name: 'Ruteo/Costeo' }).click();
    const fabricacion = (await pagina.getByTestId('costeo-fabricacion').innerText()).slice(0, 2200);
    await captura(pagina, '04_propuesta_versiones', '23-ruteo-y-costos-B-persistidos', { usuario: 'admin' });
    return { marcadores, fabricacion };
  });

  await paso('validar-pdf-enviar-B', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    const falt = (await pagina.getByTestId('faltantes-validacion').innerText().catch(() => '')).slice(0, 600);
    const validar = ficha.getByRole('button', { name: 'Validar', exact: true }).first();
    if (!(await validar.isEnabled())) throw new Error(`Validar B deshabilitado: ${falt}`);
    await validar.click();
    await pagina.getByTestId('dialogo-seguimiento-propuesta').getByRole('button', { name: 'Registrar y validar' }).click();
    await pagina.waitForTimeout(1500);
    await ficha.getByTestId('boton-pdf-propuesta').click();
    await pagina.waitForTimeout(1500);
    await ficha.getByRole('tab', { name: 'PDFs' }).click();
    await captura(pagina, '04_propuesta_versiones', '24-pdf-rev-B', { usuario: 'admin' });
    const desc = pagina.getByRole('button', { name: /Descargar PDF/ }).first();
    if (await desc.count()) {
      const [d] = await Promise.all([pagina.waitForEvent('download'), desc.click()]);
      await guardarDescarga(d, '08_documentos', 'propuesta-rev-B');
    }
    await ficha.getByRole('button', { name: 'Enviar', exact: true }).first().click();
    await pagina.getByLabel('Destino de envío').fill('compras@clienteqa.mx');
    await pagina.getByRole('button', { name: 'Confirmar envío' }).click();
    await pagina.waitForTimeout(2000);
    await pagina.reload({ waitUntil: 'networkidle' });
    await captura(pagina, '04_propuesta_versiones', '25-rev-B-enviada', { usuario: 'admin' });
    return { falt, cabecera: (await pagina.getByTestId('ficha-propuesta').innerText()).slice(0, 600) };
  });
} catch (e) {
  registrar('admin', '04_propuesta_versiones', 'etapa2g_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('04_propuesta_versiones', 'resultado-etapa2g', `# Resultado etapa2g\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 9000));
}
