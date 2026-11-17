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
    registrar('operador', '09_ultimo_cambio', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('operador', '09_ultimo_cambio', nombre, 'error', { mensaje: msg });
    await captura(pagina, '09_ultimo_cambio', `error4f-${nombre}`, { usuario: 'operador' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
async function abrirDetalle() {
  await pagina.locator(`[data-testid="abrir-detalle-${PROCESO}"]`).first().dispatchEvent('click');
  const detalle = pagina.getByTestId('detalle-proceso');
  await detalle.waitFor();
  await pagina.waitForTimeout(600);
  return detalle;
}
try {
  await paso('cerrar-correccion', async () => {
    await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
    const detalle = await abrirDetalle();
    const form = detalle.getByTestId('formulario-actualizar-avance');
    const habiaForm = (await form.count()) > 0;
    if (habiaForm) {
      await form.getByTestId('avance-piezas').fill('0');
      await form.getByTestId('avance-horas').fill('0.01');
      await form.getByTestId('avance-pin').fill(process.env.E2E_OPERADOR_PIN ?? '');
      await form.getByTestId('actualizar-avance-detalle').dispatchEvent('click');
      await pagina.waitForTimeout(1800);
    }
    await captura(pagina, '09_ultimo_cambio', '19-correccion-cerrada', { usuario: 'operador' });
    return { habiaForm };
  });

  await paso('reanudar-y-segunda-pausa', async () => {
    let detalle = await abrirDetalle();
    const reanudar = detalle.getByTestId('reanudar-detalle');
    if (await reanudar.count()) {
      await reanudar.dispatchEvent('click');
      await pagina.waitForTimeout(1800);
    }
    const cerrar = pagina.getByRole('button', { name: 'Cerrar ficha' });
    if (await cerrar.count()) { await cerrar.dispatchEvent('click'); await pagina.waitForTimeout(500); }
    detalle = await abrirDetalle();
    const alternar = detalle.getByTestId('alternar-cierre-sesion');
    if (await alternar.count()) await alternar.dispatchEvent('click');
    await pagina.waitForTimeout(500);
    await detalle.getByLabel('Resultado').selectOption('pausada');
    const piezas = detalle.getByTestId('piezas-cierre');
    if (await piezas.count()) await piezas.fill('0');
    const motivo = detalle.getByLabel('Motivo de pausa');
    if (await motivo.count()) await motivo.selectOption({ index: 1 });
    await detalle.getByTestId('pin-cierre').fill(process.env.E2E_OPERADOR_PIN ?? '');
    await captura(pagina, '09_ultimo_cambio', '20-segundo-cierre-en-marcha', { usuario: 'operador' });
    await detalle.getByTestId('cerrar-sesion-detalle').dispatchEvent('click');
    await pagina.waitForTimeout(2200);
    const pausadas = (await pagina.getByTestId('columna-pausada').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 700);
    await captura(pagina, '09_ultimo_cambio', '21-dos-sesiones-pausadas', { usuario: 'operador' });
    return { pausadas };
  }, false);

  await paso('orden-cronologico-y-anterior', async () => {
    const detalle = await abrirDetalle();
    const texto = (await detalle.innerText()).replace(/\s+/g, ' ');
    const testids = await detalle.locator('[data-testid]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid')).filter(Boolean));
    const actualizar = testids.filter((t) => t.startsWith('actualizar-estado-'));
    const enlaceAnterior = testids.includes('ver-proceso-anterior');
    await captura(pagina, '09_ultimo_cambio', '22-historial-dos-sesiones', { usuario: 'operador' });
    let errorOrden = null;
    if (actualizar.length >= 2) {
      // El listado viene antiguo → nuevo; seleccionar el último (posterior) primero.
      await detalle.locator(`[data-testid="${actualizar[actualizar.length - 1]}"]`).dispatchEvent('click');
      await pagina.waitForTimeout(500);
      const form = detalle.getByTestId('formulario-actualizar-avance');
      await form.getByTestId('avance-piezas').fill('0');
      await form.getByTestId('avance-horas').fill('0.01');
      await form.getByTestId('avance-pin').fill(process.env.E2E_OPERADOR_PIN ?? '');
      await form.getByTestId('actualizar-avance-detalle').dispatchEvent('click');
      await pagina.waitForTimeout(1600);
      const modal = pagina.getByTestId('error-avance-dialogo');
      if (await modal.count()) errorOrden = (await modal.innerText()).replace(/\s+/g, ' ');
      await captura(pagina, '09_ultimo_cambio', '23-error-orden-cronologico', { usuario: 'operador' });
    }
    return { actualizar, enlaceAnterior, texto: texto.slice(0, 2400), errorOrden };
  }, false);
} catch (e) {
  registrar('operador', '09_ultimo_cambio', 'etapa4f_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('09_ultimo_cambio', 'segunda-pausa-y-orden', `# Segunda pausa y orden cronológico\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 10000));
}
