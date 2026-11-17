import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota, guardarDescarga } from './driver.mjs';
import { writeFileSync, readFileSync } from 'node:fs';

const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const RFQ_ID = 'cc86f00f-fb5e-413c-a7f5-e8b788c86f7a';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
const resultados = [];
const hallazgos = [];

async function paso(etapa, nombre, fn, critico = true) {
  try {
    const r = await fn();
    resultados.push({ etapa, paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('admin', etapa, nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ etapa, paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', etapa, nombre, 'error', { mensaje: msg });
    hallazgos.push({ severidad: 'media', etapa, paso: nombre, mensaje: msg });
    await captura(pagina, etapa, `error-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}

try {
  await paso('00_sesion', 'login', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
  });

  await paso('02_oportunidad', 'verificar-pipeline-redirige', async () => {
    await pagina.goto('/pipeline', { waitUntil: 'networkidle' });
    const url = pagina.url();
    await captura(pagina, '02_oportunidad', 'pipeline-redirige-a-rfq', { usuario: 'admin' });
    return { url, nota: '/pipeline redirige a /rfq; no hay pantalla de oportunidad ni avance de etapas' };
  }, false);

  await paso('04_propuesta_versiones', 'crear-propuesta', async () => {
    await pagina.goto(`/rfq?rfq=${RFQ_ID}`, { waitUntil: 'networkidle' });
    const ficha = pagina.getByTestId('ficha-rfq');
    await ficha.getByRole('tab', { name: 'Propuestas' }).click();
    await pagina.getByRole('button', { name: 'Crear propuesta' }).click();
    const prop = pagina.getByTestId('ficha-propuesta');
    await prop.waitFor();
    const encabezado = (await pagina.locator('h1').first().innerText()).trim();
    const match = encabezado.match(/CNC-\d{4}_\d{2}(?:-[A-Z])?/);
    const folio = match ? match[0] : encabezado;
    ESTADO.folioCnc = folio.replace(/-[A-Z]$/, '');
    ESTADO.propuestaUrl = pagina.url();
    ESTADO.propuestaId = new URL(pagina.url()).searchParams.get('propuesta');
    await captura(pagina, '04_propuesta_versiones', '01-propuesta-rev-A-creada', { usuario: 'admin' });
    return { encabezado, folio: ESTADO.folioCnc, url: pagina.url() };
  });

  await paso('04_propuesta_versiones', 'precios-items', async () => {
    await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ítems' }).click();
    const precios = { IT01: '1850', IT02: '980' };
    for (const [codigo, precio] of Object.entries(precios)) {
      await pagina.getByLabel(`Precio ${codigo}`).fill(precio);
      await pagina.getByRole('row', { name: new RegExp(codigo) }).getByRole('button', { name: 'Guardar' }).click();
      await pagina.waitForTimeout(400);
    }
    const tabla = (await pagina.getByTestId('ficha-propuesta').innerText()).slice(0, 1800);
    await captura(pagina, '04_propuesta_versiones', '02-items-precios', { usuario: 'admin' });
    return { precios, tabla };
  });

  await paso('03_costeo', 'ruteo-y-costeo', async () => {
    await pagina.getByTestId('ficha-propuesta').getByRole('tab', { name: 'Ruteo/Costeo' }).click();
    const datos = {};
    for (const codigo of ['IT01', 'IT02']) {
      await pagina.getByLabel(`Setup horas ${codigo} fila 1`).fill(codigo === 'IT01' ? '0.75' : '0.5');
      await pagina.getByLabel(`Run horas ${codigo} fila 1`).fill(codigo === 'IT01' ? '2.5' : '1.5');
      const grupo = await pagina.getByLabel(`Grupo de equipo ${codigo} fila 1`).inputValue();
      const origen = await pagina.getByTestId(`origen-tarifa-${codigo}-1`).innerText();
      datos[codigo] = { grupo, origen };
      await captura(pagina, '03_costeo', `ruteo-${codigo}-antes-de-guardar`, { usuario: 'admin' });
    }
    await pagina.getByRole('button', { name: 'Guardar ruteo' }).nth(0).click();
    await pagina.waitForTimeout(600);
    await pagina.getByRole('button', { name: 'Guardar ruteo' }).nth(1).click();
    await pagina.waitForTimeout(600);
    const botonCostear = pagina.getByRole('button', { name: 'Costear ruteo' });
    const habilitado = await botonCostear.isEnabled();
    if (habilitado) await botonCostear.click();
    await pagina.waitForTimeout(900);
    const mostrar = pagina.getByRole('button', { name: 'Mostrar Costeo interno' });
    if (await mostrar.count()) await mostrar.click();
    await pagina.getByLabel('Costo Material').fill('$1,250.00');
    await pagina.getByLabel('Detalle de Material').fill('Lámina acero carbón calibre 14 y MDF 12 mm');
    await pagina.getByLabel('Costo Otros').fill('$320.00');
    await pagina.getByLabel('Detalle de Otros').fill('Embalaje y consumibles');
    await captura(pagina, '03_costeo', 'costeo-interno-capturado', { usuario: 'admin' });
    await pagina.getByRole('button', { name: 'Guardar costos' }).click();
    await pagina.waitForTimeout(900);
    const fabricacion = await pagina.getByTestId('costeo-fabricacion').innerText().catch(() => 'sin testid');
    const importes = await pagina.getByTestId('resumen-importes-propuesta').innerText().catch(() => 'sin testid');
    await captura(pagina, '03_costeo', 'costeo-y-fabricacion-final', { usuario: 'admin' });
    return { datos, habilitado, fabricacion: fabricacion.slice(0, 1800), importes: importes.slice(0, 900) };
  });

  await paso('04_propuesta_versiones', 'archivos-y-validar', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.getByRole('tab', { name: 'Archivos' }).click();
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
    const input = pagina.locator('input[type="file"]').first();
    await input.setInputFiles({ name: 'SOPORTE-SM-2026-02-revA.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
    const botonSubir = pagina.getByRole('button', { name: /Subir archivo/ });
    await botonSubir.last().click();
    await pagina.waitForTimeout(1500);
    await captura(pagina, '04_propuesta_versiones', '03-archivo-propuesta-A', { usuario: 'admin' });
    const faltantes = await pagina.getByTestId('faltantes-validacion').innerText().catch(() => 'sin faltantes');
    await ficha.getByRole('button', { name: 'Validar', exact: true }).first().click();
    const dlg = pagina.getByTestId('dialogo-seguimiento-propuesta');
    await dlg.waitFor({ timeout: 10000 });
    await captura(pagina, '04_propuesta_versiones', '04-dialogo-validar', { usuario: 'admin' });
    await dlg.getByRole('button', { name: 'Registrar y validar' }).click();
    await pagina.waitForTimeout(1500);
    await captura(pagina, '04_propuesta_versiones', '05-rev-A-validada', { usuario: 'admin' });
    return { faltantes: faltantes.slice(0, 700) };
  });

  await paso('04_propuesta_versiones', 'pdf-y-envio-A', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.getByTestId('boton-pdf-propuesta').click();
    await pagina.waitForTimeout(1200);
    await ficha.getByRole('tab', { name: 'PDFs' }).click();
    const panel = (await pagina.getByTestId('panel-pdfs-propuesta').innerText()).slice(0, 900);
    await captura(pagina, '04_propuesta_versiones', '06-pdf-rev-A-generado', { usuario: 'admin' });
    const descargaBtn = pagina.getByRole('button', { name: /Descargar PDF/ }).first();
    if (await descargaBtn.count()) {
      const [descarga] = await Promise.all([pagina.waitForEvent('download'), descargaBtn.click()]);
      await guardarDescarga(descarga, '08_documentos', 'propuesta-rev-A');
    }
    await ficha.getByRole('button', { name: 'Enviar', exact: true }).first().click();
    const form = pagina.locator('form').filter({ has: pagina.getByLabel('Destino de envío') }).first();
    await pagina.getByLabel('Destino de envío').fill('compras@clienteqa.mx');
    await captura(pagina, '04_propuesta_versiones', '07-formulario-envio-A', { usuario: 'admin' });
    await pagina.getByRole('button', { name: 'Confirmar envío' }).click();
    await pagina.waitForTimeout(1500);
    await captura(pagina, '04_propuesta_versiones', '08-rev-A-enviada', { usuario: 'admin' });
    return { panel, estado: (await ficha.innerText()).slice(0, 500) };
  });
} catch (e) {
  registrar('admin', '04_propuesta_versiones', 'etapa2a_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('03_costeo', 'resultado-costeo', `# Resultado costeo y propuesta A\n\n\`\`\`json\n${JSON.stringify({ resultados, hallazgos, ESTADO }, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify({ resultados, hallazgos }, null, 2).slice(0, 12000));
}
