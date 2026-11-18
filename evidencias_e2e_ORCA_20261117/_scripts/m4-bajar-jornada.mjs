import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, descartarModalTipoCambio, captura, registrar, escribirNota } from './driver.mjs';

const CURSOS = '52e30fdb-c33d-4b4d-961f-662f4b010b4c';
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
  const campo = p.locator(`#jornada-${CURSOS}`);
  const original = await campo.inputValue();
  await campo.fill('0.5');
  await p.getByTestId('guardar-capacidad-LASER-01').click();
  await p.waitForTimeout(2500);
  const actual = await campo.inputValue().catch(() => '?');
  const ok = actual === '0.5';
  await captura(p, '11_reverificacion', 'm4-jornada-0-5', { usuario: 'admin' });
  escribirNota('11_reverificacion', 'm4-jornada-original', `# Jornada original de LASER-01\n\n- recurso_id: ${CURSOS}\n- jornada original: ${original} h\n- jornada temporal: 0.5 h\n- RESTAURAR al terminar M-4\n`);
  registrar('admin', '11_reverificacion', 'm4-jornada-temporal', ok ? 'ok' : 'error', { original, actual });
  console.log(JSON.stringify({ original, actual, ok }));
  if (!ok) process.exitCode = 1;
} catch (e) {
  registrar('admin', '11_reverificacion', 'm4-jornada-temporal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
