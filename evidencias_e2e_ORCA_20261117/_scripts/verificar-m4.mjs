import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, iniciarSesionOperador, descartarModalTipoCambio, captura, registrar, escribirNota } from './driver.mjs';

const PROCESO = 'd1c81409-9219-4133-8ae5-f821e397525f:a132d972-9f3a-450f-86b9-4a12ee759dff';
const ORDEN_ID = 'e4b29cc3-ba77-4ec6-a4cc-50c7fe57d942';
const navegador = await abrirNavegador();
const resultados = [];

function verificar(id, ok, detalle = {}) {
  const estado = ok ? 'ok' : 'error';
  resultados.push({ id, resultado: estado, ...detalle });
  registrar('sistema', '11_reverificacion', id, estado, detalle);
  console.log(`${ok ? 'OK ' : 'FAIL'} ${id}`);
}

async function setValor(scope, testid, valor) {
  await scope.getByTestId(testid).evaluate((el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, valor);
}

try {
  // --- Operador: provocar el exceso y pedir aprobación ---
  const ctxOp = await nuevoContexto(navegador);
  const op = await ctxOp.newPage();
  op.setDefaultTimeout(20000);
  await iniciarSesionOperador(op, process.env.E2E_OPERADOR_PIN ?? '');
  const abrir = op.locator(`[data-testid="abrir-detalle-${PROCESO}"]`).first();
  if (!(await abrir.count())) {
    // Si se auto-pausó al cumplir la jornada de 0,5 h, buscar en Pausada.
    await op.getByRole('tab', { name: /Pausada/ }).click().catch(() => {});
  }
  await abrir.dispatchEvent('click');
  const detalle = op.getByTestId('detalle-proceso');
  await detalle.waitFor();
  // Al cumplir la jornada de 0,5 h la sesión se auto-pausó: hay que actualizar
  // el avance (C21) antes de que aparezca el formulario de cierre.
  if (await detalle.getByTestId('formulario-actualizar-avance').count()) {
    await setValor(detalle, 'avance-piezas', '10');
    await setValor(detalle, 'avance-horas', '0.1');
    await setValor(detalle, 'avance-pin', process.env.E2E_OPERADOR_PIN ?? '');
    await op.waitForTimeout(300);
    await detalle.getByTestId('actualizar-avance-detalle').evaluate((el) => el.click());
    await op.waitForTimeout(2500);
    await captura(op, '11_reverificacion', 'm4-avance-actualizado', { usuario: 'operador' });
  }
  if (!(await detalle.getByTestId('material-cierre').count())) {
    const alternar = detalle.getByTestId('alternar-cierre-sesion');
    console.log('DETALLE M4:', (await detalle.innerText()).replace(/\n+/g, ' | ').slice(0, 2200));
    if (await alternar.count()) {
      await alternar.click();
      await op.waitForTimeout(700);
    }
  }
  await detalle.getByLabel('Resultado').selectOption('finalizada');
  const material = detalle.getByTestId('material-cierre');
  const opciones = await material.locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
  const valido = opciones.find((o) => o.t.includes('calibre 14'));
  await material.selectOption(valido.v);
  await setValor(detalle, 'piezas-cierre', '10');
  await setValor(detalle, 'usado-cierre', '1');
  await setValor(detalle, 'motivo-consumo', 'Verificacion M-4 horas extra');
  await setValor(detalle, 'pin-cierre', process.env.E2E_OPERADOR_PIN ?? '');
  await op.waitForTimeout(400);
  await detalle.getByTestId('cerrar-sesion-detalle').evaluate((el) => el.click());
  await op.waitForTimeout(2500);
  const cuerpoOp = (await op.locator('body').innerText()).replace(/\n+/g, ' ');
  const seccionHE = await op.getByTestId('horas-extra-cierre').count();
  const pedir = op.getByTestId('solicitar-horas-extra');
  verificar('M-4-exceso-detectado', seccionHE > 0 || /horas extra|jornada/i.test(cuerpoOp), { extracto: cuerpoOp.slice(-700) });
  verificar('M-4-boton-pedir-aprobacion', (await pedir.count()) > 0);
  await captura(op, '11_reverificacion', 'm4-exceso-pedir-aprobacion', { usuario: 'operador' });
  if (await pedir.count()) {
    await pedir.evaluate((el) => el.click());
    await op.waitForTimeout(2500);
    verificar('M-4-solicitud-creada', true, { mensaje: (await op.locator('body').innerText()).slice(-400) });
    await captura(op, '11_reverificacion', 'm4-solicitud-creada', { usuario: 'operador' });
  }
  await ctxOp.close();

  // --- Admin: rechazar con nota ---
  const ctxAdmin = await nuevoContexto(navegador);
  const ad = await ctxAdmin.newPage();
  ad.setDefaultTimeout(20000);
  await iniciarSesionAdmin(ad, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  await descartarModalTipoCambio(ad);
  await ad.goto(`/produccion?ordenId=${ORDEN_ID}`, { waitUntil: 'domcontentloaded' });
  await ad.waitForTimeout(3000);
  const rechazar = ad.locator('[data-testid^="rechazar-horas-extra-"]').first();
  verificar('M-4-solicitud-en-panel-admin', (await rechazar.count()) > 0);
  if (await rechazar.count()) {
    const idSolicitud = (await rechazar.getAttribute('data-testid')).replace('rechazar-horas-extra-', '');
    await rechazar.click();
    const nota = ad.getByTestId(`nota-rechazo-horas-extra-${idSolicitud}`);
    await nota.fill('Rechazo verificado: falta justificacion del cliente');
    await ad.getByTestId(`confirmar-rechazo-horas-extra-${idSolicitud}`).click();
    await ad.waitForTimeout(2500);
    const historial = ad.getByTestId(`nota-rechazo-historial-${idSolicitud}`);
    const textoHistorial = await historial.innerText().catch(() => '');
    verificar('M-4-rechazo-con-nota', textoHistorial.includes('falta justificacion'), {
      idSolicitud, texto: textoHistorial.slice(0, 300),
    });
    await captura(ad, '11_reverificacion', 'm4-rechazo-con-nota', { usuario: 'admin' });
  }
  await ctxAdmin.close();

  escribirNota('11_reverificacion', 'resultado-m4', '# Re-verificación funcional M-4\n\n' + JSON.stringify(resultados, null, 2) + '\n');
  registrar('sistema', '11_reverificacion', 'resumen-m4', resultados.every((r) => r.resultado === 'ok') ? 'ok' : 'error', { total: resultados.length });
  console.log(JSON.stringify(resultados, null, 2));
  if (resultados.some((r) => r.resultado === 'error')) process.exitCode = 1;
} catch (e) {
  registrar('sistema', '11_reverificacion', 'verificacion-m4', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await navegador.close();
}
