import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
import { writeFileSync, readFileSync } from 'node:fs';

const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const RFQ_ID = 'cc86f00f-fb5e-413c-a7f5-e8b788c86f7a';
const SUFIJO = 'QA1711';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
const resultados = [];
const hallazgos = [];

async function paso(nombre, fn, critico = true) {
  try {
    const r = await fn();
    resultados.push({ paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('admin', '01_rfq', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1400);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '01_rfq', nombre, 'error', { mensaje: msg });
    hallazgos.push({ severidad: 'media', paso: nombre, mensaje: msg });
    await captura(pagina, '01_rfq', `error1e-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}

try {
  await paso('login', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(`/rfq?rfq=${RFQ_ID}`, { waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Resumen' }).click();
  });

  await paso('completar-seguimiento', async () => {
    await pagina.getByRole('button', { name: 'Editar resumen' }).click();
    const form = pagina.getByTestId('resumen-rfq');
    await form.getByLabel('Descripción general').fill(`Soporte metálico SM-2026-02 y panel MDF-12 para ${SUFIJO}. Corte láser, doblado CNC y router CNC. Versión validada del alcance técnico.`);
    const accion = form.getByLabel('Acción', { exact: true }).first();
    const opcionesAccion = await accion.locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
    await accion.selectOption({ index: 1 });
    const fecha = form.getByLabel('Fecha', { exact: true }).first();
    await fecha.fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    const resp = form.getByLabel('Responsable de la acción', { exact: true }).first();
    const opcionesResp = await resp.locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
    await resp.selectOption({ index: 1 });
    await captura(pagina, '01_rfq', '44-formulario-seguimiento-completo', { usuario: 'admin' });
    await pagina.getByRole('button', { name: 'Guardar datos' }).click();
    await pagina.getByText('Datos guardados.').first().waitFor({ timeout: 15000 });
    return { opcionesAccion, opcionesResp };
  });

  await paso('validar-confirmar', async () => {
    await pagina.getByRole('button', { name: 'Marcar listo' }).click();
    const txt = await pagina.getByTestId('validacion-listo').innerText();
    await captura(pagina, '01_rfq', '45-validacion-tras-seguimiento', { usuario: 'admin' });
    const conf = pagina.getByRole('button', { name: 'Confirmar y marcar listo' });
    let confirmado = false;
    if (await conf.count() && await conf.isEnabled()) { await conf.click(); confirmado = true; }
    await pagina.waitForTimeout(1500);
    const txtFicha = await pagina.getByTestId('ficha-rfq').innerText();
    const estado = txtFicha.includes('Listo para propuesta') ? 'READY_FOR_PROPOSAL' : 'INCOMPLETE';
    ESTADO.rfqEstado = estado;
    await captura(pagina, '01_rfq', '46-rfq-listo-para-propuesta', { usuario: 'admin' });
    return { txt: txt.slice(0, 700), confirmado, estado };
  });

  await paso('editar-tras-validar', async () => {
    const boton = pagina.getByRole('button', { name: 'Editar resumen' });
    const editable = (await boton.count()) > 0;
    if (!editable) return { editable: false, nota: 'READY_FOR_PROPOSAL no expone Editar resumen' };
    await boton.click();
    await pagina.getByTestId('resumen-rfq').getByLabel('Descripción general').fill(`Soporte metálico SM-2026-02 y panel MDF-12 para ${SUFIJO}. Alcance congelado: calibre 14, doblado CNC y router CNC; revisado tras validación.`);
    await captura(pagina, '01_rfq', '47-edicion-post-validacion', { usuario: 'admin' });
    await pagina.getByRole('button', { name: 'Guardar datos' }).click();
    await pagina.getByText('Datos guardados.').first().waitFor({ timeout: 15000 });
    const marcar = pagina.getByRole('button', { name: 'Marcar listo' });
    const revalidarDisponible = (await marcar.count()) > 0;
    await captura(pagina, '01_rfq', '48-estado-tras-edicion', { usuario: 'admin' });
    return { editable: true, revalidarDisponible };
  }, false);

  await paso('activar-cliente', async () => {
    await pagina.goto('/clientes', { waitUntil: 'networkidle' });
    const boton = pagina.getByRole('button', { name: new RegExp(SUFIJO) }).first();
    await boton.waitFor({ timeout: 15000 });
    await boton.click();
    const dlg = pagina.getByRole('dialog', { name: 'Ficha del cliente' });
    await dlg.waitFor();
    await pagina.waitForTimeout(2500);
    const texto = (await dlg.innerText()).slice(0, 1600);
    const botones = await dlg.getByRole('button').evaluateAll((ns) => ns.map((n) => n.innerText.trim()).filter(Boolean));
    await captura(pagina, '01_rfq', '49-ficha-cliente-prospecto', { usuario: 'admin' });
    const activar = dlg.getByRole('button', { name: /^Activar$/ });
    let clickeado = false;
    if (await activar.count()) { await activar.click(); await pagina.waitForTimeout(1800); clickeado = true; }
    const despues = (await dlg.innerText().catch(() => 'drawer cerrado')).slice(0, 1600);
    await captura(pagina, '01_rfq', '50-cliente-tras-activar', { usuario: 'admin' });
    return { texto, botones, clickeado, despues };
  }, false);

  await paso('verificar-relacion-final', async () => {
    await pagina.goto(`/rfq?rfq=${RFQ_ID}`, { waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Resumen' }).click();
    const datos = (await pagina.getByTestId('rfq-datos-generales').innerText()).slice(0, 1500);
    const accion = (await pagina.getByTestId('rfq-proxima-accion').innerText()).slice(0, 800);
    await captura(pagina, '01_rfq', '51-relacion-final-conservada', { usuario: 'admin' });
    return { datos, accion };
  }, false);
} catch (e) {
  registrar('admin', '01_rfq', 'etapa1e_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('01_rfq', 'resultado-etapa1e', `# Resultado etapa 1e\n\n\`\`\`json\n${JSON.stringify({ resultados, hallazgos, ESTADO }, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify({ resultados, hallazgos }, null, 2).slice(0, 10000));
}
