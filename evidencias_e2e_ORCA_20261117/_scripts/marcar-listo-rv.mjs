import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, descartarModalTipoCambio, captura, registrar } from './driver.mjs';
const RFQ_URL = 'https://erp-cc-flame.vercel.app/rfq?rfq=dd18497d-9d37-456a-92f7-1245bfe61b4d';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const p = await ctx.newPage();
p.setDefaultTimeout(20000);
try {
  await iniciarSesionAdmin(p, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  await descartarModalTipoCambio(p);
  await p.goto(RFQ_URL, { waitUntil: 'networkidle' });
  await p.getByTestId('ficha-rfq').waitFor();
  await p.waitForTimeout(2000);
  await p.getByRole('button', { name: 'Marcar listo' }).click();
  const panel = p.getByTestId('validacion-listo');
  const texto = await panel.innerText();
  console.log('VALIDACION:', texto.slice(0, 1200).replace(/\n+/g, ' | '));
  const confirmar = p.getByRole('button', { name: 'Confirmar y marcar listo' });
  console.log('CONFIRMAR:', await confirmar.count(), await confirmar.isEnabled().catch(() => false));
  if (await confirmar.count() && await confirmar.isEnabled()) {
    await confirmar.click();
    await p.waitForTimeout(2500);
    const ficha = await p.getByTestId('ficha-rfq').innerText();
    console.log('READY:', ficha.includes('Listo para propuesta'));
    await captura(p, '11_reverificacion', 'rv-listo-final', { usuario: 'admin' });
    registrar('admin', '11_reverificacion', 'rv-listo-final', ficha.includes('Listo para propuesta') ? 'ok' : 'error');
  } else {
    registrar('admin', '11_reverificacion', 'rv-listo-final', 'error', { texto: texto.slice(0, 600) });
    process.exitCode = 1;
  }
} catch (e) {
  console.error('ERROR', String(e && e.message || e));
  registrar('admin', '11_reverificacion', 'rv-listo-final', 'error', { mensaje: String(e && e.message || e) });
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
