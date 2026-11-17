import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, iniciarSesionOperador, captura, registrar, escribirNota } from './driver.mjs';
const navegador = await abrirNavegador();
const resultados = [];
try {
  const c1 = await nuevoContexto(navegador);
  const p1 = await c1.newPage();
  await iniciarSesionAdmin(p1, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  await p1.getByTestId('menu-usuario').dispatchEvent('click');
  await p1.waitForTimeout(500);
  const items = await p1.getByRole('button').evaluateAll((ns) => ns.map((n) => n.innerText.trim()).filter(Boolean).slice(-20));
  const salir = p1.getByRole('button', { name: /Cerrar sesión|Salir/ }).first();
  const habia = (await salir.count()) > 0;
  if (habia) await salir.dispatchEvent('click');
  await p1.waitForTimeout(1500);
  const urlAdmin = p1.url();
  await captura(p1, '00_sesion', 'logout-admin-final', { usuario: 'admin' });
  resultados.push({ usuario: 'admin', habiaBoton: habia, url: urlAdmin, items });
  await c1.close();

  const c2 = await nuevoContexto(navegador);
  const p2 = await c2.newPage();
  await iniciarSesionOperador(p2, process.env.E2E_OPERADOR_PIN ?? '');
  const opciones = p2.getByRole('button', { name: /^Opciones de/ }).first();
  const habiaOpciones = (await opciones.count()) > 0;
  if (habiaOpciones) {
    await opciones.dispatchEvent('click');
    await p2.waitForTimeout(500);
    const salirOp = p2.getByRole('button', { name: /^Salir$/ }).first();
    if (await salirOp.count()) await salirOp.dispatchEvent('click');
  }
  await p2.waitForTimeout(1500);
  const urlOp = p2.url();
  const teclado = await p2.getByTestId('teclado-pin').count();
  await captura(p2, '00_sesion', 'logout-operador-final', { usuario: 'operador' });
  resultados.push({ usuario: 'operador', habiaOpciones, url: urlOp, tecladoVisible: teclado > 0 });
  await c2.close();

  registrar('sistema', '00_sesion', 'cierre_sesiones_final', 'ok', { resultados });
  escribirNota('00_sesion', 'cierre-sesiones', `# Cierre de sesiones\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  console.log(JSON.stringify(resultados, null, 2));
} catch (e) {
  registrar('sistema', '00_sesion', 'cierre_sesiones_final', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await navegador.close();
}
