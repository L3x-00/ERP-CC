import { abrirNavegador, nuevoContexto, iniciarSesionOperador, captura, registrar, escribirNota } from './driver.mjs';
const PROCESO = '71c7d593-0caf-4f93-bfd7-0b1aa3fa8d82:42bd2e46-fe32-4a9b-856a-5cb8384b78f7';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
const resultados = [];
async function paso(nombre, fn, critico = true) {
  try {
    const r = await fn();
    resultados.push({ paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('operador', '05_produccion', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('operador', '05_produccion', nombre, 'error', { mensaje: msg });
    await captura(pagina, '05_produccion', `error4b-${nombre}`, { usuario: 'operador' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
try {
  await paso('reclamar-e-iniciar', async () => {
    await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
    await pagina.locator(`[data-testid="abrir-detalle-${PROCESO}"]`).first().click();
    const detalle = pagina.getByTestId('detalle-proceso');
    await detalle.waitFor();
    const reclaim = detalle.getByTestId('reclamar-detalle');
    if (await reclaim.count()) {
      await reclaim.dispatchEvent('click');
      await pagina.waitForTimeout(2500);
    }
    let iniciar = detalle.getByTestId('iniciar-detalle');
    if (!(await iniciar.count())) {
      const cerrar = detalle.getByRole('button', { name: 'Cerrar ficha' });
      if (await cerrar.count()) await cerrar.dispatchEvent('click');
      await pagina.waitForTimeout(600);
      await pagina.locator(`[data-testid="abrir-detalle-${PROCESO}"]`).first().click();
      await detalle.waitFor();
      await pagina.waitForTimeout(800);
      iniciar = detalle.getByTestId('iniciar-detalle');
    }
    const habiaIniciar = (await iniciar.count()) > 0;
    if (!habiaIniciar) throw new Error('No apareció Iniciar proceso tras reclamar');
    await iniciar.dispatchEvent('click');
    const checklist = pagina.getByTestId('checklist-inicio');
    await checklist.waitFor({ timeout: 10000 });
    for (const c of await checklist.getByRole('checkbox').all()) await c.check();
    await captura(pagina, '09_ultimo_cambio', '04-checklist-inicio', { usuario: 'operador' });
    await checklist.getByTestId('confirmar-checklist-inicio').dispatchEvent('click');
    await pagina.waitForTimeout(2200);
    const enCurso = (await pagina.getByTestId('columna-en_proceso').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600);
    const detalleTexto = (await detalle.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 1800);
    await captura(pagina, '09_ultimo_cambio', '05-proceso-en-curso', { usuario: 'operador' });
    return { habiaIniciar, enCurso, detalleTexto };
  });

  await paso('cerrar-sesion-en-marcha-1', async () => {
    const detalle = pagina.getByTestId('detalle-proceso');
    const alternar = detalle.getByTestId('alternar-cierre-sesion');
    if (await alternar.count()) await alternar.dispatchEvent('click');
    await pagina.waitForTimeout(500);
    const texto = (await detalle.innerText()).replace(/\s+/g, ' ');
    const jornadaTexto = texto.includes('Jornada corrida de 8 horas') && texto.includes('comida de 12:00 a 13:00');
    await captura(pagina, '09_ultimo_cambio', '06-cerrar-sesion-en-marcha-formulario', { usuario: 'operador' });
    const resultado = detalle.getByLabel('Resultado');
    const opciones = await resultado.locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
    await resultado.selectOption({ label: 'Pausar sesión de trabajo' }).catch(() => resultado.selectOption('pausada'));
    const piezas = detalle.getByTestId('piezas-cierre');
    if (await piezas.count()) await piezas.fill('0');
    const motivo = detalle.getByLabel('Motivo de pausa');
    if (await motivo.count()) await motivo.selectOption({ index: 1 });
    const nota = detalle.getByLabel('Notas operativas');
    if (await nota.count()) await nota.fill('Prueba E2E del último cambio: cierre en marcha 1 (pausa).');
    const pin = detalle.getByTestId('pin-cierre');
    if (await pin.count()) await pin.fill(process.env.E2E_OPERADOR_PIN ?? '');
    await captura(pagina, '09_ultimo_cambio', '07-cierre-marcha-1-capturado', { usuario: 'operador' });
    await detalle.getByTestId('cerrar-sesion-detalle').dispatchEvent('click');
    await pagina.waitForTimeout(2200);
    const pausada = (await pagina.getByTestId('columna-pausada').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
    await captura(pagina, '09_ultimo_cambio', '08-pausa-por-cierre-en-marcha-1', { usuario: 'operador' });
    return { jornadaTexto, opciones, pausada };
  }, false);
} catch (e) {
  registrar('operador', '05_produccion', 'etapa4b_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('09_ultimo_cambio', 'operador-reclama-cierre1', `# Reclamar, iniciar y cierre en marcha 1\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 9000));
}
