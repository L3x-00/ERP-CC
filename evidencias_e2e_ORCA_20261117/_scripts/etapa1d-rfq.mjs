import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
import { writeFileSync, readFileSync } from 'node:fs';

const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const RFQ_ID = 'cc86f00f-fb5e-413c-a7f5-e8b788c86f7a';
const SUFIJO = 'QA1711';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(10000);
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
    await captura(pagina, '01_rfq', `error1d-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}

async function estadoGeneral() {
  await pagina.goto(`/rfq?rfq=${RFQ_ID}`, { waitUntil: 'networkidle' });
  const ficha = pagina.getByTestId('ficha-rfq');
  await ficha.getByRole('tab', { name: 'Resumen' }).click();
  return { datos: await pagina.getByTestId('rfq-datos-generales').innerText(), ficha: await ficha.innerText() };
}

try {
  await paso('login', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
  });

  await paso('validacion-inicial', async () => {
    await pagina.goto(`/rfq?rfq=${RFQ_ID}`, { waitUntil: 'networkidle' });
    const ficha = pagina.getByTestId('ficha-rfq');
    await ficha.getByRole('tab', { name: 'Resumen' }).click();
    await pagina.getByRole('button', { name: 'Marcar listo' }).click();
    const txt = await pagina.getByTestId('validacion-listo').innerText();
    await captura(pagina, '01_rfq', '37-validacion-inicial-faltantes', { usuario: 'admin' });
    const cancelar = pagina.getByRole('dialog').getByRole('button', { name: 'Cancelar' });
    if (await cancelar.count()) await cancelar.click();
    return { txt };
  });

  await paso('completar-solicitud-y-editar', async () => {
    await pagina.getByRole('button', { name: 'Editar resumen' }).click();
    const form = pagina.getByTestId('resumen-rfq');
    const fechaSolicitud = form.getByLabel('Fecha de solicitud');
    const valorFecha = await fechaSolicitud.inputValue().catch(() => '');
    if (!valorFecha) await fechaSolicitud.fill(new Date().toISOString().slice(0, 10));
    await form.getByLabel('Descripción general').fill(`Soporte metálico SM-2026-02 y panel MDF-12 para ${SUFIJO}. Corte láser, doblado CNC y router CNC. Editado tras primera validación.`);
    const contacto = form.getByLabel('Contacto del cliente');
    const opciones = await contacto.locator('option').evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
    if (opciones.some((o) => o.v) && !(await contacto.inputValue())) {
      await contacto.selectOption(opciones.find((o) => o.v).v);
    }
    const campos = [];
    for (const etiqueta of ['Acción', 'Fecha', 'Responsable de la acción']) {
      const loc = form.getByLabel(etiqueta, { exact: true }).first();
      if (await loc.count()) {
        const v = await loc.inputValue().catch(() => '');
        if (!v && etiqueta === 'Fecha') await loc.fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
        campos.push({ etiqueta, valor: v });
      }
    }
    await captura(pagina, '01_rfq', '38-edicion-solicitud', { usuario: 'admin' });
    await pagina.getByRole('button', { name: 'Guardar datos' }).click();
    await pagina.getByText('Datos guardados.').first().waitFor({ timeout: 15000 });
    return { valorFecha, opcionesContacto: opciones.length, campos };
  });

  await paso('revalidar-y-confirmar', async () => {
    await pagina.getByRole('button', { name: 'Marcar listo' }).click();
    const txt = await pagina.getByTestId('validacion-listo').innerText();
    await captura(pagina, '01_rfq', '39-revalidacion', { usuario: 'admin' });
    const conf = pagina.getByRole('button', { name: 'Confirmar y marcar listo' });
    let confirmado = false;
    if (await conf.count() && await conf.isEnabled()) { await conf.click(); confirmado = true; }
    await pagina.waitForTimeout(1500);
    const estado = (await pagina.getByTestId('ficha-rfq').innerText()).includes('Listo para propuesta') ? 'READY_FOR_PROPOSAL' : 'INCOMPLETE';
    await captura(pagina, '01_rfq', '40-estado-tras-revalidar', { usuario: 'admin' });
    ESTADO.rfqEstado = estado;
    return { txt, confirmado, estado };
  });

  await paso('activar-cliente', async () => {
    await pagina.goto('/clientes', { waitUntil: 'networkidle' });
    const boton = pagina.getByRole('button', { name: new RegExp(SUFIJO) }).first();
    await boton.waitFor({ timeout: 15000 });
    await boton.click();
    const dlg = pagina.getByRole('dialog', { name: 'Ficha del cliente' });
    await dlg.waitFor();
    const antes = (await dlg.innerText()).slice(0, 1000);
    await captura(pagina, '01_rfq', '41-cliente-prospecto', { usuario: 'admin' });
    const activar = dlg.getByRole('button', { name: 'Activar' });
    const habia = (await activar.count()) > 0;
    if (habia) { await activar.click(); await pagina.waitForTimeout(1500); }
    const despues = (await dlg.innerText().catch(() => 'drawer cerrado')).slice(0, 1000);
    await captura(pagina, '01_rfq', '42-cliente-activado', { usuario: 'admin' });
    return { habia, antes, despues };
  }, false);

  await paso('verificar-relacion', async () => {
    const r = await estadoGeneral();
    await captura(pagina, '01_rfq', '43-relacion-y-estado-final', { usuario: 'admin' });
    return r;
  }, false);
} catch (e) {
  registrar('admin', '01_rfq', 'etapa1d_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('01_rfq', 'resultado-etapa1d', `# Resultado etapa 1d\n\n\`\`\`json\n${JSON.stringify({ resultados, hallazgos, ESTADO }, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify({ resultados, hallazgos }, null, 2).slice(0, 9000));
}
