// Re-verificación en producción tras el despliegue de A-1, M-1..M-5 y B-1..B-3.
// Reutiliza el caso creado el 2026-11-17 (estado-caso.json) y no borra datos.
import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, escribirNota } from './driver.mjs';
import { readFileSync } from 'node:fs';

const ESTADO = JSON.parse(readFileSync('evidencias_e2e_ORCA_20261117/_scripts/estado-caso.json', 'utf8'));
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(20000);
const resultados = [];

function verificar(id, ok, detalle = {}) {
  const estado = ok ? 'ok' : 'error';
  resultados.push({ id, resultado: estado, ...detalle });
  registrar('admin', '11_reverificacion', id, estado, detalle);
  console.log(`${ok ? 'OK ' : 'FAIL'} ${id}`);
}

try {
  await iniciarSesionAdmin(pagina, process.env.E2E_ADMIN_EMAIL ?? '', process.env.E2E_ADMIN_PASSWORD ?? '');
  const masTarde = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await masTarde.count()) await masTarde.click();

  // M-1: el enlace histórico /pipeline sigue aclarando el modelo en /rfq.
  await pagina.goto(`/pipeline?oportunidad=${ESTADO.rfqId}`, { waitUntil: 'networkidle' });
  await pagina.waitForURL((url) => url.pathname === '/rfq');
  const aviso = pagina.getByTestId('aviso-pipeline-rfq');
  const textoAviso = (await aviso.count()) ? await aviso.innerText() : '';
  verificar('M-1-aviso-oportunidad', textoAviso.includes('La oportunidad se gestiona en el RFQ'), {
    url: pagina.url(),
  });

  // M-2 y M-5: ficha del RFQ del caso (READY_FOR_PROPOSAL).
  await pagina.goto(ESTADO.rfqUrl, { waitUntil: 'networkidle' });
  await pagina.getByRole('tab', { name: 'Archivos' }).click();
  const adjuntos = pagina.getByTestId('adjuntos-oportunidad-rfq');
  await adjuntos.waitFor({ state: 'visible' });
  verificar('M-2-adjuntos-historicos', (await adjuntos.innerText()).includes('Adjuntos de la oportunidad'));

  const pestanaRevisar = pagina.getByRole('tab', { name: 'Revisar' });
  verificar('M-5-pestana-revisar-en-ready', (await pestanaRevisar.count()) > 0, {
    estado: ESTADO.rfqEstado,
  });
  if (await pestanaRevisar.count()) {
    await pestanaRevisar.click();
    const panel = pagina.getByTestId('panel-revision-rfq');
    await panel.waitFor({ state: 'visible' });
    const texto = await panel.innerText();
    verificar(
      'M-5-texto-revalidacion',
      texto.includes('Revisar el RFQ tras la edición') &&
        texto.includes('No hay cambios de estado pendientes') &&
        !texto.includes('Marcar listo para propuesta'),
      { extracto: texto.slice(0, 220) },
    );
  }
  await captura(pagina, '11_reverificacion', 'rfq-m2-m5', { usuario: 'admin' });

  // B-1: el cierre del caso conservaba 0,01 h (36 s) que antes se pintaba «0.0 h».
  await pagina.goto('/cierre-administrativo', { waitUntil: 'networkidle' });
  await pagina.getByTestId('cierre-fila-O-1126_07').click();
  const detalle = pagina.getByTestId('detalle-cierre-administrativo');
  await detalle.waitFor({ state: 'visible' });
  const textoDetalle = await detalle.innerText();
  verificar(
    'B-1-horas-pequenas-visibles',
    textoDetalle.includes('0,01 h') && !textoDetalle.includes('0.0 h'),
    { extracto: textoDetalle.slice(0, 420) },
  );
  await captura(pagina, '11_reverificacion', 'cierre-administrativo-b1', { usuario: 'admin' });

  escribirNota(
    '11_reverificacion',
    'resultado',
    '# Re-verificación en producción\n\n' + JSON.stringify(resultados, null, 2) + '\n',
  );
  registrar('admin', '11_reverificacion', 'resumen', resultados.every((r) => r.resultado === 'ok') ? 'ok' : 'error', {
    total: resultados.length,
  });
  console.log(JSON.stringify(resultados, null, 2));
  if (resultados.some((r) => r.resultado === 'error')) process.exitCode = 1;
} catch (e) {
  registrar('admin', '11_reverificacion', 'reverificacion', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
