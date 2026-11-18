import {
  abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota,
} from './driver.mjs';
import { writeFileSync } from 'node:fs';

const CORREO = process.env.E2E_ADMIN_EMAIL ?? '';
const CLAVE = process.env.E2E_ADMIN_PASSWORD ?? '';
const SUFIJO = 'RV1717';
const RAZON = `Reverificacion Fronteriza ${SUFIJO} S.A. de C.V.`;
const COMERCIAL = `Taller RV ${SUFIJO}`;
const RFC = 'MFRV171117AB1';
const CONTACTO = 'Reyna Valdez';
const CORREO_CLIENTE = `reyna.valdez${SUFIJO.toLowerCase()}@clienteqa.mx`;
const TELEFONO = '664 555 0142';
const DESCRIPCION = `Soporte metálico SM-2026-02 y panel decorativo MDF-12. Corte laser, doblado CNC y router CNC segun planos adjuntos. Caso E2E ${SUFIJO}.`;
const ESTADO = { sufijo: SUFIJO, razon: RAZON };

const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(8000);
const hallazgos = [];
const resultados = [];

async function paso(nombre, fn, critico = true) {
  try {
    const r = await fn();
    resultados.push({ paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('admin', '01_rfq', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1500);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '01_rfq', nombre, 'error', { mensaje: msg });
    hallazgos.push({ severidad: 'media', paso: nombre, mensaje: msg });
    await captura(pagina, '01_rfq', `error-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`Paso crítico fallido: ${nombre}: ${msg}`);
    return null;
  }
}

async function opciones(selector) {
  return selector.locator('option').evaluateAll((ns) =>
    ns.map((n) => ({ valor: n.value, texto: n.textContent.trim(), deshabilitado: n.disabled })),
  );
}

try {
  await paso('login', async () => {
    await iniciarSesionAdmin(pagina, CORREO, CLAVE);
    const masTarde = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await masTarde.count()) await masTarde.click();
    return { url: pagina.url() };
  });

  await paso('abrir-nuevo-rfq', async () => {
    await pagina.goto('/rfq', { waitUntil: 'networkidle' });
    await pagina.getByRole('button', { name: 'Nuevo RFQ' }).click();
    await pagina.getByRole('dialog').waitFor();
    await captura(pagina, '01_rfq', '01-modal-nuevo-rfq', { usuario: 'admin' });
    return { dialog: await pagina.getByRole('dialog').getAttribute('aria-label') };
  });

  await paso('alta-rapida-cliente', async () => {
    await pagina.getByRole('button', { name: 'Nuevo cliente' }).click();
    const dlg = pagina.getByRole('dialog', { name: 'Nuevo cliente' });
    await dlg.waitFor();
    await dlg.getByLabel('Razón social').fill(RAZON);
    await dlg.getByLabel('Nombre comercial (opcional)').fill(COMERCIAL);
    await dlg.getByLabel('RFC (opcional)').fill(RFC);
    await dlg.getByLabel('Contacto (opcional)').fill(CONTACTO);
    await dlg.getByLabel('Correo (opcional)').fill(CORREO_CLIENTE);
    await dlg.getByLabel('Teléfono (opcional)').fill(TELEFONO);
    await captura(pagina, '01_rfq', '02-alta-rapida-cliente-prospecto', { usuario: 'admin' });
    await dlg.getByRole('button', { name: 'Crear y usar en la RFQ' }).click();
    await dlg.waitFor({ state: 'hidden' });
    return { razon: RAZON, rfc: RFC, estado: 'prospecto' };
  });

  await paso('datos-generales-rfq', async () => {
    const dlg = pagina.getByRole('dialog');
    await dlg.getByLabel('Nombre del contacto').fill(CONTACTO);
    await dlg.getByLabel('Teléfono', { exact: true }).fill(TELEFONO);
    const empresa = dlg.getByLabel('Empresa', { exact: true });
    if (!(await empresa.inputValue())) await empresa.fill(COMERCIAL);
    const selCliente = dlg.getByLabel('Cliente (opcional)', { exact: true });
    const valorCliente = await selCliente.inputValue().catch(() => '');
    const monedas = await opciones(dlg.getByLabel('Moneda'));
    const canales = await opciones(dlg.getByLabel('Canal', { exact: true }));
    await dlg.getByLabel('Moneda').selectOption('MXN').catch(() => {});
    await dlg.getByLabel('Prioridad').selectOption('alta').catch(() => {});
    await dlg.getByLabel('Condiciones de pago (opcional)').selectOption('contado').catch(() => {});
    await dlg.getByLabel('Canal', { exact: true }).selectOption('CORREO').catch(() => {});
    const dia = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10);
    await dlg.getByLabel('Fecha requerida por el cliente (opcional)').fill(dia);
    await dlg.getByLabel(/Plazo comercial/).fill('Fabricacion 5-7 dias habiles');
    await dlg.getByLabel('Descripción', { exact: true }).fill(DESCRIPCION);
    await captura(pagina, '01_rfq', '03-datos-generales-rfq', { usuario: 'admin' });
    const seguir = dlg.getByRole('button', { name: 'Continuar con ítems' });
    if (await seguir.isDisabled()) throw new Error('Continuar con ítems sigue deshabilitado');
    await seguir.click();
    return { valorCliente, monedas, canales, fechaRequerida: dia };
  });

  await paso('catalogo-y-items', async () => {
    await pagina.getByTestId('alta-rfq-items').waitFor();
    const catalogo = {};
    const agregar = async (desc, cant, materialLabel, espesorLabel, procTexto, notas) => {
      await pagina.getByRole('button', { name: 'Agregar ítem' }).click();
      const dlg = pagina.getByRole('dialog', { name: 'Nuevo ítem' });
      await dlg.waitFor();
      catalogo.materiales = await opciones(dlg.getByLabel('Material'));
      catalogo.procesos = await dlg.locator('input[type="checkbox"]').evaluateAll((ns) =>
        ns.map((n) => ({ id: n.id, label: n.getAttribute('aria-label') || n.parentElement?.textContent?.trim() })),
      );
      await dlg.getByLabel('Descripción', { exact: true }).fill(desc);
      await dlg.getByLabel('Cantidad').fill(cant);
      const mat = catalogo.materiales.find((m) => m.texto.includes(materialLabel));
      if (!mat) throw new Error(`Material ${materialLabel} no existe en catálogo`);
      await dlg.getByLabel('Material').selectOption({ label: mat.texto });
      const esp = await opciones(dlg.getByLabel('Espesor'));
      const espElegido = esp.find((e) => e.texto.includes(espesorLabel));
      if (!espElegido) throw new Error(`Espesor ${espesorLabel} no existe para ${materialLabel}`);
      await dlg.getByLabel('Espesor').selectOption({ label: espElegido.texto });
      const casilla = dlg.getByLabel(new RegExp(procTexto, 'i')).first();
      await casilla.check();
      await dlg.getByLabel('Notas (opcional)').fill(notas);
      await captura(pagina, '01_rfq', `item-${SUFIJO}-${cant}`, { usuario: 'admin' });
      await dlg.getByRole('button', { name: 'Guardar ítem' }).click();
      await dlg.waitFor({ state: 'hidden' });
      return { desc, cant, material: mat.texto, espesor: espElegido.texto };
    };

    const items = [];
    items.push(await agregar('Soporte metálico SM-2026-02', '50', 'CRS-14', '14', 'Corte', 'Corte laser segun DXF SOPORTE-SM-2026-02.dxf'));
    items.push(await agregar('Panel decorativo MDF-12', '20', 'MDF-12', '12', 'Router', 'Router CNC, acabado pulido; archivo PANEL-MDF-2026-02.dxf'));
    escribirNota('01_rfq', 'catalogo-y-items', `# Catálogo leído en producción\n\n\`\`\`json\n${JSON.stringify(catalogo, null, 2)}\n\`\`\`\n\nÍtems capturados:\n\n\`\`\`json\n${JSON.stringify(items, null, 2)}\n\`\`\`\n`);
    await captura(pagina, '01_rfq', '04-items-capturados', { usuario: 'admin' });
    return { items, catalogo };
  });

  await paso('archivos-tecnicos', async () => {
    await pagina.getByRole('button', { name: 'Continuar con archivos' }).click();
    await pagina.getByTestId('alta-rfq-archivos').waitFor();
    const dxf = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nCORTE\n10\n0\n20\n0\n11\n120\n21\n80\n0\nENDSEC\n0\nEOF\n';
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
    await pagina.getByLabel('Tipo').selectOption({ label: 'CAD' }).catch(async () => {
      await pagina.getByLabel('Tipo').selectOption('DIBUJO');
    });
    await pagina.getByLabel('Archivo').setInputFiles({ name: 'SOPORTE-SM-2026-02.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf) });
    await pagina.getByRole('button', { name: 'Subir archivo' }).click();
    await pagina.getByTestId('panel-archivos-rfq').getByText('SOPORTE-SM-2026-02.dxf').first().waitFor({ timeout: 20000 });
    await pagina.getByLabel('Tipo').selectOption('DIBUJO').catch(() => {});
    await pagina.getByLabel('Archivo').setInputFiles({ name: 'SOPORTE-SM-2026-02.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
    await pagina.getByRole('button', { name: 'Subir archivo' }).click();
    await pagina.getByTestId('panel-archivos-rfq').getByText('SOPORTE-SM-2026-02.pdf').first().waitFor({ timeout: 20000 });
    await captura(pagina, '01_rfq', '05-archivos-tecnicos', { usuario: 'admin' });
    return { archivos: ['SOPORTE-SM-2026-02.dxf', 'SOPORTE-SM-2026-02.pdf'] };
  });

  await paso('finalizar-captura', async () => {
    await pagina.getByRole('button', { name: 'Finalizar captura' }).click();
    const dlg = pagina.getByTestId('dialogo-finalizar-captura');
    await dlg.waitFor();
    const resumen = await dlg.getByRole('region', { name: 'Resumen del RFQ' }).innerText();
    await dlg.getByLabel('Acción a seguir', { exact: true }).selectOption({ index: 1 });
    await dlg.getByLabel('Fecha de la acción').fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
    await captura(pagina, '01_rfq', '06-finalizar-captura', { usuario: 'admin' });
    await dlg.getByRole('button', { name: 'Guardar y finalizar' }).click();
    await dlg.waitFor({ state: 'hidden' });
    return { resumen: resumen.slice(0, 1200) };
  });

  await paso('localizar-y-abrir-rfq', async () => {
    await pagina.goto('/rfq', { waitUntil: 'networkidle' });
    const fila = pagina.getByRole('row', { name: new RegExp(SUFIJO) }).first();
    await fila.waitFor({ timeout: 20000 });
    const texto = (await fila.innerText()).replace(/\s+/g, ' ');
    const enlace = fila.getByRole('link', { name: /Continuar captura/ });
    await enlace.click();
    const ficha = pagina.getByTestId('ficha-rfq');
    await ficha.waitFor();
    const url = pagina.url();
    ESTADO.rfqUrl = url;
    ESTADO.rfqId = new URL(url).searchParams.get('rfq');
    await captura(pagina, '01_rfq', '07-ficha-rfq-captura-inicial', { usuario: 'admin' });
    return { texto, url };
  });

  await paso('validacion-inicial', async () => {
    await pagina.getByRole('button', { name: 'Marcar listo' }).click();
    const panel = pagina.getByTestId('validacion-listo');
    const texto = await panel.innerText();
    await captura(pagina, '01_rfq', '08-validacion-inicial', { usuario: 'admin' });
    const cancelar = pagina.getByRole('dialog').getByRole('button', { name: 'Cancelar' });
    if (await cancelar.count()) await cancelar.click();
    return { texto };
  });

  await paso('editar-resumen', async () => {
    const ficha = pagina.getByTestId('ficha-rfq');
    await ficha.getByRole('tab', { name: 'Resumen' }).click();
    await pagina.getByRole('button', { name: 'Editar resumen' }).click();
    const form = pagina.getByTestId('resumen-rfq');
    await form.getByLabel('Descripción general').fill(`${DESCRIPCION} Editado tras primera validacion: se confirma espesor 14 y acabado.`);
    await captura(pagina, '01_rfq', '09-edicion-resumen', { usuario: 'admin' });
    await pagina.getByRole('button', { name: 'Guardar datos' }).click();
    await pagina.getByText('Datos guardados.').first().waitFor({ timeout: 15000 });
    return { cambio: 'descripcion_general' };
  });

  await paso('revalidar-rfq', async () => {
    await pagina.getByRole('button', { name: 'Marcar listo' }).click();
    const panel = pagina.getByTestId('validacion-listo');
    const texto = await panel.innerText();
    await captura(pagina, '01_rfq', '10-revalidacion', { usuario: 'admin' });
    const confirmar = pagina.getByRole('button', { name: 'Confirmar y marcar listo' });
    let estado = 'sin-confirmar';
    if (await confirmar.count() && await confirmar.isEnabled()) {
      await confirmar.click();
      estado = await pagina.getByTestId('ficha-rfq').innerText().then((t) => t.includes('Listo para propuesta') ? 'READY_FOR_PROPOSAL' : 'desconocido');
    }
    await captura(pagina, '01_rfq', '11-estado-final-rfq', { usuario: 'admin' });
    return { texto, estado };
  });

  // Se omite la activación por el drawer: el cliente debe quedar prospecto
  // para verificar M-3 desde la propia ficha del RFQ.

  await paso('verificar-relacion-rfq', async () => {
    await pagina.goto(ESTADO.rfqUrl, { waitUntil: 'networkidle' });
    const ficha = pagina.getByTestId('ficha-rfq');
    await ficha.getByRole('tab', { name: 'Resumen' }).click();
    const texto = await pagina.getByTestId('rfq-datos-generales').innerText();
    await captura(pagina, '01_rfq', '14-relacion-cliente-rfq-conservada', { usuario: 'admin' });
    return { texto: texto.slice(0, 1200) };
  }, false);
} catch (e) {
  registrar('admin', '01_rfq', 'etapa1_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('01_rfq', 'resultado-etapa1', `# Resultado etapa 1 — RFQ y cliente\n\n\`\`\`json\n${JSON.stringify({ resultados, hallazgos, ESTADO }, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso-rv.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await pagina.context().close();
  await navegador.close();
  console.log('RESUMEN:', JSON.stringify({ resultados, hallazgos, ESTADO }, null, 2));
}
