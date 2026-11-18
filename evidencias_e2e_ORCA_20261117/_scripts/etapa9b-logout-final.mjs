import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, iniciarSesionOperador, descartarModalTipoCambio, captura, registrar, escribirNota } from './driver.mjs';
const navegador = await abrirNavegador();
const resultados = [];
try {
  const c1 = await nuevoContexto(navegador);
  const p1 = await c1.newPage();
  await iniciarSesionAdmin(p1, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  // El modal Radix de tipo de cambio marca el resto de la página como aria-hidden.
  await descartarModalTipoCambio(p1);
  await p1.getByTestId('menu-usuario').click();
  // B-3: «Cerrar sesión» es role=menuitem (no button) y tiene testid estable.
  const cs = p1.getByTestId('cerrar-sesion');
  await cs.waitFor({ state: 'visible' });
  await cs.click();
  await p1.waitForURL((url) => url.pathname === '/iniciar-sesion', { timeout: 30000 });
  resultados.push({ usuario: 'admin', url: p1.url(), enLogin: true });
  await captura(p1, '00_sesion', 'logout-admin-confirmado', { usuario: 'admin' });
  await c1.close();

  const c2 = await nuevoContexto(navegador);
  const p2 = await c2.newPage();
  await iniciarSesionOperador(p2, process.env.E2E_OPERADOR_PIN ?? '');
  await p2.getByRole('button', { name: /^Opciones de/ }).first().click();
  await p2.getByTestId('salir-operador').click();
  await p2.waitForURL((url) => url.pathname === '/operador', { timeout: 30000 });
  resultados.push({ usuario: 'operador', url: p2.url(), enLogin: true, teclado: await p2.getByTestId('teclado-pin').count() });
  await captura(p2, '00_sesion', 'logout-operador-confirmado', { usuario: 'operador' });
  await c2.close();

  registrar('sistema', '00_sesion', 'logout_final', 'ok', { resultados });
  escribirNota('00_sesion', 'logout-final', '# Logout final\n\n' + JSON.stringify(resultados, null, 2) + '\n');
  console.log(JSON.stringify(resultados, null, 2));
} catch (e) {
  registrar('sistema', '00_sesion', 'logout_final', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await navegador.close();
}
