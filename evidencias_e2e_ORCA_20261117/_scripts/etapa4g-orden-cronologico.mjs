import { abrirNavegador, nuevoContexto, iniciarSesionOperador, captura, registrar, escribirNota } from './driver.mjs';
const PROCESO = '71c7d593-0caf-4f93-bfd7-0b1aa3fa8d82:42bd2e46-fe32-4a9b-856a-5cb8384b78f7';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
try {
  await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
  await pagina.locator(`[data-testid="abrir-detalle-${PROCESO}"]`).first().dispatchEvent('click');
  const detalle = pagina.getByTestId('detalle-proceso');
  await detalle.waitFor();
  const ids = await detalle.locator('[data-testid^="actualizar-estado-"]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid')));
  const sesion = await detalle.getByTestId('avance-sesion').locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
  console.log('BOTONES:', ids, 'OPCIONES', sesion);
  // El select enumera antiguo -> nuevo; elegir el último (posterior) primero.
  await detalle.locator('[data-testid="avance-sesion"]').selectOption({ index: sesion.length - 1 });
  await detalle.getByTestId('avance-piezas').fill('0');
  await detalle.getByTestId('avance-horas').fill('0');
  await detalle.getByTestId('avance-pin').fill(process.env.E2E_OPERADOR_PIN ?? '');
  await captura(pagina, '09_ultimo_cambio', '24-sesion-posterior-seleccionada-primero', { usuario: 'operador' });
  await detalle.getByTestId('actualizar-avance-detalle').dispatchEvent('click');
  await pagina.waitForTimeout(1600);
  const modal = await pagina.getByTestId('error-avance-dialogo').innerText().catch(() => 'sin modal');
  console.log('MODAL:', modal.replace(/\s+/g, ' '));
  await captura(pagina, '09_ultimo_cambio', '25-error-sesion-antigua-pendiente', { usuario: 'operador' });
  registrar('operador', '09_ultimo_cambio', 'orden_cronologico', 'ok', { modal: modal.slice(0, 500) });
  escribirNota('09_ultimo_cambio', 'orden-cronologico', `# Orden cronológico\n\nBotones: ${JSON.stringify(ids)}\nOpciones: ${JSON.stringify(sesion)}\nModal: ${modal}\n`);
} catch (e) {
  registrar('operador', '09_ultimo_cambio', 'orden_cronologico', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
