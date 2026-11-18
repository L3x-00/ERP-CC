import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, descartarModalTipoCambio, captura, registrar, escribirNota } from './driver.mjs';

const CODIGO = 'QA-NC-1717';
const NOMBRE = 'Material QA sin costo';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const p = await ctx.newPage();
p.setDefaultTimeout(20000);
try {
  await iniciarSesionAdmin(p, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  await descartarModalTipoCambio(p);
  await p.goto('/inventario', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Nuevo material' }).click();
  const modal = p.getByTestId('modal-guardar-material');
  await modal.waitFor();
  await p.locator('#material-catalogo-codigo').fill(CODIGO);
  await p.locator('#material-catalogo-nombre').fill(NOMBRE);
  await p.locator('#material-catalogo-unidad').fill('pieza');
  await captura(p, '11_reverificacion', 'a1-material-sin-costo-form', { usuario: 'admin' });
  await modal.getByRole('button', { name: 'Crear material' }).click();
  await modal.waitFor({ state: 'hidden', timeout: 20000 });
  await p.waitForTimeout(1200);
  const fila = p.getByTestId(`fila-material-${CODIGO}`);
  const texto = await fila.innerText().catch(() => 'sin fila');
  const ok = texto.includes(CODIGO);
  await captura(p, '11_reverificacion', 'a1-material-sin-costo-creado', { usuario: 'admin' });
  registrar('admin', '11_reverificacion', 'a1-material-creado', ok ? 'ok' : 'error', { codigo: CODIGO, fila: texto.slice(0, 300) });
  escribirNota('11_reverificacion', 'a1-material', `# Material sin costo para A-1\n\n- Código: ${CODIGO}\n- Nombre: ${NOMBRE}\n- Fila: ${texto.slice(0, 300)}\n`);
  console.log('FILA:', texto.slice(0, 400));
  if (!ok) process.exitCode = 1;
} catch (e) {
  registrar('admin', '11_reverificacion', 'a1-material-creado', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
