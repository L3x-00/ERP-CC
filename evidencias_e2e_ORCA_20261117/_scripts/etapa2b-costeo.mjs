import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
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
    registrar('admin', '03_costeo', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '03_costeo', nombre, 'error', { mensaje: msg });
    await captura(pagina, '03_costeo', `error2b-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}

try {
  await paso('login-y-abrir', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ruteo/Costeo' }).click();
  });

  await paso('guardar-ruteos', async () => {
    const filas = [
      { item: 'IT01', fila: 1, setup: '0.5', run: '2' },
      { item: 'IT01', fila: 2, setup: '0.25', run: '1.5' },
      { item: 'IT02', fila: 1, setup: '0.5', run: '1.5' },
    ];
    for (const f of filas) {
      await pagina.getByLabel(`Setup horas ${f.item} fila ${f.fila}`).fill(f.setup);
      await pagina.getByLabel(`Run horas ${f.item} fila ${f.fila}`).fill(f.run);
    }
    await captura(pagina, '03_costeo', 'ruteo-todas-filas-capturadas', { usuario: 'admin' });
    const botones = pagina.getByRole('button', { name: 'Guardar ruteo' });
    const n = await botones.count();
    const status = [];
    for (let i = 0; i < n; i += 1) {
      await botones.nth(i).click();
      await pagina.waitForTimeout(1200);
      status.push((await pagina.getByRole('status').allInnerTexts()).join(' | ').slice(0, 300));
    }
    const pendientes = await pagina.locator('[data-testid^="ruteo-sin-guardar-"]').count();
    await captura(pagina, '03_costeo', 'ruteo-guardado', { usuario: 'admin' });
    return { n, status, pendientes };
  });

  await paso('costear', async () => {
    const boton = pagina.getByRole('button', { name: 'Costear ruteo' });
    const habilitado = await boton.isEnabled();
    if (!habilitado) throw new Error('Costear ruteo sigue deshabilitado');
    await boton.click();
    await pagina.waitForTimeout(1500);
    const fabricacion = (await pagina.getByTestId('costeo-fabricacion').innerText()).slice(0, 2200);
    const importes = (await pagina.getByTestId('resumen-importes-propuesta').innerText()).slice(0, 900);
    await captura(pagina, '03_costeo', 'ruteo-costeado', { usuario: 'admin' });
    return { habilitado, fabricacion, importes };
  });

  await paso('costos-internos-persistentes', async () => {
    const alternar = pagina.getByTestId('alternar-costeo-interno');
    if (await alternar.count()) {
      const aria = await alternar.getAttribute('aria-label');
      if (aria && aria.includes('Mostrar')) await alternar.click();
    }
    await pagina.getByLabel('Costo Material').fill('1250');
    await pagina.getByLabel('Detalle de Material').fill('Lámina CRS-14 y MDF-12');
    await pagina.getByLabel('Costo Otros').fill('320');
    await pagina.getByLabel('Detalle de Otros').fill('Embalaje y consumibles');
    await captura(pagina, '03_costeo', 'costos-internos-formulario', { usuario: 'admin' });
    await pagina.getByRole('button', { name: 'Guardar costos' }).click();
    await pagina.waitForTimeout(1500);
    const status = (await pagina.getByRole('status').allInnerTexts()).join(' | ').slice(0, 400);
    await pagina.reload({ waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ruteo/Costeo' }).click();
    const fabricacion = (await pagina.getByTestId('costeo-fabricacion').innerText()).slice(0, 2200);
    await captura(pagina, '03_costeo', 'costos-persistidos-tras-recarga', { usuario: 'admin' });
    return { status, fabricacion };
  });
} catch (e) {
  registrar('admin', '03_costeo', 'etapa2b_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('03_costeo', 'resultado-etapa2b', `# Corrección de costeo\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 9000));
}
