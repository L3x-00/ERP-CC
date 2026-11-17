import { abrirNavegador, nuevoContexto, iniciarSesionOperador, captura, registrar, escribirNota } from './driver.mjs';
const PROCESO = '71c7d593-0caf-4f93-bfd7-0b1aa3fa8d82:42bd2e46-fe32-4a9b-856a-5cb8384b78f7';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
const resultados = [];
async function paso(nombre, fn, critico = true) {
  try {
    const r = await fn();
    resultados.push({ paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('operador', '05_produccion', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('operador', '05_produccion', nombre, 'error', { mensaje: msg });
    await captura(pagina, '05_produccion', `error4-${nombre}`, { usuario: 'operador' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
try {
  await paso('abrir-detalle-IT01', async () => {
    await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
    await pagina.locator(`[data-testid="abrir-detalle-${PROCESO}"]`).first().click();
    const detalle = pagina.getByTestId('detalle-proceso');
    await detalle.waitFor();
    await pagina.waitForTimeout(800);
    const texto = (await detalle.innerText()).replace(/\s+/g, ' ');
    const jornada = texto.includes('Jornada corrida de 8 horas') && texto.includes('comida de 12:00 a 13:00') && texto.includes('Matutino y vespertino son el mismo horario');
    const tiempoReal = texto.includes('Tiempo real de proceso');
    const enlaceAnterior = await detalle.locator('[data-testid="ver-proceso-anterior"]').count();
    const completado = await detalle.getByText('Proceso completado').count();
    await captura(pagina, '09_ultimo_cambio', '01-detalle-jornada-y-textos', { usuario: 'operador' });
    return { texto: texto.slice(0, 2600), jornada, tiempoReal, enlaceAnterior, completado };
  });

  await paso('iniciar-proceso', async () => {
    const detalle = pagina.getByTestId('detalle-proceso');
    await detalle.getByTestId('iniciar-detalle').dispatchEvent('click');
    const checklist = pagina.getByTestId('checklist-inicio');
    await checklist.waitFor({ timeout: 10000 });
    for (const c of await checklist.getByRole('checkbox').all()) await c.check();
    await captura(pagina, '09_ultimo_cambio', '02-checklist-inicio', { usuario: 'operador' });
    await checklist.getByTestId('confirmar-checklist-inicio').dispatchEvent('click');
    await pagina.waitForTimeout(1800);
    const enCurso = (await pagina.getByTestId('columna-en_proceso').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
    await captura(pagina, '09_ultimo_cambio', '03-proceso-en-curso', { usuario: 'operador' });
    return { enCurso };
  });
} catch (e) {
  registrar('operador', '05_produccion', 'etapa4_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('09_ultimo_cambio', 'inicio-operador', `# Inicio de operación\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 8000));
}
