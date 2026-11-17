import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();
  await pagina.goto('/entregas', { waitUntil: 'networkidle' });
  await pagina.getByTestId('preparar-entrega-O-1126_07').dispatchEvent('click');
  const panel = pagina.getByTestId('panel-preparar-entrega');
  await panel.waitFor();
  const testids = await panel.locator('[data-testid]').evaluateAll((ns) => ns.map((n) => ({ id: n.getAttribute('data-testid'), tag: n.tagName, val: n.value ?? '' })));
  console.log('TESTIDS PANEL:', JSON.stringify(testids, null, 2));
  await panel.getByTestId('entrega-cantidad-0').nth(0).fill('50');
  await panel.getByTestId('entrega-cantidad-0').nth(1).fill('25');
  const recibido = pagina.getByLabel('Recibido por').first();
  if (await recibido.count()) await recibido.fill('Laura Méndez');
  const valores = await panel.locator('[data-testid]').evaluateAll((ns) => ns.map((n) => ({ id: n.getAttribute('data-testid'), val: n.value ?? '' })));
  console.log('VALORES:', JSON.stringify(valores, null, 2));
  await captura(pagina, '07_entrega_cobro', '34-panel-entrega-testids', { usuario: 'admin' });
  await panel.getByTestId('confirmar-registrar-entrega').dispatchEvent('click');
  await pagina.waitForTimeout(2500);
  const mensaje = (await pagina.getByTestId('entrega-mensaje').innerText().catch(() => 'sin mensaje')).replace(/\s+/g, ' ');
  console.log('MENSAJE:', mensaje);
  await captura(pagina, '07_entrega_cobro', '35-entrega-confirmada', { usuario: 'admin' });
  await pagina.goto('/entregas', { waitUntil: 'networkidle' });
  const nota = pagina.getByRole('tab', { name: /Notas/ });
  if (await nota.count()) await nota.dispatchEvent('click');
  await pagina.waitForTimeout(1200);
  const texto = (await pagina.locator('body').innerText()).replace(/\s+/g, ' ');
  const idx = texto.indexOf('NE-O-1126_07');
  console.log('NOTA NUESTRA:', idx >= 0 ? texto.slice(idx, idx + 450) : 'NO APARECE');
  registrar('admin', '07_entrega_cobro', 'entrega_confirmada', idx >= 0 ? 'ok' : 'error', { mensaje, nota: idx >= 0 ? texto.slice(idx, idx + 300) : null });
  escribirNota('07_entrega_cobro', 'entrega-confirmada', `# Confirmación de entrega\n\nMENSAJE: ${mensaje}\nNOTA: ${idx >= 0 ? texto.slice(idx, idx + 500) : 'no aparece'}\n`);
} catch (e) {
  registrar('admin', '07_entrega_cobro', 'entrega_confirmada', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
