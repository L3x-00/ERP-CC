import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, descartarModalTipoCambio, registrar } from './driver.mjs';

const RECURSO = '52e30fdb-c33d-4b4d-961f-662f4b010b4c';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const p = await ctx.newPage();
p.setDefaultTimeout(20000);
try {
  await iniciarSesionAdmin(p, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  await descartarModalTipoCambio(p);
  await p.goto('/planeacion', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.getByTestId('toggle-capacidad-instalada').click();
  await p.waitForTimeout(1500);
  const campo = p.locator(`#jornada-${RECURSO}`);
  await campo.fill('9');
  await p.getByTestId('guardar-capacidad-LASER-01').click();
  await p.waitForTimeout(2500);
  const actual = await campo.inputValue().catch(() => '?');
  const ok = actual === '9';
  registrar('admin', '11_reverificacion', 'm4-jornada-restaurada', ok ? 'ok' : 'error', { actual });
  console.log('JORNADA RESTAURADA:', actual, ok);
  if (!ok) process.exitCode = 1;
} catch (e) {
  registrar('admin', '11_reverificacion', 'm4-jornada-restaurada', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
