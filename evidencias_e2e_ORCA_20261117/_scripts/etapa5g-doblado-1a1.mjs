import { abrirNavegador, nuevoContexto, iniciarSesionOperador, captura, registrar, escribirNota } from './driver.mjs';
const PROC = '71c7d593-0caf-4f93-bfd7-0b1aa3fa8d82:1965c13c-6c87-47a1-9366-e7f182185d64';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
try {
  await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
  await pagina.locator(`[data-testid="abrir-detalle-${PROC}"]`).first().dispatchEvent('click');
  const d = pagina.getByTestId('detalle-proceso');
  await d.waitFor();
  const alternar = d.getByTestId('alternar-cierre-sesion');
  if (await alternar.count()) await alternar.dispatchEvent('click');
  await pagina.waitForTimeout(500);
  const solucion = pagina.getByRole('button', { name: 'Usar 50 piezas (1:1)' });
  if (await solucion.count()) {
    await solucion.dispatchEvent('click');
    await pagina.waitForTimeout(400);
  }
  await d.getByLabel('Resultado').selectOption('finalizada');
  await d.getByTestId('piezas-cierre').fill('50');
  const usado = d.getByTestId('usado-cierre');
  if (await usado.count()) await usado.fill('50');
  const motivo = d.getByLabel('Motivo del consumo');
  if (await motivo.count()) await motivo.fill('Consumo 1:1 doblado CNC QA1711');
  await d.getByTestId('pin-cierre').fill(process.env.E2E_OPERADOR_PIN ?? '');
  await captura(pagina, '07_entrega_cobro', '23-doblado-consumo-1a1', { usuario: 'operador' });
  await d.getByTestId('cerrar-sesion-detalle').dispatchEvent('click');
  await pagina.waitForTimeout(2200);
  const modal = await pagina.locator('[role="alertdialog"]').innerText().catch(() => 'sin modal');
  console.log('MODAL:', modal.replace(/\s+/g, ' '));
  await captura(pagina, '07_entrega_cobro', '24-doblado-completado', { usuario: 'operador' });
  const texto = (await d.innerText().catch(() => '')).replace(/\s+/g, ' ');
  console.log('DETALLE:', texto.slice(0, 700));
  registrar('operador', '07_entrega_cobro', 'doblado_1a1', modal === 'sin modal' ? 'ok' : 'error', { modal: modal.slice(0, 300) });
  escribirNota('07_entrega_cobro', 'doblado-1a1', `# Doblado 1:1\n\nMODAL: ${modal}\nDETALLE: ${texto}\n`);
} catch (e) {
  registrar('operador', '07_entrega_cobro', 'doblado_1a1', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
