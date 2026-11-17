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
  const alternar = d.getByTestId('alternar-cierre-sesion');
  if (await alternar.count()) await alternar.dispatchEvent('click');
  await pagina.waitForTimeout(500);
  await d.getByLabel('Resultado').selectOption('finalizada');
  await d.getByTestId('piezas-cierre').fill('25');
  await d.getByTestId('usado-cierre').fill('0');
  await d.getByTestId('merma-cierre').fill('0');
  await d.getByTestId('pin-cierre').fill(process.env.E2E_OPERADOR_PIN ?? '');
  await captura(pagina, '07_entrega_cobro', '08-cierre-IT02-sin-consumo', { usuario: 'operador' });
  await d.getByTestId('cerrar-sesion-detalle').dispatchEvent('click');
  await pagina.waitForTimeout(2200);
  const modal = await pagina.locator('[role="alertdialog"]').innerText().catch(() => 'sin modal');
  const resumen = await pagina.getByTestId('resumen-cierre-sesion').innerText().catch(() => 'sin resumen');
  console.log('MODAL:', modal.replace(/\s+/g, ' '));
  console.log('RESUMEN:', resumen.replace(/\s+/g, ' ').slice(0, 900));
  await captura(pagina, '07_entrega_cobro', '09-resultado-IT02-sin-consumo', { usuario: 'operador' });
  await d.getByRole('button', { name: 'Entendido' }).dispatchEvent('click').catch(() => {});
  await pagina.waitForTimeout(800);
  const texto = (await d.innerText().catch(() => '')).replace(/\s+/g, ' ');
  console.log('DETALLE FINAL:', texto.slice(0, 900));
  registrar('operador', '07_entrega_cobro', 'cierre_IT02_sin_consumo', modal === 'sin modal' ? 'ok' : 'error', { modal: modal.slice(0, 400) });
  escribirNota('07_entrega_cobro', 'it02-sin-consumo', `# Cierre IT02 sin consumo\n\nMODAL: ${modal}\nRESUMEN: ${resumen}\nDETALLE: ${texto}\n`);
} catch (e) {
  registrar('operador', '07_entrega_cobro', 'cierre_IT02_sin_consumo', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
