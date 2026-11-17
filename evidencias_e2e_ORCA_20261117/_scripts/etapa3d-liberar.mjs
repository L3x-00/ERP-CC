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
  const antes = (await pagina.locator('body').innerText()).slice(0, 1100);
  const botones = await pagina.getByRole('button').evaluateAll((ns) => ns.map((n) => n.innerText.trim()).filter(Boolean));
  console.log('ANTES:', antes.replace(/\s+/g, ' ').slice(0, 600));
  console.log('BOTONES:', JSON.stringify(botones));
  await captura(pagina, '05_produccion', '08-orden-planificada', { usuario: 'admin' });
  const liberar = pagina.getByRole('button', { name: 'Liberar' }).first();
  const habia = (await liberar.count()) > 0;
  if (habia) {
    await liberar.dispatchEvent('click');
    await pagina.waitForTimeout(2200);
    await pagina.reload({ waitUntil: 'networkidle' });
  }
  const despues = (await pagina.locator('body').innerText()).slice(0, 1100);
  await captura(pagina, '05_produccion', '09-orden-liberada', { usuario: 'admin' });
  console.log('DESPUES:', despues.replace(/\s+/g, ' ').slice(0, 700));
  registrar('admin', '05_produccion', 'liberar_orden', habia ? 'ok' : 'error', { habia, antes: antes.slice(0, 300), despues: despues.slice(0, 300) });
  escribirNota('05_produccion', 'liberacion-orden', `# Liberación\n\nANTES: ${antes}\n\nDESPUES: ${despues}\n`);
} catch (e) {
  registrar('admin', '05_produccion', 'liberar_orden', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
