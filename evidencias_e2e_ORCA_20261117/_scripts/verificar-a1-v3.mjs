import { abrirNavegador, nuevoContexto, iniciarSesionOperador, captura, registrar, escribirNota } from './driver.mjs';

const PROCESO = 'd1c81409-9219-4133-8ae5-f821e397525f:a132d972-9f3a-450f-86b9-4a12ee759dff';
const CODIGO = 'QA-NC-1717';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(20000);
const resultados = [];

function verificar(id, ok, detalle = {}) {
  const estado = ok ? 'ok' : 'error';
  resultados.push({ id, resultado: estado, ...detalle });
  registrar('operador', '11_reverificacion', id, estado, detalle);
  console.log(`${ok ? 'OK ' : 'FAIL'} ${id}`);
}

try {
  await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
  await pagina.locator(`[data-testid="abrir-detalle-${PROCESO}"]`).first().click();
  const detalle = pagina.getByTestId('detalle-proceso');
  await detalle.waitFor();
  await detalle.getByText('sesión activa').first().waitFor({ timeout: 15000 });
  verificar('A-1-sesion-activa', true);

  if (!(await detalle.getByTestId('material-cierre').count())) {
    await detalle.getByTestId('alternar-cierre-sesion').click();
    await pagina.waitForTimeout(700);
  }
  await detalle.getByLabel('Resultado').selectOption('finalizada');
  const material = detalle.getByTestId('material-cierre');
  const opciones = await material.locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
  const opcion = opciones.find((o) => o.t.includes(CODIGO));
  if (!opcion) throw new Error(`Material ${CODIGO} ausente del selector`);
  await material.selectOption(opcion.v);
  const aviso = detalle.getByTestId('aviso-material-sin-costo');
  await aviso.waitFor({ state: 'visible', timeout: 15000 });
  const textoAviso = await aviso.innerText();
  verificar('A-1-aviso-preventivo', /sin costo|costo confirmado/i.test(textoAviso), { texto: textoAviso.slice(0, 400) });
  await captura(pagina, '11_reverificacion', 'a1-aviso-preventivo', { usuario: 'operador' });

  const setValor = async (testid, valor) => {
    await detalle.getByTestId(testid).evaluate((el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, valor);
  };
  await setValor('piezas-cierre', '10');
  await setValor('usado-cierre', '1');
  await setValor('motivo-consumo', 'Verificacion A-1 material sin costo');
  await setValor('pin-cierre', process.env.E2E_OPERADOR_PIN ?? '');
  await pagina.waitForTimeout(400);
  // El botón queda fuera del viewport del panel lateral.
  const botonCerrar = detalle.getByTestId('cerrar-sesion-detalle');
  console.log('BOTON CERRAR enabled:', await botonCerrar.isEnabled());
  console.log('INVALIDOS:', JSON.stringify(await detalle.locator('[aria-invalid="true"]').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-testid') || n.id || n.tagName))));
  // El panel lateral deja el botón fuera del viewport: enviar el formulario.
  console.log('VALORES:', JSON.stringify(await detalle.locator('input,select,textarea').evaluateAll((ns) =>
    Object.fromEntries(ns.filter((n) => n.getAttribute('data-testid')).map((n) => [n.getAttribute('data-testid'), n.value])),
  )));
  await botonCerrar.evaluate((el) => el.click());
  const dialogo = pagina.getByTestId('error-cierre-dialogo');
  try {
    await dialogo.waitFor({ state: 'visible', timeout: 12000 });
  } catch {
    const cuerpo = (await pagina.locator('body').innerText()).replace(/\n+/g, ' ');
    console.log('SIN DIALOGO — CUERPO:', cuerpo.slice(-1800));
    console.log('ALERTAS:', JSON.stringify(await pagina.locator('[role="alert"],[role="alertdialog"]').evaluateAll((ns) => ns.map((n) => n.innerText.slice(0, 300)))));
    throw new Error('No apareció error-cierre-dialogo');
  }
  const textoDialogo = await dialogo.innerText();
  verificar('A-1-modal-accionable', /costo/i.test(textoDialogo), { texto: textoDialogo.slice(0, 500) });
  const accion = pagina.getByTestId('error-cierre-accion');
  const textoAccion = await accion.innerText().catch(() => '');
  verificar('A-1-boton-pausar-y-avisar', textoAccion.includes('Pausar sesión y avisar'), { texto: textoAccion });
  await captura(pagina, '11_reverificacion', 'a1-modal-salida', { usuario: 'operador' });
  await accion.click();
  await pagina.waitForTimeout(2500);
  const cuerpo = (await pagina.locator('body').innerText()).replace(/\n+/g, ' ');
  verificar('A-1-sesion-pausada-con-nota', /pausad/i.test(cuerpo) && cuerpo.includes('Material QA sin costo'), {
    extracto: cuerpo.slice(0, 800),
  });
  await captura(pagina, '11_reverificacion', 'a1-sesion-pausada', { usuario: 'operador' });

  escribirNota('11_reverificacion', 'resultado-a1', '# Re-verificación funcional A-1\n\n' + JSON.stringify(resultados, null, 2) + '\n');
  registrar('operador', '11_reverificacion', 'resumen-a1', resultados.every((r) => r.resultado === 'ok') ? 'ok' : 'error', {
    total: resultados.length,
  });
  console.log(JSON.stringify(resultados, null, 2));
  if (resultados.some((r) => r.resultado === 'error')) process.exitCode = 1;
} catch (e) {
  registrar('operador', '11_reverificacion', 'verificacion-a1', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
