import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota, guardarDescarga } from './driver.mjs';
import { readFileSync } from 'node:fs';
const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
const resultados = [];

async function paso(nombre, fn, critico = true) {
  try {
    const r = await fn();
    resultados.push({ paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('admin', '04_propuesta_versiones', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1800);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('admin', '04_propuesta_versiones', nombre, 'error', { mensaje: msg });
    await captura(pagina, '04_propuesta_versiones', `error2e-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}

try {
  await paso('archivos', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.getByRole('tab', { name: 'Archivos' }).click();
    const antes = (await ficha.innerText()).slice(0, 900);
    if (antes.includes('SOPORTE-SM-2026-02-revA.pdf') === false) {
      const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
      await pagina.locator('input[type="file"]').first().setInputFiles({ name: 'SOPORTE-SM-2026-02-revA.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
      await pagina.getByRole('button', { name: /Subir archivo/ }).last().click();
      await pagina.waitForTimeout(1800);
    }
    const faltantes = (await pagina.getByTestId('faltantes-validacion').innerText().catch(() => 'sin faltantes')).slice(0, 700);
    await captura(pagina, '04_propuesta_versiones', '09-archivos-rev-A', { usuario: 'admin' });
    return { antes: antes.slice(0, 300), faltantes };
  });

  await paso('validar', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    const boton = ficha.getByRole('button', { name: 'Validar', exact: true }).first();
    const habilitado = await boton.isEnabled();
    if (!habilitado) {
      const falt = (await pagina.getByTestId('faltantes-validacion').innerText()).slice(0, 900);
      throw new Error(`Validar deshabilitado. Faltantes: ${falt}`);
    }
    await boton.click();
    const dlg = pagina.getByTestId('dialogo-seguimiento-propuesta');
    await dlg.waitFor();
    await captura(pagina, '04_propuesta_versiones', '10-dialogo-validar-rev-A', { usuario: 'admin' });
    await dlg.getByRole('button', { name: 'Registrar y validar' }).click();
    await pagina.waitForTimeout(1600);
    const cabecera = (await ficha.innerText()).slice(0, 500);
    await captura(pagina, '04_propuesta_versiones', '11-rev-A-validada', { usuario: 'admin' });
    return { habilitado, cabecera };
  });

  await paso('pdf', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.getByTestId('boton-pdf-propuesta').click();
    await pagina.waitForTimeout(1400);
    await ficha.getByRole('tab', { name: 'PDFs' }).click();
    const panel = (await pagina.getByTestId('panel-pdfs-propuesta').innerText()).slice(0, 1000);
    await captura(pagina, '04_propuesta_versiones', '12-pdf-rev-A', { usuario: 'admin' });
    const desc = pagina.getByRole('button', { name: /Descargar PDF/ }).first();
    if (await desc.count()) {
      const [d] = await Promise.all([pagina.waitForEvent('download'), desc.click()]);
      await guardarDescarga(d, '08_documentos', 'propuesta-rev-A');
    }
    return { panel };
  });

  await paso('enviar', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.getByRole('button', { name: 'Enviar', exact: true }).first().click();
    await pagina.getByLabel('Destino de envío').fill('compras@clienteqa.mx');
    await captura(pagina, '04_propuesta_versiones', '13-envio-rev-A', { usuario: 'admin' });
    await pagina.getByRole('button', { name: 'Confirmar envío' }).click();
    await pagina.waitForTimeout(1800);
    const cabecera = (await ficha.innerText()).slice(0, 600);
    await captura(pagina, '04_propuesta_versiones', '14-rev-A-enviada', { usuario: 'admin' });
    return { cabecera };
  });
} catch (e) {
  registrar('admin', '04_propuesta_versiones', 'etapa2e_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('04_propuesta_versiones', 'resultado-etapa2e', `# Resultado etapa2e\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 9000));
}
