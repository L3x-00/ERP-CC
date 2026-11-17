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
  const material = d.getByTestId('material-cierre');
  const opciones = await material.locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
  const crs = opciones.find((o) => o.t.includes('calibre 14'));
  if (crs) await material.selectOption(crs.v);
  await d.getByLabel('Resultado').selectOption('finalizada');
  await d.getByTestId('piezas-cierre').fill('25');
  await d.getByTestId('usado-cierre').fill('1');
  await d.getByTestId('merma-cierre').fill('0');
  await d.getByLabel('Motivo del consumo').fill('Workaround E2E: material con costo confirmado');
  await d.getByTestId('pin-cierre').fill(process.env.E2E_OPERADOR_PIN ?? '');
  await captura(pagina, '07_entrega_cobro', '10-workaround-material-costo', { usuario: 'operador' });
  await d.getByTestId('cerrar-sesion-detalle').dispatchEvent('click');
  await pagina.waitForTimeout(2200);
  const modal = await pagina.locator('[role="alertdialog"]').innerText().catch(() => 'sin modal');
  const resumen = await pagina.getByTestId('resumen-cierre-sesion').innerText().catch(() => 'sin resumen');
  console.log('MODAL:', modal.replace(/\s+/g, ' '));
  console.log('RESUMEN:', resumen.replace(/\s+/g, ' ').slice(0, 900));
  await captura(pagina, '07_entrega_cobro', '11-resultado-workaround', { usuario: 'operador' });
  registrar('operador', '07_entrega_cobro', 'workaround_costo', modal === 'sin modal' ? 'ok' : 'error', { modal: modal.slice(0, 400) });
  escribirNota('07_entrega_cobro', 'workaround-costo', `# Workaround consumo IT02\n\nOpciones: ${JSON.stringify(opciones)}\nMODAL: ${modal}\nRESUMEN: ${resumen}\n`);
} catch (e) {
  registrar('operador', '07_entrega_cobro', 'workaround_costo', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
