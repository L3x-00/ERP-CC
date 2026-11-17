import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, registrar, captura, escribirNota } from './driver.mjs';

const SUFIJO = 'QA1711';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(10000);
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();
  await pagina.goto('/rfq', { waitUntil: 'networkidle' });
  const fila = pagina.getByRole('row', { name: new RegExp(SUFIJO) }).first();
  await fila.waitFor();
  const textoFila = (await fila.innerText()).replace(/\s+/g, ' ');
  console.log('FILA:', textoFila);
  await fila.getByRole('link', { name: /Continuar captura/ }).click();
  await pagina.getByTestId('ficha-rfq').waitFor();
  console.log('URL RFQ:', pagina.url());
  const ficha = pagina.getByTestId('ficha-rfq');
  await ficha.getByRole('tab', { name: 'Ítems' }).click();
  await pagina.getByRole('button', { name: 'Agregar ítem' }).click();
  const dlg = pagina.getByRole('dialog', { name: 'Nuevo ítem' });
  await dlg.waitFor();
  const materiales = await dlg.getByLabel('Material').locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
  const procesos = await dlg.locator('input[type="checkbox"]').evaluateAll((ns) => ns.map((n) => ({ id: n.id, aria: n.getAttribute('aria-label'), texto: n.closest('label')?.innerText?.trim() })));
  await dlg.getByLabel('Material').selectOption({ index: 1 });
  const espesores = await dlg.getByLabel('Espesor').locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim(), disabled: n.disabled })));
  console.log('MATERIALES:', JSON.stringify(materiales, null, 2));
  console.log('ESPERORES:', JSON.stringify(espesores, null, 2));
  console.log('PROCESOS:', JSON.stringify(procesos, null, 2));
  await captura(pagina, '01_rfq', 'catalogo-materiales-produccion', { usuario: 'admin' });
  escribirNota('01_rfq', 'catalogo-produccion', `# Catálogo real de producción\n\nFILA RFQ: ${textoFila}\n\nMATERIALES:\n\`\`\`json\n${JSON.stringify(materiales, null, 2)}\n\`\`\`\n\nESPESORES (primer material):\n\`\`\`json\n${JSON.stringify(espesores, null, 2)}\n\`\`\`\n\nPROCESOS:\n\`\`\`json\n${JSON.stringify(procesos, null, 2)}\n\`\`\`\n`);
  registrar('admin', '01_rfq', 'probe_catalogo', 'ok', { nMateriales: materiales.length, nProcesos: procesos.length });
} catch (e) {
  registrar('admin', '01_rfq', 'probe_catalogo', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
