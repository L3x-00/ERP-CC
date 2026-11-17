import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, escribirNota } from './driver.mjs';

const RFQ_ID = 'cc86f00f-fb5e-413c-a7f5-e8b788c86f7a';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await MT.count()) await MT.click();
  await pagina.goto(`/rfq?rfq=${RFQ_ID}`, { waitUntil: 'networkidle' });
  await pagina.getByRole('button', { name: 'Marcar listo' }).click();
  const dlg = pagina.getByRole('dialog');
  await dlg.waitFor();
  await dlg.getByText(/Falta:|cumple todos los requisitos|Completa la próxima acción/).first().waitFor({ timeout: 15000 });
  const campos = await dlg.locator('input,select,textarea').evaluateAll((ns) => ns.map((n) => ({
    tag: n.tagName, id: n.id, name: n.name, type: n.type, aria: n.getAttribute('aria-label'),
    placeholder: n.placeholder, value: n.value, disabled: n.disabled,
    opciones: n.tagName === 'SELECT' ? Array.from(n.options).map((o) => ({ v: o.value, t: o.text })) : undefined,
  })));
  const botones = await dlg.getByRole('button').evaluateAll((ns) => ns.map((n) => ({ t: n.innerText.trim(), aria: n.getAttribute('aria-label'), disabled: n.disabled })));
  const texto = (await dlg.innerText()).slice(0, 3000);
  console.log('CAMPOS:', JSON.stringify(campos, null, 2));
  console.log('BOTONES:', JSON.stringify(botones, null, 2));
  console.log('TEXTO:', texto);
  await captura(pagina, '01_rfq', '52-modal-listo-campos', { usuario: 'admin' });
  escribirNota('01_rfq', 'modal-listo-campos', `# Campos del modal Marcar listo\n\nTEXTO:\n${texto}\n\nCAMPOS:\n\`\`\`json\n${JSON.stringify(campos, null, 2)}\n\`\`\`\n\nBOTONES:\n\`\`\`json\n${JSON.stringify(botones, null, 2)}\n\`\`\`\n`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
