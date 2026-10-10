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
  clienteId: string;
  rfqId: string;
  propuestaId: string;
  revisionId: string;
  recursoId: string;
  operadorId: string;
  ordenId: string;
  ordenFolioSii: string;
  ordenTiId: string;
};

async function iniciarSesion(page: Page, correo: string, contrasena: string): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(correo);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => ['/dashboard', '/tablero'].includes(url.pathname));
}

/** Cadena mínima RFQ→propuesta→revisión aceptada usando las RPC de B4. */
async function prepararContexto(): Promise<Contexto> {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-b5-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Aa9`;
  const alta = await admin.auth.admin.createUser({
    email: correo, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Admin B5 ${sufijo}` },
  });
  if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario');
  const usuarioId = alta.data.user.id;
  await admin.from('usuarios').update({ rol: 'admin', activo: true, nombre_completo: `Admin B5 ${sufijo}` }).eq('id', usuarioId);

  const operadorAlta = await admin.auth.admin.createUser({
    email: `e2e-b5-op-${sufijo}@orca.local`, password: contrasena, email_confirm: true,
    user_metadata: { nombre_completo: `Operador B5 ${sufijo}` },
  });
  if (operadorAlta.error || !operadorAlta.data.user) throw new Error(operadorAlta.error?.message ?? 'Sin operador');
  const operadorId = operadorAlta.data.user.id;
  await admin.from('usuarios').update({ rol: 'operador', activo: true, nombre_completo: `Operador B5 ${sufijo}` }).eq('id', operadorId);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `B5 ${sufijo}`, razon_social: `B5 ${sufijo} SA de CV`,
    estado: 'activo', condiciones_pago: 'contado',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`Sin cliente: ${errorCliente?.message}`);

  const { data: rfq, error: errorRfq } = await admin.from('pipeline').insert({
    folio_op: `OP-B5-${sufijo}`, estado_rfq: 'READY_FOR_PROPOSAL',
    nombre_contacto: 'Ana B5', empresa: `B5 ${sufijo}`, cliente_id: cliente.id,
    vendedor_id: usuarioId, moneda: 'MXN', iva_porcentaje: 16,
    fecha_requerida: '2099-12-31T10:00:00.000Z', prioridad: 'normal',
  }).select('id').single();
  if (errorRfq || !rfq) throw new Error(`Sin RFQ: ${errorRfq?.message}`);

  const { data: proceso } = await admin.from('catalogo_procesos').select('id').eq('codigo', 'LASER_FIBRA').maybeSingle();
  if (!proceso) throw new Error('Falta el catálogo de procesos (LASER_FIBRA)');

  const { data: rfqItem, error: errorItem } = await admin.from('rfq_items').insert({
    rfq_id: rfq.id, numero: 1, codigo: 'IT01', descripcion: 'Pieza E2E B5',
    cantidad: 2, material_id: null, espesor_id: null,
  }).select('id').single();
  if (errorItem || !rfqItem) throw new Error(`Sin ítem RFQ: ${errorItem?.message}`);
  await admin.from('rfq_item_operaciones').insert({ rfq_item_id: rfqItem.id, proceso_id: proceso.id, orden: 0 });

  const { data: propuestaRpc, error: errorPropuesta } = await admin.rpc('crear_propuesta', {
    p_rfq_id: rfq.id, p_actor: usuarioId,
  });
  if (errorPropuesta || !propuestaRpc) throw new Error(`Sin propuesta: ${errorPropuesta?.message}`);
  const propuestaId = (propuestaRpc as { propuestaId: string }).propuestaId;
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
  // El envío exige PDF vigente: registra un binario de prueba antes de enviar.
  const { data: archivoPdf, error: errorArchivo } = await admin.from('archivos').insert({
    entidad: 'propuesta_revision', entidad_id: revisionId, clase: 'pdf',
    nombre_original: 'propuesta-e2e.pdf', nombre_erp: 'propuesta-e2e.pdf',
    bucket: 'propuestas-pdf', ruta_storage: `propuesta_revision/${revisionId}/e2e-${sufijo}.pdf`,
    mime: 'application/pdf', tamano_bytes: 1024, subido_por: usuarioId,
  }).select('id').single();
  if (errorArchivo || !archivoPdf) throw new Error(`Sin archivo PDF: ${errorArchivo?.message}`);
  const { error: errorPdf } = await admin.rpc('registrar_pdf_revision', {
    p_revision_id: revisionId, p_archivo_id: archivoPdf.id,
    p_contenido_hash: `e2e-${sufijo}-hash-0123456789`, p_actor: usuarioId,
  });
  if (errorPdf) throw new Error(`No se registró PDF: ${errorPdf.message}`);
  const { error: errorEnviar } = await admin.rpc('enviar_revision', {
    p_revision_id: revisionId, p_canal: 'correo', p_destino: 'compras@cliente.mx', p_actor: usuarioId,
  });
  if (errorEnviar) throw new Error(`No se envió: ${errorEnviar.message}`);
  const { error: errorAceptar } = await admin.rpc('aceptar_revision', {
    p_revision_id: revisionId,
    p_datos: {
      actualizado_en: await leerRevision(), canal: 'correo', destino: 'compras@cliente.mx',
      // C4.1: aceptar confirma la fecha compromiso comercial.
      fecha_compromiso_comercial: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    } as Json,
    p_actor: usuarioId,
  });
  if (errorAceptar) throw new Error(`No se aceptó: ${errorAceptar.message}`);

  const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
    codigo: `B5-LASER-${sufijo.toUpperCase()}`, area: 'sheet_metal', nombre: `Láser B5 ${sufijo}`,
  }).select('id').single();
  if (errorRecurso || !recurso) throw new Error(`Sin recurso: ${errorRecurso?.message}`);

  return {
    admin, correo, contrasena, usuarioId, clienteId: cliente.id, rfqId: rfq.id,
    propuestaId, revisionId, recursoId: recurso.id, operadorId,
    ordenId: '', ordenFolioSii: '', ordenTiId: '',
  };
}

async function limpiarContexto(contexto: Contexto): Promise<void> {
  const { admin } = contexto;
  const ordenes = [contexto.ordenId, contexto.ordenTiId].filter((id) => id !== '');
  for (const ordenId of ordenes) {
    const { data: partidas } = await admin.from('partidas_orden_produccion').select('id').eq('orden_id', ordenId);
    const ids = (partidas ?? []).map((fila) => fila.id);
    if (ids.length > 0) {
      await admin.from('registros_avance_partida').delete().in('partida_id', ids);
      await admin.from('metas_proceso_partida').delete().in('partida_id', ids);
    }
    const { data: notas } = await admin.from('notas_entrega').select('id').eq('orden_id', ordenId);
    const notaIds = (notas ?? []).map((fila) => fila.id);
    if (notaIds.length > 0) await admin.from('partidas_nota_entrega').delete().in('nota_entrega_id', notaIds);
    await admin.from('notas_entrega').delete().eq('orden_id', ordenId);
    await admin.from('cuentas_por_cobrar').delete().eq('orden_id', ordenId);
    await admin.from('sesiones_trabajo').delete().eq('orden_id', ordenId);
    await admin.from('programacion_areas').delete().eq('orden_id', ordenId);
    await admin.from('orden_eventos_cambio').delete().eq('orden_id', ordenId);
    await admin.from('ordenes_produccion').delete().eq('id', ordenId);
  }
  await admin.from('propuestas').delete().eq('rfq_id', contexto.rfqId);
  await admin.from('pipeline').delete().eq('id', contexto.rfqId);
  await admin.from('recursos_planeacion').delete().eq('id', contexto.recursoId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().in('usuario_id', [contexto.usuarioId, contexto.operadorId]);
  await admin.from('usuarios').delete().in('id', [contexto.usuarioId, contexto.operadorId]);
  await admin.auth.admin.deleteUser(contexto.operadorId);
  await admin.auth.admin.deleteUser(contexto.usuarioId);
}

test.describe('Órdenes SII-B5 ola 2: estados derivados y acciones de negocio', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si y credenciales del stack local.',
  );

  test('revisión aceptada → planificar → liberar → producir → cerrar + TI cancelada', async ({ page }) => {
    const contexto = await prepararContexto();
    const { admin } = contexto;
    try {
      await iniciarSesion(page, contexto.correo, contexto.contrasena);
      await page.goto('/ordenes');
      await expect(page.getByTestId('tabla-ordenes')).toBeVisible();

      // Alta desde revisión aceptada (acción existente, UI nueva).
      await page.getByTestId('abrir-alta-desde-revision').click();
      await page.getByTestId('seleccion-revision').selectOption(contexto.revisionId);
      await page.getByTestId('confirmar-alta-desde-revision').click();
      await expect(page.getByTestId('alta-mensaje')).toContainText('Orden O-');
      await expect.poll(async () => {
        const { data } = await admin.from('ordenes_produccion')
          .select('id, folio_sii, estado_sii').eq('propuesta_revision_id', contexto.revisionId).maybeSingle();
        return data?.estado_sii ?? null;
      }).toBe('CONFIRMADA');
      const { data: orden } = await admin.from('ordenes_produccion')
        .select('id, folio_sii').eq('propuesta_revision_id', contexto.revisionId).single();
      contexto.ordenId = orden!.id;
      contexto.ordenFolioSii = orden!.folio_sii!;
      const folio = contexto.ordenFolioSii;
      const fila = page.getByTestId(`fila-orden-${folio}`);
      await expect(fila).toBeVisible();
      await expect(page.getByTestId(`estado-orden-${folio}`)).toContainText('Confirmada');
      await expect(fila.getByRole('button', { name: 'Iniciar', exact: true })).toHaveCount(0);
      await expect(fila.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
      await expect(fila.getByRole('button', { name: 'Procesos', exact: true })).toHaveCount(0);
      await expect(fila.getByRole('button', { name: /Seleccionar|Quitar selección/u })).toHaveCount(0);
      await expect(fila.getByRole('button', { name: 'Comentarios', exact: true })).toBeVisible();
      await expect(fila.getByRole('button', { name: /Documento/u })).toBeVisible();

      // Programar todas las partidas (paso de Planeación) → PLANIFICADA.
      const { data: partidas } = await admin.from('partidas_orden_produccion')
        .select('id, cantidad_solicitada').eq('orden_id', contexto.ordenId);
      for (const partida of partidas ?? []) {
        await admin.from('programacion_areas').insert({
          orden_id: contexto.ordenId, partida_id: partida.id, recurso_id: contexto.recursoId,
          fecha_programada: '2099-12-30', turno: 'matutino', horas_estimadas: 1, secuencia: 1,
        });
      }
      await expect.poll(async () => {
        const { data } = await admin.from('ordenes_produccion').select('estado_sii').eq('id', contexto.ordenId).single();
        return data?.estado_sii;
      }).toBe('PLANIFICADA');
      await page.reload();
      await expect(page.getByTestId(`estado-orden-${folio}`)).toContainText('Planificada');

      // Liberar desde la cola (acción de negocio) → LISTA.
      await page.getByTestId(`liberar-orden-${folio}`).click();
      await expect(page.getByTestId('ordenes-mensaje')).toContainText('liberada');
      await expect.poll(async () => {
        const { data } = await admin.from('ordenes_produccion').select('estado_sii').eq('id', contexto.ordenId).single();
        return data?.estado_sii;
      }).toBe('LISTA');
      await expect(page.getByTestId(`estado-orden-${folio}`)).toContainText('Lista');

      // Primera sesión de piso (B6) → EN_PRODUCCION (sin botón manual).
      const { data: programaciones } = await admin.from('programacion_areas')
        .select('id, partida_id').eq('orden_id', contexto.ordenId).limit(1);
      await admin.from('sesiones_trabajo').insert({
        orden_id: contexto.ordenId, partida_id: programaciones![0].partida_id,
        programacion_id: programaciones![0].id, operador_id: contexto.operadorId,
      });
      await expect.poll(async () => {
        const { data } = await admin.from('ordenes_produccion').select('estado_sii').eq('id', contexto.ordenId).single();
        return data?.estado_sii;
      }).toBe('EN_PRODUCCION');
      await page.reload();
      await expect(page.getByTestId(`estado-orden-${folio}`)).toContainText('En producción');

      // Metas cumplidas (avance de piso) → PRODUCCION_COMPLETADA.
      // Si la orden no trae metas (no pasó por configuración de ruteo), se crea
      // una meta equivalente por partida para poder cumplir el 100 %.
      const metas = (await admin.from('metas_proceso_partida')
        .select('id, partida_id, meta_piezas').in('partida_id', (partidas ?? []).map((p) => p.id))).data ?? [];
      if (metas.length === 0) {
        for (const partida of partidas ?? []) {
          const { data: meta, error: errorMeta } = await admin.from('metas_proceso_partida').insert({
            partida_id: partida.id, secuencia: 1, nombre: 'Corte', meta_piezas: partida.cantidad_solicitada,
          }).select('id, partida_id, meta_piezas').single();
          if (errorMeta || !meta) throw new Error(`Sin meta de partida: ${errorMeta?.message}`);
          metas.push(meta);
        }
      }
      for (const meta of metas) {
        const { error: errorAvance } = await admin.from('registros_avance_partida').insert({
          partida_id: meta.partida_id, operador_id: contexto.operadorId,
          cantidad_producida: meta.meta_piezas, cantidad_scrap: 0, meta_proceso_id: meta.id,
        });
        if (errorAvance) throw new Error(`Sin avance de meta: ${errorAvance.message}`);
      }
      // Espejo de `cantidad_producida` como lo haría la RPC de piso al cumplir la meta final.
      for (const partida of partidas ?? []) {
        const { error: errorProducida } = await admin.from('partidas_orden_produccion')
          .update({ cantidad_producida: partida.cantidad_solicitada }).eq('id', partida.id);
        if (errorProducida) throw new Error(`Sin cantidad producida: ${errorProducida.message}`);
      }
      await expect.poll(async () => {
        const { data } = await admin.from('ordenes_produccion').select('estado_sii').eq('id', contexto.ordenId).single();
        return data?.estado_sii;
      }).toBe('PRODUCCION_COMPLETADA');

      // 100 % entregado por la RPC B7 (folio NE, ITxx e idempotencia) + cierre administrativo.
      const renglones = (partidas ?? []).map((partida) => ({
        partida_id: partida.id, cantidad_entregada: partida.cantidad_solicitada,
      }));
      const { error: errorEntrega } = await admin.rpc('registrar_entrega', {
        p_orden_id: contexto.ordenId,
        p_renglones: renglones as unknown as Json,
        p_recibido_por: 'Recepción B5',
        p_entregado_por: contexto.usuarioId,
        p_solicitud_id: randomUUID(),
        p_actor: contexto.usuarioId,
      });
      if (errorEntrega) throw new Error(`Sin entrega: ${errorEntrega.message}`);
      await page.reload();
      // La entrega total archiva la orden (OBS-21): el cierre administrativo se
      // ejecuta desde la bandeja Archivo.
      await page.getByTestId('bandeja-archivo').click();
      await expect(page.getByTestId(`fila-orden-${folio}`)).toBeVisible();
      await page.getByTestId(`cerrar-administrativa-${folio}`).click();
      await page.getByTestId('confirmar-cierre-administrativo').click();
      await expect(page.getByTestId('ordenes-mensaje')).toContainText('cerrada');
      await expect.poll(async () => {
        const { data } = await admin.from('ordenes_produccion').select('estado_sii').eq('id', contexto.ordenId).single();
        return data?.estado_sii;
      }).toBe('CERRADA');
      await expect(page.getByTestId(`estado-orden-${folio}`)).toContainText('Cerrada');

      // Ficha: snapshot, partidas ITxx, actividad y documento.
      await page.getByTestId(`abrir-ficha-${folio}`).click();
      await page.waitForURL((url) => url.pathname === `/ordenes/${contexto.ordenId}`);
      await expect(page.getByTestId('ficha-orden')).toBeVisible();
      await expect(page.getByTestId('ficha-estado')).toContainText('Cerrada');
      await page.getByTestId('ficha-pestana-partidas').click();
      await expect(page.getByTestId('ficha-panel-partidas')).toContainText('IT01');
      await page.getByTestId('ficha-pestana-actividad').click();
      await expect(page.getByTestId('ficha-panel-actividad')).toContainText('orden_creada');
      await page.getByTestId('ficha-pestana-documento').click();
      await expect(page.getByTestId('ficha-panel-documento')).toContainText(`Orden de servicio ${folio}`);

      // Orden interna (TI) creada desde la UI y cancelada con motivo.
      await page.goto('/ordenes');
      await page.getByTestId('abrir-alta-interna').click();
      await page.getByTestId('interna-motivo').fill('Mantenimiento interno E2E');
      await page.getByTestId('interna-item-descripcion-0').fill('Base TI E2E');
      await page.getByTestId('interna-item-cantidad-0').fill('1');
      await page.getByTestId('confirmar-alta-interna').click();
      await expect(page.getByTestId('alta-mensaje')).toContainText('Orden interna OI-');
      // La TI no lleva cliente: se identifica por el folio SII del mensaje.
      const textoAltaInterna = (await page.getByTestId('alta-mensaje').textContent()) ?? '';
      const folioTi = textoAltaInterna.match(/OI-\d{4}_\d{2,3}/)?.[0];
      if (!folioTi) throw new Error(`Sin folio TI en el mensaje: ${textoAltaInterna}`);
      await expect.poll(async () => {
        const { data } = await admin.from('ordenes_produccion')
          .select('id').eq('folio_sii', folioTi).maybeSingle();
        return data?.id ?? null;
      }).not.toBeNull();
      const { data: ti } = await admin.from('ordenes_produccion')
        .select('id, folio_sii').eq('folio_sii', folioTi).single();
      contexto.ordenTiId = ti!.id;
      await page.reload();
      const filaTi = page.getByTestId(`fila-orden-${folioTi}`);
      await filaTi.getByTestId('cambiar-estado-cancelada').click();
      await page.getByLabel('Motivo (mínimo 3 caracteres)').fill('Cancelación E2E');
      await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
      await expect.poll(async () => {
        const { data } = await admin.from('ordenes_produccion').select('estado_sii').eq('id', contexto.ordenTiId).single();
        return data?.estado_sii;
      }).toBe('CANCELADA');
      await expect(page.getByTestId(`estado-orden-${folioTi}`)).toContainText('Cancelada');

      // Capturas 1440/768 × claro/oscuro de la cola con ambos chips.
      mkdirSync('.ai-shared/qa/sii-b5-orden/visual', { recursive: true });
      for (const [nombre, ancho, alto] of [
        ['escritorio', 1440, 900],
        ['tableta', 768, 1024],
      ] as const) {
        await page.setViewportSize({ width: ancho, height: alto });
        for (const tema of ['claro', 'oscuro'] as const) {
          await page.locator('html').evaluate(
            (elemento, oscuro) => elemento.classList.toggle('dark', oscuro), tema === 'oscuro',
          );
          await page.screenshot({
            path: `.ai-shared/qa/sii-b5-orden/visual/ordenes-estados-${nombre}-${tema}.png`,
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
