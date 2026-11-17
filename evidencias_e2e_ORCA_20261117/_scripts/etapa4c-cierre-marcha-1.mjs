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
    await captura(pagina, '09_ultimo_cambio', `error4c-${nombre}`, { usuario: 'operador' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
try {
  await paso('abrir-detalle-activo', async () => {
    await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
    await pagina.locator(`[data-testid="abrir-detalle-${PROCESO}"]`).first().click();
    const detalle = pagina.getByTestId('detalle-proceso');
    await detalle.waitFor();
    await pagina.waitForTimeout(1000);
    const texto = (await detalle.innerText()).replace(/\s+/g, ' ');
    const botones = await detalle.getByRole('button').evaluateAll((ns) => ns.map((n) => ({ t: n.innerText.trim().replace(/\s+/g, ' '), id: n.getAttribute('data-testid'), d: n.disabled })));
    await captura(pagina, '09_ultimo_cambio', '09-detalle-sesion-activa', { usuario: 'operador' });
    return { texto: texto.slice(0, 2600), botones };
  });

  await paso('cerrar-en-marcha-pausa-1', async () => {
    const detalle = pagina.getByTestId('detalle-proceso');
    const alternar = detalle.getByTestId('alternar-cierre-sesion');
    if (await alternar.count()) await alternar.dispatchEvent('click');
    await pagina.waitForTimeout(600);
    const texto = (await detalle.innerText()).replace(/\s+/g, ' ');
    await captura(pagina, '09_ultimo_cambio', '10-cerrar-sesion-marcha-formulario', { usuario: 'operador' });
    const resultado = detalle.getByLabel('Resultado');
    const opciones = await resultado.locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
    await resultado.selectOption({ label: 'Pausar sesión de trabajo' }).catch(() => resultado.selectOption({ index: 1 }));
    const piezas = detalle.getByTestId('piezas-cierre');
    if (await piezas.count()) await piezas.fill('0');
    const motivo = detalle.getByLabel('Motivo de pausa');
    if (await motivo.count()) await motivo.selectOption({ index: 1 });
    const nota = detalle.getByLabel('Notas operativas');
    if (await nota.count()) await nota.fill('Prueba E2E ultimo cambio: cierre en marcha 1 (pausa).');
    const pin = detalle.getByTestId('pin-cierre');
    if (await pin.count()) await pin.fill(process.env.E2E_OPERADOR_PIN ?? '');
    await captura(pagina, '09_ultimo_cambio', '11-cierre-marcha-1-lleno', { usuario: 'operador' });
    await detalle.getByTestId('cerrar-sesion-detalle').dispatchEvent('click');
    await pagina.waitForTimeout(2500);
    const mensaje = (await pagina.locator('body').innerText()).replace(/\s+/g, ' ');
    const idx = mensaje.indexOf('Pausa');
    await captura(pagina, '09_ultimo_cambio', '12-resultado-cierre-marcha-1', { usuario: 'operador' });
    return { opciones, textoForm: texto.slice(-1200), mensaje: mensaje.slice(0, 900) };
  }, false);
} catch (e) {
  registrar('operador', '09_ultimo_cambio', 'etapa4c_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('09_ultimo_cambio', 'cierre-marcha-1', `# Cierre en marcha 1\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 9000));
}
