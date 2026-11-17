import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, iniciarSesionOperador, captura, registrar, escribirNota } from './driver.mjs';
const navegador = await abrirNavegador();
const resultados = [];
try {
  const c1 = await nuevoContexto(navegador);
  const p1 = await c1.newPage();
  await iniciarSesionAdmin(p1, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const mt = p1.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await mt.count()) await mt.click();
  await p1.getByTestId('menu-usuario').click({ force: true });
  await p1.waitForTimeout(700);
  const cs = p1.getByRole('button', { name: 'Cerrar sesión' });
  if (!(await cs.count())) await p1.getByTestId('menu-usuario').click({ force: true });
  await p1.getByRole('button', { name: 'Cerrar sesión' }).click({ force: true });
  await p1.waitForTimeout(1800);
  resultados.push({ usuario: 'admin', url: p1.url(), enLogin: p1.url().includes('/iniciar-sesion') });
  await captura(p1, '00_sesion', 'logout-admin-confirmado', { usuario: 'admin' });
  await c1.close();

  const c2 = await nuevoContexto(navegador);
  const p2 = await c2.newPage();
  await iniciarSesionOperador(p2, process.env.E2E_OPERADOR_PIN ?? '');
  await p2.getByRole('button', { name: /^Opciones de/ }).first().dispatchEvent('click');
  await p2.waitForTimeout(400);
  await p2.getByRole('button', { name: 'Salir', exact: true }).dispatchEvent('click');
  await p2.waitForTimeout(1800);
  resultados.push({ usuario: 'operador', url: p2.url(), enLogin: p2.url().includes('/operador'), teclado: await p2.getByTestId('teclado-pin').count() });
  await captura(p2, '00_sesion', 'logout-operador-confirmado', { usuario: 'operador' });
  await c2.close();

  registrar('sistema', '00_sesion', 'logout_final', 'ok', { resultados });
  escribirNota('00_sesion', 'logout-final', `# Logout final\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  console.log(JSON.stringify(resultados, null, 2));
} catch (e) {
  registrar('sistema', '00_sesion', 'logout_final', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await navegador.close();
}
