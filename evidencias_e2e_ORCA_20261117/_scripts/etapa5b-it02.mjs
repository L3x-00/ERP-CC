import { abrirNavegador, nuevoContexto, iniciarSesionOperador, captura, registrar, escribirNota } from './driver.mjs';
const IT02 = '7e4f4d78-f9d9-4e5d-b3cd-a93b3c357789:57f072fa-51f2-4e34-a6de-4551111604c1';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
try {
  await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
  await pagina.locator(`[data-testid="abrir-detalle-${IT02}"]`).first().dispatchEvent('click');
  const d = pagina.getByTestId('detalle-proceso');
  await d.waitFor();
  await pagina.waitForTimeout(700);
  const alternar = d.getByTestId('alternar-cierre-sesion');
  if (await alternar.count()) await alternar.dispatchEvent('click');
  await pagina.waitForTimeout(500);
  const texto = (await d.innerText()).replace(/\s+/g, ' ');
  console.log('DETALLE IT02:', texto.slice(0, 3000));
  const campos = await d.locator('input,select,textarea').evaluateAll((ns) => ns.map((n) => ({ aria: n.getAttribute('aria-label'), id: n.getAttribute('data-testid'), type: n.type, val: n.value, d: n.disabled })));
  console.log('CAMPOS:', JSON.stringify(campos, null, 2));
  await captura(pagina, '07_entrega_cobro', '05-formulario-cierre-IT02', { usuario: 'operador' });
  await d.getByLabel('Resultado').selectOption('finalizada');
  await d.getByTestId('piezas-cierre').fill('25');
  const usado = d.getByTestId('usado-cierre');
  if (await usado.count()) await usado.fill('3');
  const motivo = d.getByLabel('Motivo del consumo');
  if (await motivo.count()) await motivo.fill('Router CNC panel MDF QA1711');
  await d.getByTestId('pin-cierre').fill(process.env.E2E_OPERADOR_PIN ?? '');
  await captura(pagina, '07_entrega_cobro', '06-cierre-IT02-lleno', { usuario: 'operador' });
  await d.getByTestId('cerrar-sesion-detalle').dispatchEvent('click');
  await pagina.waitForTimeout(2200);
  const modal = await pagina.locator('[role="alertdialog"]').innerText().catch(() => 'sin modal');
  const resumen = await pagina.getByTestId('resumen-cierre-sesion').innerText().catch(() => 'sin resumen');
  console.log('MODAL:', modal.replace(/\s+/g, ' '));
  console.log('RESUMEN:', resumen.replace(/\s+/g, ' ').slice(0, 800));
  await captura(pagina, '07_entrega_cobro', '07-resultado-cierre-IT02', { usuario: 'operador' });
  escribirNota('07_entrega_cobro', 'diagnostico-it02', `# Cierre IT02\n\nDETALLE: ${texto}\n\nMODAL: ${modal}\n\nRESUMEN: ${resumen}\n`);
  registrar('operador', '07_entrega_cobro', 'cierre_IT02_diagnostico', modal === 'sin modal' ? 'ok' : 'error', { modal: modal.slice(0, 400) });
} catch (e) {
  registrar('operador', '07_entrega_cobro', 'cierre_IT02_diagnostico', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
