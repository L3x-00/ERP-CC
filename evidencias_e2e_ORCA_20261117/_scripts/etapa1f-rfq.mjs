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
    await captura(pagina, '01_rfq', `error1f-${nombre}`, { usuario: 'admin' }).catch(() => {});
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

  await paso('confirmar-listo', async () => {
    await pagina.goto(`/rfq?rfq=${RFQ_ID}`, { waitUntil: 'networkidle' });
    await pagina.getByRole('button', { name: 'Marcar listo' }).click();
    const dlg = pagina.getByRole('dialog');
    await dlg.getByText(/cumple todos los requisitos|Faltan requisitos/).first().waitFor({ timeout: 15000 });
    const txt = (await dlg.innerText()).slice(0, 900);
    await captura(pagina, '01_rfq', '53-validacion-final-listo', { usuario: 'admin' });
    await dlg.getByRole('button', { name: 'Confirmar y marcar listo' }).click();
    await pagina.waitForTimeout(1800);
    const ficha = await pagina.getByTestId('ficha-rfq').innerText();
    const estado = ficha.includes('Listo para propuesta') ? 'READY_FOR_PROPOSAL' : 'INCOMPLETE';
    ESTADO.rfqEstado = estado;
    await captura(pagina, '01_rfq', '54-rfq-listo-confirmado', { usuario: 'admin' });
    return { txt, estado };
  });

  await paso('editar-tras-validar', async () => {
    await pagina.getByTestId('ficha-rfq').getByRole('tab', { name: 'Resumen' }).click();
    const boton = pagina.getByRole('button', { name: 'Editar resumen' });
    const editable = (await boton.count()) > 0;
    if (!editable) return { editable: false, nota: 'La UI no ofrece Editar resumen tras marcar listo' };
    await boton.click();
    await pagina.getByTestId('resumen-rfq').getByLabel('Descripción general').fill(`Soporte metálico SM-2026-02 y panel MDF-12 para ${SUFIJO}. Alcance congelado y verificado tras la validación.`);
    await captura(pagina, '01_rfq', '55-edicion-tras-validacion', { usuario: 'admin' });
    await pagina.getByRole('button', { name: 'Guardar datos' }).click();
    await pagina.getByText('Datos guardados.').first().waitFor({ timeout: 15000 });
    const marcar = pagina.getByRole('button', { name: 'Marcar listo' });
    await captura(pagina, '01_rfq', '56-estado-tras-edicion', { usuario: 'admin' });
    return { editable: true, revalidarDisponible: (await marcar.count()) > 0 };
  }, false);

  await paso('activar-cliente-verificado', async () => {
    await pagina.goto('/clientes', { waitUntil: 'networkidle' });
    const boton = pagina.getByRole('button', { name: new RegExp(SUFIJO) }).first();
    await boton.waitFor({ timeout: 15000 });
    await boton.click();
    const dlg = pagina.getByRole('dialog', { name: 'Ficha del cliente' });
    await dlg.waitFor();
    await dlg.getByText(new RegExp(SUFIJO)).first().waitFor({ timeout: 15000 });
    const antes = (await dlg.innerText()).slice(0, 500);
    const activar = dlg.getByRole('button', { name: /^Activar$/ });
    if (await activar.count()) {
      await activar.click();
      await pagina.waitForTimeout(2500);
      // Recargar la ficha para observar el estado persistido.
      await pagina.reload({ waitUntil: 'networkidle' });
      await pagina.waitForTimeout(1200);
    }
    const dlg2 = pagina.getByRole('dialog', { name: 'Ficha del cliente' });
    const despues = (await dlg2.innerText().catch(() => 'sin drawer')).slice(0, 700);
    await captura(pagina, '01_rfq', '57-cliente-estado-persistido', { usuario: 'admin' });
    return { antes, despues, activo: !despues.includes('Prospecto') };
  }, false);

  await paso('verificacion-final', async () => {
    await pagina.goto(`/rfq?rfq=${RFQ_ID}`, { waitUntil: 'networkidle' });
    const ficha = pagina.getByTestId('ficha-rfq');
    await ficha.getByRole('tab', { name: 'Resumen' }).click();
    const datos = (await pagina.getByTestId('rfq-datos-generales').innerText()).slice(0, 1200);
    await captura(pagina, '01_rfq', '58-verificacion-final-rfq', { usuario: 'admin' });
    return { datos, ficha: (await ficha.innerText()).slice(0, 500) };
  }, false);
} catch (e) {
  registrar('admin', '01_rfq', 'etapa1f_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('01_rfq', 'resultado-etapa1f', `# Resultado etapa 1f\n\n\`\`\`json\n${JSON.stringify({ resultados, ESTADO }, null, 2)}\n\`\`\`\n`);
  writeFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', JSON.stringify(ESTADO, null, 2), 'utf8');
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 9000));
}
