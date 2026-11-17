import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, iniciarSesionOperador, captura } from './driver.mjs';
const navegador = await abrirNavegador();
try {
  const c1 = await nuevoContexto(navegador);
  const p1 = await c1.newPage();
  await iniciarSesionAdmin(p1, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const t = p1.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await t.count()) await t.click();
  await p1.getByTestId('menu-usuario').dispatchEvent('click');
  await p1.waitForTimeout(600);
  const enlaces = await p1.locator('a,button').evaluateAll((ns) => ns.map((n) => ({ tag: n.tagName, t: n.innerText.trim().replace(/\s+/g, ' '), href: n.getAttribute('href') })).filter((x) => x.t).slice(-25));
  console.log('MENU ADMIN:', JSON.stringify(enlaces, null, 2));
  await captura(p1, '00_sesion', 'menu-admin-logout', { usuario: 'admin' });
  await c1.close();

  const c2 = await nuevoContexto(navegador);
  const p2 = await c2.newPage();
  await iniciarSesionOperador(p2, process.env.E2E_OPERADOR_PIN ?? '');
  const op = p2.getByRole('button', { name: /^Opciones de/ }).first();
  await op.dispatchEvent('click');
  await p2.waitForTimeout(600);
  const enlaces2 = await p2.locator('a,button').evaluateAll((ns) => ns.map((n) => ({ tag: n.tagName, t: n.innerText.trim().replace(/\s+/g, ' '), href: n.getAttribute('href') })).filter((x) => x.t).slice(-25));
  console.log('MENU OPERADOR:', JSON.stringify(enlaces2, null, 2));
  await captura(p2, '00_sesion', 'menu-operador-logout', { usuario: 'operador' });
  await c2.close();
} catch (e) { console.error(e); process.exitCode = 1; } finally { await navegador.close(); }
