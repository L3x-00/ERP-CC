import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
import { readFileSync } from 'node:fs';
const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();
  await pagina.goto(ESTADO.ordenUrl, { waitUntil: 'networkidle' });
  await pagina.getByTestId('ficha-cerrar').dispatchEvent('click');
  await pagina.waitForTimeout(800);
  const conf = pagina.getByTestId('ficha-confirmar-cierre');
  if (await conf.count()) {
    await captura(pagina, '08_documentos', 'confirmacion-cierre-admin', { usuario: 'admin' });
    await conf.dispatchEvent('click');
    await pagina.waitForTimeout(2200);
  }
  await pagina.reload({ waitUntil: 'networkidle' });
  const texto = (await pagina.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1100);
  await captura(pagina, '08_documentos', 'cierre-administrativo-completado', { usuario: 'admin' });
  console.log('ESTADO:', texto);
  registrar('admin', '08_documentos', 'cierre_admin_completado', 'ok', { estado: texto.slice(0, 500) });
  escribirNota('08_documentos', 'cierre-admin-completado', `# Cierre administrativo completado\n\n${texto}\n`);
} catch (e) {
  registrar('admin', '08_documentos', 'cierre_admin_completado', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
