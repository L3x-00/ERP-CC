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
    await captura(pagina, '09_ultimo_cambio', `error4e-${nombre}`, { usuario: 'operador' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
try {
  await paso('abrir-y-disparar-error', async () => {
    await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
    await pagina.locator(`[data-testid="abrir-detalle-${PROCESO}"]`).first().dispatchEvent('click');
    const detalle = pagina.getByTestId('detalle-proceso');
    await detalle.waitFor();
    await detalle.locator('[data-testid^="actualizar-estado-"]').first().dispatchEvent('click');
    const form = detalle.getByTestId('formulario-actualizar-avance');
    await form.getByTestId('avance-piezas').fill('10');
    await form.getByTestId('avance-horas').fill('2');
    await form.getByTestId('avance-pin').fill(process.env.E2E_OPERADOR_PIN ?? '');
    await form.getByTestId('actualizar-avance-detalle').dispatchEvent('click');
    await pagina.waitForTimeout(1500);
    const modal = pagina.getByTestId('error-avance-dialogo');
    const visible = (await modal.count()) > 0;
    if (!visible) throw new Error('No apareció modal de error accionable');
    const texto = (await modal.innerText()).replace(/\s+/g, ' ');
    const botones = await modal.getByRole('button').evaluateAll((ns) => ns.map((n) => n.innerText.trim()));
    await captura(pagina, '09_ultimo_cambio', '17-modal-error-avance-con-soluciones', { usuario: 'operador' });
    return { texto, botones };
  });

  await paso('usar-solucion-y-corregir', async () => {
    const modal = pagina.getByTestId('error-avance-dialogo');
    const botones = modal.getByRole('button');
    const textoBotones = await botones.evaluateAll((ns) => ns.map((n) => n.innerText.trim()));
    const ajustar = textoBotones.find((t) => t.startsWith('Ajustar'));
    if (ajustar) {
      await modal.getByRole('button', { name: ajustar }).dispatchEvent('click');
      await pagina.waitForTimeout(600);
    } else {
      await modal.getByRole('button', { name: 'Entendido' }).dispatchEvent('click');
    }
    const detalle = pagina.getByTestId('detalle-proceso');
    const form = detalle.getByTestId('formulario-actualizar-avance');
    const horas = await form.getByTestId('avance-horas').inputValue();
    await form.getByTestId('avance-piezas').fill('10');
    await form.getByTestId('avance-horas').fill('0.01');
    // Opción 2 del mismo formulario: dejar consumo para el cierre.
    const opciones = await form.locator('input[type="radio"]').evaluateAll((ns) => ns.map((n) => ({ v: n.value, checked: n.checked })));
    const registrarAqui = form.locator('input[type="radio"][value="aqui"]');
    if (await registrarAqui.count()) {
      await registrarAqui.check();
      await pagina.waitForTimeout(300);
      const camposConsumo = await form.locator('[data-testid^="avance-material"]').count();
      await captura(pagina, '09_ultimo_cambio', '18-opcion-registrar-consumo-aqui', { usuario: 'operador' });
      await form.locator('input[type="radio"][value="despues"]').check();
      return { horas, opciones, camposConsumo, nota: 'Se probaron ambas opciones de consumo en el mismo formulario' };
    }
    await captura(pagina, '09_ultimo_cambio', '18-opciones-consumo', { usuario: 'operador' });
    return { horas, opciones };
  }, false);
} catch (e) {
  registrar('operador', '09_ultimo_cambio', 'etapa4e_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('09_ultimo_cambio', 'modal-soluciones', `# Modal de error y opciones de consumo\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 8000));
}
