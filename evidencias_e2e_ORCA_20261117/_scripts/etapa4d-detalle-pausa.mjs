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
    await captura(pagina, '09_ultimo_cambio', `error4d-${nombre}`, { usuario: 'operador' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
try {
  await paso('abrir-detalle-pausado', async () => {
    await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
    await pagina.locator(`[data-testid="abrir-detalle-${PROCESO}"]`).first().dispatchEvent('click');
    const detalle = pagina.getByTestId('detalle-proceso');
    await detalle.waitFor();
    await pagina.waitForTimeout(800);
    const texto = (await detalle.innerText()).replace(/\s+/g, ' ');
    const testids = await detalle.locator('[data-testid]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid')).filter(Boolean));
    await captura(pagina, '09_ultimo_cambio', '13-detalle-sesion-pausada', { usuario: 'operador' });
    return {
      texto: texto.slice(0, 3000),
      tiempoReal: texto.includes('Tiempo real de proceso'),
      enlaceAnterior: testids.includes('ver-proceso-anterior'),
      actualizarEstado: testids.filter((t) => t.startsWith('actualizar-estado-')),
      botonesBorrar: await detalle.getByRole('button', { name: /Eliminar|Borrar/ }).count(),
      testids: testids.slice(0, 60),
    };
  });

  await paso('actualizar-estado-mas-antigua', async () => {
    const detalle = pagina.getByTestId('detalle-proceso');
    const botones = await detalle.locator('[data-testid^="actualizar-estado-"]').count();
    if (!botones) throw new Error('No hay botón Actualizar estado');
    await detalle.locator('[data-testid^="actualizar-estado-"]').first().dispatchEvent('click');
    await pagina.waitForTimeout(600);
    const form = detalle.getByTestId('formulario-actualizar-avance');
    if (!(await form.count())) throw new Error('No apareció formulario-actualizar-avance');
    const texto = (await form.innerText()).replace(/\s+/g, ' ');
    await captura(pagina, '09_ultimo_cambio', '14-formulario-tiempo-real-proceso', { usuario: 'operador' });
    await form.getByTestId('avance-piezas').fill('10');
    await form.getByTestId('avance-horas').fill('2');
    const opcionesConsumo = await form.locator('[data-testid="avance-opcion-consumo"] input').evaluateAll((ns) => ns.map((n) => ({ v: n.value, checked: n.checked })));
    await form.getByTestId('avance-opcion-consumo').locator('input[value="despues"]').check().catch(() => {});
    await form.getByTestId('avance-pin').fill(process.env.E2E_OPERADOR_PIN ?? '');
    await captura(pagina, '09_ultimo_cambio', '15-avance-2h-declaradas', { usuario: 'operador' });
    await form.getByTestId('actualizar-avance-detalle').dispatchEvent('click');
    await pagina.waitForTimeout(2200);
    const mensaje = (await pagina.locator('body').innerText()).replace(/\s+/g, ' ');
    await captura(pagina, '09_ultimo_cambio', '16-resultado-actualizacion-estado', { usuario: 'operador' });
    return { botones, texto: texto.slice(0, 1800), opcionesConsumo, mensaje: mensaje.slice(0, 900) };
  }, false);
} catch (e) {
  registrar('operador', '09_ultimo_cambio', 'etapa4d_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('09_ultimo_cambio', 'correccion-sesion', `# Corrección de sesión C21\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 10000));
}
