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
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '03_costeo', nombre, 'error', { mensaje: msg });
    await captura(pagina, '03_costeo', `error2d-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}

try {
  await paso('preparar', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ruteo/Costeo' }).click();
    const marcadores = await pagina.locator('[data-testid^="ruteo-sin-guardar-"]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid')));
    if (marcadores.includes('ruteo-sin-guardar-IT02')) {
      await pagina.locator('[aria-label="Setup horas IT02 fila 1"]').fill('0.5');
      await pagina.locator('[aria-label="Run horas IT02 fila 1"]').fill('1.5');
      await pagina.getByRole('button', { name: 'Guardar ruteo' }).last().click({ force: true });
      await pagina.waitForTimeout(2000);
    }
    const despues = await pagina.locator('[data-testid^="ruteo-sin-guardar-"]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid')));
    return { marcadores, despues };
  });

  await paso('costear', async () => {
    const boton = pagina.getByRole('button', { name: 'Costear ruteo' });
    const habilitado = await boton.isEnabled();
    if (!habilitado) throw new Error('Costear ruteo deshabilitado');
    await boton.click();
    await pagina.waitForTimeout(1800);
    const fabricacion = (await pagina.getByTestId('costeo-fabricacion').innerText()).slice(0, 2600);
    const importes = (await pagina.getByTestId('resumen-importes-propuesta').innerText()).slice(0, 700);
    await captura(pagina, '03_costeo', '01-costeo-ruteo-realizado', { usuario: 'admin' });
    return { habilitado, fabricacion, importes };
  });

  await paso('costos-internos', async () => {
    const alternar = pagina.getByTestId('alternar-costeo-interno');
    if (await alternar.count()) {
      const aria = await alternar.getAttribute('aria-label');
      if (aria && aria.includes('Mostrar')) await alternar.click();
    }
    await pagina.locator('[aria-label="Costo Material"]').fill('1250');
    await pagina.locator('[aria-label="Detalle de Material"]').fill('Lámina CRS-14 y MDF-12');
    await pagina.locator('[aria-label="Costo Otros"]').fill('320');
    await pagina.locator('[aria-label="Detalle de Otros"]').fill('Embalaje y consumibles');
    await captura(pagina, '03_costeo', '02-costos-internos-captura', { usuario: 'admin' });
    await pagina.getByRole('button', { name: 'Guardar costos' }).click();
    await pagina.waitForTimeout(1600);
    const status = (await pagina.getByRole('status').allInnerTexts()).join(' | ').slice(0, 400);
    await pagina.reload({ waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ruteo/Costeo' }).click();
    const fabricacion = (await pagina.getByTestId('costeo-fabricacion').innerText()).slice(0, 2600);
    await captura(pagina, '03_costeo', '03-costos-persistidos-tras-recarga', { usuario: 'admin' });
    return { status, fabricacion };
  }, false);
} catch (e) {
  registrar('admin', '03_costeo', 'etapa2d_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('03_costeo', 'resultado-etapa2d', `# Resultado etapa2d\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 9000));
}
