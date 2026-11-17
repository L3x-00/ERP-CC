import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const RFQ_ID = 'cc86f00f-fb5e-413c-a7f5-e8b788c86f7a';
const SUFIJO = 'QA1711';
const DESCRIPCION = `Soporte metálico SM-2026-02 y panel decorativo MDF-12. Corte laser, doblado CNC y router CNC segun planos adjuntos. Caso E2E ${SUFIJO}.`;
ESTADO.rfqId = RFQ_ID;
ESTADO.rfqFolio = 'RFQ-1126_08';

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
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '01_rfq', nombre, 'error', { mensaje: msg });
    hallazgos.push({ severidad: 'media', paso: nombre, mensaje: msg });
    await captura(pagina, '01_rfq', `error1b-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}

try {
  await paso('login', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
  });

  await paso('abrir-rfq', async () => {
    await pagina.goto(`/rfq?rfq=${RFQ_ID}&continuar=1`, { waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-rfq').waitFor();
    ESTADO.rfqUrl = pagina.url();
    await captura(pagina, '01_rfq', '15-rfq-reanudado', { usuario: 'admin' });
    return { url: pagina.url() };
  });

  await paso('items', async () => {
    const ficha = pagina.getByTestId('ficha-rfq');
    await ficha.getByRole('tab', { name: 'Ítems' }).click();
    const agregar = async (cfg) => {
      await pagina.getByRole('button', { name: 'Agregar ítem' }).click();
      const dlg = pagina.getByRole('dialog', { name: 'Nuevo ítem' });
      await dlg.waitFor();
      await dlg.getByLabel('Descripción', { exact: true }).fill(cfg.desc);
      await dlg.getByLabel('Cantidad').fill(cfg.cant);
      await dlg.getByLabel('Material').selectOption({ label: cfg.material });
      const esp = await dlg.getByLabel('Espesor').locator('option').evaluateAll((ns) =>
        ns.map((n) => ({ v: n.value, t: n.textContent.trim(), d: n.disabled })),
      );
      const elegido = esp.find((o) => o.v && o.t.includes(cfg.espesorPista)) ?? esp.find((o) => o.v);
      if (!elegido) throw new Error(`Sin espesor para ${cfg.material}`);
      await dlg.getByLabel('Espesor').selectOption({ value: elegido.v });
      for (const codigo of cfg.procesos) await dlg.locator(`#item-proceso-${codigo}`).check();
      await dlg.getByLabel('Notas (opcional)').fill(cfg.notas);
      await captura(pagina, '01_rfq', `16-item-${cfg.codigo}`, { usuario: 'admin' });
      await dlg.getByRole('button', { name: 'Guardar ítem' }).click();
      await dlg.waitFor({ state: 'hidden' });
      return { ...cfg, espesor: elegido.t };
    };
    const items = [];
    items.push(await agregar({ codigo: 'IT01', desc: 'Soporte metálico SM-2026-02', cant: '50', material: 'Acero al carbón calibre 14', espesorPista: '14', procesos: ['CORTE_LASER', 'DOB_CNC'], notas: 'Corte láser según SOPORTE-SM-2026-02.dxf y doblado CNC 90 grados.' }));
    items.push(await agregar({ codigo: 'IT02', desc: 'Panel decorativo MDF-12', cant: '20', material: 'MDF 12 mm', espesorPista: '12', procesos: ['CNC_ROUTER'], notas: 'Router CNC, acabado pulido, según PANEL-MDF-2026-02.pdf.' }));
    const tabla = await pagina.getByTestId('tabla-items-rfq').innerText();
    await captura(pagina, '01_rfq', '17-items-guardados', { usuario: 'admin' });
    return { items, tabla: tabla.slice(0, 1200) };
  });

  await paso('archivos', async () => {
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Archivos' }).click();
    const dxf = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nCORTE\n10\n0\n20\n0\n11\n120\n21\n80\n0\nENDSEC\n0\nEOF\n';
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
    await pagina.getByLabel('Tipo').selectOption({ label: 'CAD' }).catch(() => pagina.getByLabel('Tipo').selectOption({ label: 'DIBUJO' }));
    await pagina.getByLabel('Archivo').setInputFiles({ name: 'SOPORTE-SM-2026-02.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf) });
    await pagina.getByRole('button', { name: 'Subir archivo' }).click();
    await pagina.getByTestId('panel-archivos-rfq').getByText('SOPORTE-SM-2026-02.dxf').first().waitFor({ timeout: 20000 });
    await pagina.getByLabel('Tipo').selectOption({ label: 'DIBUJO' });
    await pagina.getByLabel('Archivo').setInputFiles({ name: 'SOPORTE-SM-2026-02.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
    await pagina.getByRole('button', { name: 'Subir archivo' }).click();
    await pagina.getByTestId('panel-archivos-rfq').getByText('SOPORTE-SM-2026-02.pdf').first().waitFor({ timeout: 20000 });
    await captura(pagina, '01_rfq', '18-archivos-tecnicos', { usuario: 'admin' });
    return { archivos: ['SOPORTE-SM-2026-02.dxf', 'SOPORTE-SM-2026-02.pdf'] };
  });

  await paso('finalizar-captura', async () => {
    await pagina.getByRole('button', { name: 'Finalizar captura' }).click();
    const dlg = pagina.getByTestId('dialogo-finalizar-captura');
    await dlg.waitFor();
    const resumen = (await dlg.getByRole('region', { name: 'Resumen del RFQ' }).innerText()).slice(0, 1200);
    await dlg.getByLabel('Acción a seguir', { exact: true }).selectOption({ index: 1 });
    await dlg.getByLabel('Fecha de la acción').fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
    await captura(pagina, '01_rfq', '19-finalizar-captura', { usuario: 'admin' });
    await dlg.getByRole('button', { name: 'Guardar y finalizar' }).click();
    await dlg.waitFor({ state: 'hidden' });
    return { resumen };
  });

  await paso('validacion-inicial', async () => {
    await pagina.getByRole('button', { name: 'Marcar listo' }).click();
    const txt = await pagina.getByTestId('validacion-listo').innerText();
    const estadoInicial = (await pagina.getByTestId('ficha-rfq').innerText()).includes('Listo para propuesta') ? 'READY_FOR_PROPOSAL' : 'INCOMPLETE';
    await captura(pagina, '01_rfq', '20-validacion-inicial', { usuario: 'admin' });
    const confirmar = pagina.getByRole('button', { name: 'Confirmar y marcar listo' });
    if (await confirmar.count() && await confirmar.isEnabled()) await confirmar.click();
    await pagina.waitForTimeout(1000);
    const estadoFinal = (await pagina.getByTestId('ficha-rfq').innerText()).includes('Listo para propuesta') ? 'READY_FOR_PROPOSAL' : 'INCOMPLETE';
    await captura(pagina, '01_rfq', '21-validacion-confirmada', { usuario: 'admin' });
    return { txt, estadoInicial, estadoFinal };
  });

  await paso('editar-y-revalidar', async () => {
    const ficha = pagina.getByTestId('ficha-rfq');
    await ficha.getByRole('tab', { name: 'Resumen' }).click();
    const botonEditar = pagina.getByRole('button', { name: 'Editar resumen' });
    const editable = await botonEditar.count();
    if (!editable) return { editable: false, nota: 'READY_FOR_PROPOSAL no ofrece Editar resumen' };
    await botonEditar.click();
    const form = pagina.getByTestId('resumen-rfq');
    await form.getByLabel('Descripción general').fill(`${DESCRIPCION} Revisado tras primera validación: se confirma calibre 14 y doblado CNC.`);
    await captura(pagina, '01_rfq', '22-edicion-tras-validar', { usuario: 'admin' });
    await pagina.getByRole('button', { name: 'Guardar datos' }).click();
    await pagina.getByText('Datos guardados.').first().waitFor({ timeout: 15000 });
    const botonMarcar = pagina.getByRole('button', { name: 'Marcar listo' });
    const revalida = (await botonMarcar.count()) > 0;
    if (revalida) {
      await botonMarcar.click();
      const txt = await pagina.getByTestId('validacion-listo').innerText();
      const conf = pagina.getByRole('button', { name: 'Confirmar y marcar listo' });
      if (await conf.count() && await conf.isEnabled()) await conf.click();
      await captura(pagina, '01_rfq', '23-revalidacion', { usuario: 'admin' });
      return { editable: true, revalida, txt };
    }
    await captura(pagina, '01_rfq', '23-estado-tras-edicion', { usuario: 'admin' });
    return { editable: true, revalida: false, nota: 'Tras READY_FOR_PROPOSAL no hay acción de re-validación en UI; el guardado dejó versión CABECERA' };
  });

  await paso('activar-cliente', async () => {
    await pagina.goto('/clientes', { waitUntil: 'networkidle' });
    const boton = pagina.getByRole('button', { name: new RegExp(SUFIJO) }).first();
    await boton.waitFor({ timeout: 15000 });
    await boton.click();
    const dlg = pagina.getByRole('dialog', { name: 'Ficha del cliente' });
    await dlg.waitFor();
    const antes = (await dlg.innerText()).slice(0, 1000);
    await captura(pagina, '01_rfq', '24-cliente-prospecto', { usuario: 'admin' });
    const activar = dlg.getByRole('button', { name: 'Activar' });
    const teniaActivar = (await activar.count()) > 0;
    if (teniaActivar) {
      await activar.click();
      await pagina.waitForTimeout(1200);
    }
    const despues = (await dlg.innerText().catch(() => 'drawer cerrado')).slice(0, 1000);
    await captura(pagina, '01_rfq', '25-cliente-activado', { usuario: 'admin' });
    return { teniaActivar, antes, despues };
  }, false);

  await paso('verificar-relacion', async () => {
    await pagina.goto(ESTADO.rfqUrl, { waitUntil: 'networkidle' });
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Resumen' }).click();
    const txt = (await pagina.getByTestId('rfq-datos-generales').innerText()).slice(0, 1400);
    await captura(pagina, '01_rfq', '26-relacion-cliente-conservada', { usuario: 'admin' });
    return { txt };
  }, false);
} catch (e) {
  registrar('admin', '01_rfq', 'etapa1b_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('01_rfq', 'resultado-etapa1b', `# Resultado etapa 1b (reanudación)\n\n\`\`\`json\n${JSON.stringify({ resultados, hallazgos, ESTADO }, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify({ resultados, hallazgos }, null, 2).slice(0, 8000));
}
