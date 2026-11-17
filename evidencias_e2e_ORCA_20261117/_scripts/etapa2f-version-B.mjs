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
    await captura(pagina, '04_propuesta_versiones', `error2f-${nombre}`, { usuario: 'admin' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}

async function cabecera() {
  return (await pagina.getByTestId('ficha-propuesta').innerText()).slice(0, 700);
}

try {
  await paso('verificar-estado-A', async () => {
    await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
    const MT = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
    if (await MT.count()) await MT.click();
    await pagina.goto(ESTADO.propuestaUrl, { waitUntil: 'networkidle' });
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.waitFor();
    const texto = await cabecera();
    await captura(pagina, '04_propuesta_versiones', '15-estado-real-rev-A', { usuario: 'admin' });
    if (texto.includes('Lista para enviar') && !texto.includes('Enviada')) {
      await ficha.getByRole('button', { name: 'Enviar', exact: true }).first().click();
      await pagina.getByLabel('Destino de envío').fill('compras@clienteqa.mx');
      await pagina.getByRole('button', { name: 'Confirmar envío' }).click();
      await pagina.waitForTimeout(2000);
      await pagina.reload({ waitUntil: 'networkidle' });
    }
    return { antes: texto.slice(0, 300), despues: (await cabecera()).slice(0, 300) };
  });

  await paso('crear-version-B', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.getByRole('tab', { name: 'Resumen' }).click();
    const historial = (await pagina.getByTestId('historial-versiones-propuesta').innerText()).slice(0, 1200);
    await captura(pagina, '04_propuesta_versiones', '16-historial-versiones', { usuario: 'admin' });
    await pagina.getByTestId('boton-crear-nueva-version').click();
    const dlg = pagina.getByTestId('dialogo-nueva-version');
    await dlg.waitFor();
    await dlg.getByLabel('Motivo de la nueva versión').fill('El cliente solicita ajustar precio unitario y cantidad del panel MDF.');
    await captura(pagina, '04_propuesta_versiones', '17-dialogo-nueva-version-B', { usuario: 'admin' });
    await dlg.getByRole('button', { name: 'Crear versión' }).click();
    await pagina.waitForTimeout(1800);
    await captura(pagina, '04_propuesta_versiones', '18-rev-B-creada', { usuario: 'admin' });
    return { historial, estado: await cabecera() };
  });

  await paso('modificar-B', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    await ficha.getByRole('tab', { name: 'Ítems' }).click();
    await pagina.getByLabel('Precio IT01').fill('1725');
    await pagina.getByRole('row', { name: /IT01/ }).getByRole('button', { name: 'Guardar' }).click();
    await pagina.waitForTimeout(700);
    await pagina.getByLabel('Cantidad IT02').fill('25');
    await pagina.getByRole('row', { name: /IT02/ }).getByRole('button', { name: 'Guardar' }).click();
    await pagina.waitForTimeout(700);
    const importes = (await pagina.getByTestId('resumen-importes-propuesta').innerText().catch(() => '')).slice(0, 700);
    await captura(pagina, '04_propuesta_versiones', '19-rev-B-modificada', { usuario: 'admin' });
    return { importes };
  });

  await paso('validar-pdf-enviar-B', async () => {
    const ficha = pagina.getByTestId('ficha-propuesta');
    const validar = ficha.getByRole('button', { name: 'Validar', exact: true }).first();
    const habilitado = await validar.isEnabled();
    if (!habilitado) throw new Error(`Validar B deshabilitado: ${(await pagina.getByTestId('faltantes-validacion').innerText()).slice(0, 700)}`);
    await validar.click();
    await pagina.getByTestId('dialogo-seguimiento-propuesta').getByRole('button', { name: 'Registrar y validar' }).click();
    await pagina.waitForTimeout(1500);
    await ficha.getByTestId('boton-pdf-propuesta').click();
    await pagina.waitForTimeout(1500);
    await ficha.getByRole('tab', { name: 'PDFs' }).click();
    await captura(pagina, '04_propuesta_versiones', '20-pdf-rev-B', { usuario: 'admin' });
    const desc = pagina.getByRole('button', { name: /Descargar PDF/ }).first();
    if (await desc.count()) {
      const [d] = await Promise.all([pagina.waitForEvent('download'), desc.click()]);
      await guardarDescarga(d, '08_documentos', 'propuesta-rev-B');
    }
    await ficha.getByRole('button', { name: 'Enviar', exact: true }).first().click();
    await pagina.getByLabel('Destino de envío').fill('compras@clienteqa.mx');
    await pagina.getByRole('button', { name: 'Confirmar envío' }).click();
    await pagina.waitForTimeout(2000);
    await pagina.reload({ waitUntil: 'networkidle' });
    const estado = await cabecera();
    await captura(pagina, '04_propuesta_versiones', '21-rev-B-enviada', { usuario: 'admin' });
    return { habilitado, estado };
  });
} catch (e) {
  registrar('admin', '04_propuesta_versiones', 'etapa2f_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('04_propuesta_versiones', 'resultado-etapa2f', `# Resultado etapa2f\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 9000));
}
