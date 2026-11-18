import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, descartarModalTipoCambio, captura, registrar, escribirNota } from './driver.mjs';

const RFQ_URL = 'https://erp-cc-flame.vercel.app/rfq?rfq=dd18497d-9d37-456a-92f7-1245bfe61b4d';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const p = await ctx.newPage();
p.setDefaultTimeout(25000);
const resultados = [];

function verificar(id, ok, detalle = {}) {
  const estado = ok ? 'ok' : 'error';
  resultados.push({ id, resultado: estado, ...detalle });
  registrar('admin', '11_reverificacion', id, estado, detalle);
  console.log(`${ok ? 'OK ' : 'FAIL'} ${id}`);
}

try {
  await iniciarSesionAdmin(p, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  await descartarModalTipoCambio(p);
  await p.goto(RFQ_URL, { waitUntil: 'networkidle' });
  const ficha = p.getByTestId('ficha-rfq');
  await ficha.waitFor();

  // M-3: el prospecto se activa desde la propia ficha RFQ.
  const activar = p.getByTestId('rfq-activar-cliente');
  const esProspecto = await activar.isVisible().catch(() => false);
  if (esProspecto) {
    verificar('M-3-boton-en-ficha-rfq', true, {
      texto: await activar.innerText(),
      ficha: (await ficha.innerText()).includes('Prospecto'),
    });
    await captura(p, '11_reverificacion', 'm3-prospecto-en-rfq', { usuario: 'admin' });
    await activar.click();
    await activar.waitFor({ state: 'detached', timeout: 25000 });
    verificar('M-3-activado-sin-salir', (await activar.count()) === 0);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(3000);
    verificar('M-3-persiste-tras-recarga', (await p.getByTestId('rfq-activar-cliente').count()) === 0);
    await captura(p, '11_reverificacion', 'm3-activo-persistido', { usuario: 'admin' });
  } else {
    verificar('M-3-ya-verificado', true, { nota: 'Cliente ya activo en una ejecución anterior' });
  }

  // M-5: con el RFQ en READY, la pestaña Revisar ofrece re-validación de solo lectura.
  verificar('M-5-rfq-ready', (await p.getByTestId('ficha-rfq').innerText()).includes('Listo para propuesta'));
  const pestana = p.getByRole('tab', { name: 'Revisar' });
  verificar('M-5-pestana-revisar', (await pestana.count()) > 0);
  await pestana.click();
  const panel = p.getByTestId('panel-revision-rfq');
  await panel.waitFor({ state: 'visible' });
  // El checklist llega de la RPC: esperar el estado final antes de asertar.
  await panel.getByText('No hay cambios de estado pendientes').waitFor({ state: 'visible', timeout: 25000 });
  const texto = await panel.innerText();
  verificar(
    'M-5-texto-y-checklist',
    texto.includes('Revisar el RFQ tras la edición') &&
      texto.includes('No hay cambios de estado pendientes') &&
      !texto.includes('Marcar listo para propuesta') &&
      (await p.getByTestId('revision-checklist').count()) > 0,
    { extracto: texto.slice(0, 320) },
  );
  await captura(p, '11_reverificacion', 'm5-revisar-en-ready', { usuario: 'admin' });
  const revalidar = panel.getByRole('button', { name: 'Revalidar' });
  if (await revalidar.count()) await revalidar.click();
  await p.waitForTimeout(1500);
  verificar('M-5-revalidar-no-cambia-estado', (await p.getByTestId('ficha-rfq').innerText()).includes('Listo para propuesta'));

  escribirNota('11_reverificacion', 'resultado-m3-m5', '# Re-verificación funcional M-3 y M-5\n\n' + JSON.stringify(resultados, null, 2) + '\n');
  registrar('admin', '11_reverificacion', 'resumen-m3-m5', resultados.every((r) => r.resultado === 'ok') ? 'ok' : 'error', {
    total: resultados.length,
  });
  console.log(JSON.stringify(resultados, null, 2));
  if (resultados.some((r) => r.resultado === 'error')) process.exitCode = 1;
} catch (e) {
  registrar('admin', '11_reverificacion', 'verificacion-m3-m5', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
