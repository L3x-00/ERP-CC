import { abrirNavegador, nuevoContexto, iniciarSesionOperador, captura, registrar, escribirNota } from './driver.mjs';
const PROC = '71c7d593-0caf-4f93-bfd7-0b1aa3fa8d82:1965c13c-6c87-47a1-9366-e7f182185d64';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
try {
  await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
  const abrir = () => pagina.locator(`[data-testid="abrir-detalle-${PROC}"]`).first().dispatchEvent('click');
  const cerrarFicha = async (d) => { const b = d.getByRole('button', { name: 'Cerrar ficha' }); if (await b.count()) { await b.dispatchEvent('click'); await pagina.waitForTimeout(500); } };
  await abrir();
  let d = pagina.getByTestId('detalle-proceso');
  await d.waitFor();
  const reclaim = d.getByTestId('reclamar-detalle');
  if (await reclaim.count()) { await reclaim.dispatchEvent('click'); await pagina.waitForTimeout(2800); }
  await cerrarFicha(d);
  await abrir();
  d = pagina.getByTestId('detalle-proceso');
  await d.waitFor();
  let iniciarCheck = d.getByTestId('iniciar-detalle');
  if (!(await iniciarCheck.count())) {
    await pagina.waitForTimeout(1500);
    await cerrarFicha(d);
    await abrir();
    d = pagina.getByTestId('detalle-proceso');
    await d.waitFor();
  }
  await captura(pagina, '07_entrega_cobro', '20-doblado-cnc-listo', { usuario: 'operador' });
  const iniciar = d.getByTestId('iniciar-detalle');
  if (!(await iniciar.count())) throw new Error('Doblado no muestra iniciar');
  await iniciar.dispatchEvent('click');
  const checklist = pagina.getByTestId('checklist-inicio');
  await checklist.waitFor({ timeout: 10000 });
  for (const c of await checklist.getByRole('checkbox').all()) await c.check();
  await checklist.getByTestId('confirmar-checklist-inicio').dispatchEvent('click');
  await pagina.waitForTimeout(1800);
  await cerrarFicha(d);
  await abrir();
  d = pagina.getByTestId('detalle-proceso');
  await d.waitFor();
  const alternar = d.getByTestId('alternar-cierre-sesion');
  if (await alternar.count()) await alternar.dispatchEvent('click');
  await pagina.waitForTimeout(500);
  await d.getByLabel('Resultado').selectOption('finalizada');
  await d.getByTestId('piezas-cierre').fill('50');
  await d.getByTestId('usado-cierre').fill('2');
  await d.getByLabel('Motivo del consumo').fill('Doblado CNC soportes QA1711');
  await d.getByTestId('pin-cierre').fill(process.env.E2E_OPERADOR_PIN ?? '');
  await captura(pagina, '07_entrega_cobro', '21-cierre-doblado-50', { usuario: 'operador' });
  await d.getByTestId('cerrar-sesion-detalle').dispatchEvent('click');
  await pagina.waitForTimeout(2200);
  const modal = await pagina.locator('[role="alertdialog"]').innerText().catch(() => 'sin modal');
  console.log('MODAL:', modal.replace(/\s+/g, ' '));
  await captura(pagina, '07_entrega_cobro', '22-resultado-doblado', { usuario: 'operador' });
  const texto = (await d.innerText().catch(() => '')).replace(/\s+/g, ' ');
  console.log('DETALLE FINAL:', texto.slice(0, 800));
  registrar('operador', '07_entrega_cobro', 'cierre_doblado', modal === 'sin modal' ? 'ok' : 'error', { modal: modal.slice(0, 300) });
  escribirNota('07_entrega_cobro', 'doblado-cnc', `# Doblado CNC\n\nMODAL: ${modal}\nDETALLE: ${texto}\n`);
} catch (e) {
  registrar('operador', '07_entrega_cobro', 'cierre_doblado', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
