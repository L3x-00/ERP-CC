import { abrirNavegador, nuevoContexto, iniciarSesionOperador, captura, escribirNota } from './driver.mjs';
const PROCESO = '71c7d593-0caf-4f93-bfd7-0b1aa3fa8d82:42bd2e46-fe32-4a9b-856a-5cb8384b78f7';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(10000);
try {
  await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
  await pagina.waitForTimeout(1000);
  const cols = {};
  for (const c of ['columna-bandeja', 'columna-en_proceso', 'columna-pausada', 'columna-actualizar_avance', 'columna-lista']) {
    cols[c] = (await pagina.getByTestId(c).innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
  }
  console.log('COLUMNAS:', JSON.stringify(cols, null, 2));
  const abrir = pagina.locator(`[data-testid="abrir-detalle-${PROCESO}"]`).first();
  if (await abrir.count()) {
    await abrir.click();
    await pagina.getByTestId('detalle-proceso').waitFor();
    const t = (await pagina.getByTestId('detalle-proceso').innerText()).replace(/\s+/g, ' ');
    console.log('DETALLE:', t.slice(0, 2500));
    await captura(pagina, '09_ultimo_cambio', 'probe-estado-sesiones', { usuario: 'operador' });
    escribirNota('09_ultimo_cambio', 'estado-sesiones', `# Estado sesiones\n\nCOLUMNAS:\n\`\`\`json\n${JSON.stringify(cols, null, 2)}\n\`\`\`\n\nDETALLE:\n${t}\n`);
  } else {
    console.log('No se encontró botón de detalle para el proceso');
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
