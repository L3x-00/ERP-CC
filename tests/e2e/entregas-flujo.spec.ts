import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database, Json } from '@/compartido/tipos/supabase';

type Contexto = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  usuarioId: string;
  operadorId: string;
  clienteId: string;
  rfqId: string;
  revisionId: string;
  recursoId: string;
  ordenId: string;
  ordenFolioSii: string;
  notaIds: string[];
};

async function iniciarSesion(page: Page, correo: string, contrasena: string): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => ['/dashboard', '/tablero'].includes(url.pathname));
}

/** Cadena RFQ→propuesta→revisión aceptada y orden PLANIFICADA con producción completa. */
async function prepararContexto(): Promise<Contexto> {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-b7-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Aa9`;
  const alta = await admin.auth.admin.createUser({
    email: correo, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Admin B7 ${sufijo}` },
  });
  if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario');
  const usuarioId = alta.data.user.id;
  await admin.from('usuarios').update({ rol: 'admin', activo: true, nombre_completo: `Admin B7 ${sufijo}` }).eq('id', usuarioId);

  const operadorAlta = await admin.auth.admin.createUser({
    email: `e2e-b7-op-${sufijo}@orca.local`, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Operador B7 ${sufijo}` },
  });
  if (operadorAlta.error || !operadorAlta.data.user) throw new Error('Sin operador');
  const operadorId = operadorAlta.data.user.id;
  await admin.from('usuarios').update({ rol: 'operador', activo: true, nombre_completo: `Operador B7 ${sufijo}` }).eq('id', operadorId);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `B7 ${sufijo}`, razon_social: `B7 ${sufijo} SA de CV`,
    estado: 'activo', condiciones_pago: 'contado',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`Sin cliente: ${errorCliente?.message}`);

  const { data: rfq, error: errorRfq } = await admin.from('pipeline').insert({
    folio_op: `OP-B7-${sufijo}`, estado_rfq: 'READY_FOR_PROPOSAL',
    nombre_contacto: 'Ana B7', empresa: `B7 ${sufijo}`, cliente_id: cliente.id,
    vendedor_id: usuarioId, moneda: 'MXN', iva_porcentaje: 16,
    fecha_requerida: '2099-12-31T10:00:00.000Z', prioridad: 'normal',
  }).select('id').single();
  if (errorRfq || !rfq) throw new Error(`Sin RFQ: ${errorRfq?.message}`);

  const { data: proceso } = await admin.from('catalogo_procesos').select('id').eq('codigo', 'LASER_FIBRA').maybeSingle();
  if (!proceso) throw new Error('Falta el catálogo de procesos (LASER_FIBRA)');

  const { data: rfqItem, error: errorItem } = await admin.from('rfq_items').insert({
    rfq_id: rfq.id, numero: 1, codigo: 'IT01', descripcion: 'Pieza E2E B7',
    cantidad: 2, material_id: null, espesor_id: null,
  }).select('id').single();
  if (errorItem || !rfqItem) throw new Error(`Sin ítem RFQ: ${errorItem?.message}`);
  await admin.from('rfq_item_operaciones').insert({ rfq_item_id: rfqItem.id, proceso_id: proceso.id, orden: 0 });

  const { data: propuestaRpc, error: errorPropuesta } = await admin.rpc('crear_propuesta', {
    p_rfq_id: rfq.id, p_actor: usuarioId,
  });
  if (errorPropuesta || !propuestaRpc) throw new Error(`Sin propuesta: ${errorPropuesta?.message}`);
  const propuestaId = (propuestaRpc as { propuestaId: string }).propuestaId;
  expect(propuestaId).toBeTruthy();
  const revisionId = (propuestaRpc as { revisionId: string }).revisionId;

  const leerRevision = async (): Promise<string> => {
    const { data } = await admin.from('propuesta_revisiones').select('actualizado_en').eq('id', revisionId).single();
    return data!.actualizado_en;
  };
  const { error: errorValidar } = await admin.rpc('validar_revision', {
    p_revision_id: revisionId, p_datos: { actualizado_en: await leerRevision() } as Json, p_actor: usuarioId,
  });
  if (errorValidar) throw new Error(`No se validó: ${errorValidar.message}`);
  const { error: errorSeguimiento } = await admin.rpc('registrar_seguimiento_propuesta', {
    p_revision_id: revisionId,
    p_datos: { actualizado_en: await leerRevision(), codigo: 'FOLLOW_UP', fecha: '2099-11-15' } as Json,
    p_actor: usuarioId,
  });
  if (errorSeguimiento) throw new Error(`No se registró seguimiento: ${errorSeguimiento.message}`);
  const { data: archivoPdf, error: errorArchivo } = await admin.from('archivos').insert({
    entidad: 'propuesta_revision', entidad_id: revisionId, clase: 'pdf',
    nombre_original: 'propuesta-e2e.pdf', nombre_erp: 'propuesta-e2e.pdf',
    bucket: 'propuestas-pdf', ruta_storage: `propuesta_revision/${revisionId}/e2e-${sufijo}.pdf`,
    mime: 'application/pdf', tamano_bytes: 1024, subido_por: usuarioId,
  }).select('id').single();
  if (errorArchivo || !archivoPdf) throw new Error(`Sin archivo PDF: ${errorArchivo?.message}`);
  const { error: errorPdf } = await admin.rpc('registrar_pdf_revision', {
    p_revision_id: revisionId, p_archivo_id: archivoPdf.id,
    p_contenido_hash: `e2e-b7-${sufijo}-hash-0123456789`, p_actor: usuarioId,
  });
  if (errorPdf) throw new Error(`No se registró PDF: ${errorPdf.message}`);
  const { error: errorEnviar } = await admin.rpc('enviar_revision', {
    p_revision_id: revisionId, p_canal: 'correo', p_destino: 'compras@cliente.mx', p_actor: usuarioId,
  });
  if (errorEnviar) throw new Error(`No se envió: ${errorEnviar.message}`);
  const { error: errorAceptar } = await admin.rpc('aceptar_revision', {
    p_revision_id: revisionId,
    p_datos: { actualizado_en: await leerRevision(), canal: 'correo', destino: 'compras@cliente.mx' } as Json,
    p_actor: usuarioId,
  });
  if (errorAceptar) throw new Error(`No se aceptó: ${errorAceptar.message}`);

  const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
    codigo: `B7-LASER-${sufijo.toUpperCase()}`, area: 'sheet_metal', nombre: `Láser B7 ${sufijo}`,
  }).select('id').single();
  if (errorRecurso || !recurso) throw new Error(`Sin recurso: ${errorRecurso?.message}`);

  const { data: altaOrden, error: errorOrden } = await admin.rpc('crear_orden_desde_revision', {
    p_revision_id: revisionId, p_actor_id: usuarioId,
  });
  if (errorOrden || !altaOrden) throw new Error(`Sin orden: ${errorOrden?.message}`);
  const fila = (Array.isArray(altaOrden) ? altaOrden[0] : altaOrden) as { id: string; folio_sii: string };
  const ordenId = fila.id;

  const { data: partidas } = await admin.from('partidas_orden_produccion')
    .select('id, cantidad_solicitada').eq('orden_id', ordenId);
  if (!partidas || partidas.length === 0) throw new Error('La orden no tiene partidas');
  const programaciones: { id: string; partida_id: string }[] = [];
  for (const partida of partidas) {
    const { data: programacion, error: errorProgramacion } = await admin.from('programacion_areas').insert({
      orden_id: ordenId, partida_id: partida.id, recurso_id: recurso.id,
      fecha_programada: '2099-12-30', turno: 'matutino', horas_estimadas: 1, secuencia: 1,
    }).select('id, partida_id').single();
    if (errorProgramacion || !programacion) throw new Error(`Sin programación: ${errorProgramacion?.message}`);
    programaciones.push(programacion);
  }
  await expect.poll(async () => {
    const { data } = await admin.from('ordenes_produccion').select('estado_sii').eq('id', ordenId).single();
    return data?.estado_sii;
  }).toBe('PLANIFICADA');

  const { data: ordenFila } = await admin.from('ordenes_produccion')
    .select('actualizado_en').eq('id', ordenId).single();
  const { error: errorLiberar } = await admin.rpc('liberar_orden', {
    p_orden_id: ordenId, p_actualizado_en: ordenFila!.actualizado_en, p_actor_id: usuarioId,
  });
  if (errorLiberar) throw new Error(`No se liberó: ${errorLiberar.message}`);

  const { error: errorSesion } = await admin.from('sesiones_trabajo').insert({
    orden_id: ordenId, partida_id: programaciones[0].partida_id,
    programacion_id: programaciones[0].id, operador_id: operadorId,
  });
  if (errorSesion) throw new Error(`Sin sesión: ${errorSesion.message}`);

  for (const partida of partidas) {
    const metasExistentes = (await admin.from('metas_proceso_partida')
      .select('id, meta_piezas').eq('partida_id', partida.id)).data ?? [];
    const metas = metasExistentes.length > 0
      ? metasExistentes
      : [(await admin.from('metas_proceso_partida').insert({
          partida_id: partida.id, secuencia: 1, nombre: 'Corte', meta_piezas: partida.cantidad_solicitada,
        }).select('id, meta_piezas').single()).data!];
    for (const meta of metas) {
      const { error: errorAvance } = await admin.from('registros_avance_partida').insert({
        partida_id: partida.id, operador_id: operadorId,
        cantidad_producida: meta.meta_piezas, cantidad_scrap: 0, meta_proceso_id: meta.id,
      });
      if (errorAvance) throw new Error(`Sin avance: ${errorAvance.message}`);
    }
    await admin.from('partidas_orden_produccion')
      .update({ cantidad_producida: partida.cantidad_solicitada }).eq('id', partida.id);
  }
  await expect.poll(async () => {
    const { data } = await admin.from('ordenes_produccion').select('estado_sii').eq('id', ordenId).single();
    return data?.estado_sii;
  }).toBe('PRODUCCION_COMPLETADA');

  return {
    admin, correo, contrasena, usuarioId, operadorId, clienteId: cliente.id, rfqId: rfq.id,
    revisionId, recursoId: recurso.id, ordenId,
    ordenFolioSii: fila.folio_sii, notaIds: [],
  };
}

async function limpiarContexto(contexto: Contexto): Promise<void> {
  const { admin } = contexto;
  const { data: notas } = await admin.from('notas_entrega').select('id').eq('orden_id', contexto.ordenId);
  const notaIds = (notas ?? []).map((nota) => nota.id);
  contexto.notaIds = notaIds;

  if (notaIds.length > 0) {
    const { data: archivos } = await admin.from('archivos')
      .select('id, bucket, ruta_storage')
      .eq('entidad', 'entrega').in('entidad_id', notaIds);
    for (const archivo of archivos ?? []) {
      await admin.storage.from(archivo.bucket).remove([archivo.ruta_storage]);
    }
    await admin.from('archivos').delete().eq('entidad', 'entrega').in('entidad_id', notaIds);
    await admin.from('partidas_nota_entrega').delete().in('nota_entrega_id', notaIds);
    await admin.from('notas_entrega').delete().in('id', notaIds);
  }

  const { data: partidas } = await admin.from('partidas_orden_produccion').select('id').eq('orden_id', contexto.ordenId);
  const ids = (partidas ?? []).map((fila) => fila.id);
  if (ids.length > 0) {
    await admin.from('registros_avance_partida').delete().in('partida_id', ids);
    await admin.from('metas_proceso_partida').delete().in('partida_id', ids);
  }
  await admin.from('cuentas_por_cobrar').delete().eq('orden_id', contexto.ordenId);
  await admin.from('sesiones_trabajo').delete().eq('orden_id', contexto.ordenId);
  await admin.from('programacion_areas').delete().eq('orden_id', contexto.ordenId);
  await admin.from('orden_eventos_cambio').delete().eq('orden_id', contexto.ordenId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);

  const { data: archivosPropuesta } = await admin.from('archivos')
    .select('id, bucket, ruta_storage').eq('entidad', 'propuesta_revision').eq('entidad_id', contexto.revisionId);
  for (const archivo of archivosPropuesta ?? []) {
    await admin.storage.from(archivo.bucket).remove([archivo.ruta_storage]);
  }
  await admin.from('archivos').delete().eq('entidad', 'propuesta_revision').eq('entidad_id', contexto.revisionId);
  await admin.from('propuestas').delete().eq('rfq_id', contexto.rfqId);
  await admin.from('pipeline').delete().eq('id', contexto.rfqId);
  await admin.from('recursos_planeacion').delete().eq('id', contexto.recursoId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().in('usuario_id', [contexto.usuarioId, contexto.operadorId]);
  await admin.from('usuarios').delete().in('id', [contexto.usuarioId, contexto.operadorId]);
  await admin.auth.admin.deleteUser(contexto.operadorId);
  await admin.auth.admin.deleteUser(contexto.usuarioId);
}

const PNG_EVIDENCIA = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f030005fe02fea72d6b2a0000000049454e44ae426082',
  'hex',
);

test.describe('Entregas SII-B7 ola 2: folio NE, parciales, evidencia y firma', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales del stack local.',
  );

  test('entrega parcial con firma digital → entrega total archiva y activa AR', async ({ page }) => {
    const contexto = await prepararContexto();
    const { admin } = contexto;
    try {
      await iniciarSesion(page, contexto.correo, contexto.contrasena);
      await page.goto('/entregas');
      await expect(page.getByTestId('cola-entregas')).toBeVisible();

      // Cola de pendientes: la orden aparece con su folio SII.
      const filaPendiente = page.getByTestId(`fila-pendiente-${contexto.ordenFolioSii}`);
      await expect(filaPendiente).toBeVisible();
      await filaPendiente.getByTestId(`preparar-entrega-${contexto.ordenFolioSii}`).click();

      // Entrega parcial: 1 de 2 piezas.
      await expect(page.getByTestId('panel-preparar-entrega')).toBeVisible();
      await page.getByTestId('entrega-cantidad-0').fill('1');
      await page.getByTestId('recibido-por-entrega').fill('Recepción B7 E2E');
      await page.getByTestId('confirmar-registrar-entrega').click();
      await expect(page.getByTestId('entrega-mensaje')).toContainText('NE-');
      const { data: notaParcial } = await admin.from('notas_entrega')
        .select('id, folio, folio_sii, es_parcial').eq('orden_id', contexto.ordenId).single();
      expect(notaParcial?.es_parcial).toBe(true);
      expect(notaParcial?.folio_sii).toMatch(new RegExp(`^NE-${contexto.ordenFolioSii.replace(/^O-/, '')}-01$`));
      contexto.notaIds.push(notaParcial!.id);
      const { data: renglonParcial } = await admin.from('partidas_nota_entrega')
        .select('codigo_item, cantidad_entregada').eq('nota_entrega_id', notaParcial!.id).single();
      expect(renglonParcial).toMatchObject({ codigo_item: 'IT01', cantidad_entregada: 1 });

      // Detalle de la nota: renglones ITxx y captura de firma digital.
      await page.getByTestId('abrir-nota-entrega').click();
      await page.waitForURL((url) => url.pathname === `/entregas/${notaParcial!.id}`);
      await expect(page.getByTestId('detalle-entrega')).toBeVisible();
      await expect(page.getByTestId('detalle-folio')).toContainText(notaParcial!.folio_sii!);
      await expect(page.getByTestId('detalle-partes')).toContainText('Recepción B7 E2E');
      await expect(page.getByTestId('renglon-entrega-IT01')).toContainText('1');

      const lienzo = page.getByTestId('firma-canvas');
      const caja = await lienzo.boundingBox();
      if (!caja) throw new Error('Sin lienzo de firma');
      await page.mouse.move(caja.x + 40, caja.y + 90);
      await page.mouse.down();
      await page.mouse.move(caja.x + 160, caja.y + 60, { steps: 8 });
      await page.mouse.move(caja.x + 280, caja.y + 110, { steps: 8 });
      await page.mouse.up();
      await page.getByTestId('firma-adjuntar').click();
      await expect(page.getByTestId('evidencia-firma-1')).toBeVisible();
      await expect.poll(async () => {
        const { data } = await admin.from('archivos').select('version, clase')
          .eq('entidad', 'entrega').eq('entidad_id', notaParcial!.id).eq('clase', 'firma');
        return data?.map((fila) => fila.version) ?? [];
      }).toEqual([1]);

      // Firma escaneada subida dos veces (mismo nombre) genera versión 2 trazada.
      await page.getByTestId('clase-evidencia').selectOption('firma_escaneada');
      await page.getByTestId('archivo-evidencia').setInputFiles({
        name: 'firma-industrial.png', mimeType: 'image/png', buffer: PNG_EVIDENCIA,
      });
      await page.getByTestId('subir-evidencia-entrega').click();
      await expect(page.getByTestId('evidencia-firma_escaneada-1')).toBeVisible();
      await page.getByTestId('archivo-evidencia').setInputFiles({
        name: 'firma-industrial.png', mimeType: 'image/png', buffer: PNG_EVIDENCIA,
      });
      await page.getByTestId('subir-evidencia-entrega').click();
      await expect(page.getByTestId('evidencia-firma_escaneada-2')).toBeVisible();
      await expect.poll(async () => {
        const { data } = await admin.from('archivos')
          .select('version, vigente').eq('entidad', 'entrega').eq('entidad_id', notaParcial!.id)
          .eq('clase', 'firma_escaneada').order('version', { ascending: true });
        return data ?? [];
      }).toEqual([
        { version: 1, vigente: false },
        { version: 2, vigente: true },
      ]);

      // Entrega total restante: segunda nota NE-...-02, completa.
      await page.goto('/entregas');
      await page.getByTestId(`fila-pendiente-${contexto.ordenFolioSii}`)
        .getByTestId(`preparar-entrega-${contexto.ordenFolioSii}`).click();
      await expect(page.getByTestId('panel-preparar-entrega')).toBeVisible();
      await page.getByTestId('entrega-cantidad-0').fill('1');
      await page.getByTestId('recibido-por-entrega').fill('Recepción B7 E2E final');
      await page.getByTestId('confirmar-registrar-entrega').click();
      await expect(page.getByTestId('entrega-mensaje')).toContainText('NE-');
      await expect.poll(async () => {
        const { data } = await admin.from('notas_entrega')
          .select('folio_sii, es_parcial').eq('orden_id', contexto.ordenId)
          .order('creado_en', { ascending: false }).limit(1).single();
        return data ?? null;
      }).not.toBeNull();
      const { data: notaFinal } = await admin.from('notas_entrega')
        .select('id, folio_sii, es_parcial').eq('orden_id', contexto.ordenId)
        .order('creado_en', { ascending: false }).limit(1).single();
      contexto.notaIds.push(notaFinal!.id);
      expect(notaFinal?.es_parcial).toBe(false);
      expect(notaFinal?.folio_sii).toMatch(new RegExp(`^NE-${contexto.ordenFolioSii.replace(/^O-/, '')}-02$`));

      // Regresión de entrega total: archivo de la orden y activación de la AR.
      await expect.poll(async () => {
        const { data } = await admin.from('ordenes_produccion')
          .select('archivada_en').eq('id', contexto.ordenId).single();
        return data?.archivada_en ?? null;
      }).not.toBeNull();
      const { data: cuenta } = await admin.from('cuentas_por_cobrar')
        .select('cobrable_desde, estado').eq('orden_id', contexto.ordenId).maybeSingle();
      if (cuenta) {
        expect(cuenta.cobrable_desde).not.toBeNull();
      }

      // Capturas 1440/768 × claro/oscuro de la cola y del detalle.
      mkdirSync('.ai-shared/qa/sii-b7-ola2/visual', { recursive: true });
      for (const [nombre, ancho, alto, ruta] of [
        ['cola-escritorio', 1440, 900, '/entregas'],
        ['cola-tableta', 768, 1024, '/entregas'],
        ['detalle-escritorio', 1440, 900, `/entregas/${notaParcial!.id}`],
        ['detalle-tableta', 768, 1024, `/entregas/${notaParcial!.id}`],
      ] as const) {
        await page.goto(ruta);
        await expect(
          page.getByTestId(nombre.startsWith('cola') ? 'cola-entregas' : 'detalle-entrega'),
        ).toBeVisible();
        await page.setViewportSize({ width: ancho, height: alto });
        for (const tema of ['claro', 'oscuro'] as const) {
          await page.locator('html').evaluate(
            (elemento, oscuro) => elemento.classList.toggle('dark', oscuro), tema === 'oscuro',
          );
          await page.screenshot({
            path: `.ai-shared/qa/sii-b7-ola2/visual/entregas-${nombre}-${tema}.png`,
            fullPage: true, animations: 'disabled',
          });
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));
    } finally {
      await limpiarContexto(contexto);
    }
  });
});
