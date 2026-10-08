import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';

import type { Database } from '@/compartido/tipos/supabase';
import {
  listarDocumentosOrden,
  obtenerOrdenDocumental,
} from '@/modulos/produccion/servicios/documentos-orden-servicio';

import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

const { describir: suite, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'C2.3 documentos congelados de Orden',
);

suite('snapshot documental hacia Producción', () => {
  let admin: SupabaseClient<Database>;
  const sufijo = randomUUID().slice(0, 8);
  const clienteId = randomUUID();
  const ordenId = randomUUID();
  const rfqItemId = randomUUID();
  const idsArchivo: string[] = [];

  beforeAll(async () => {
    admin = crearClienteServicio();
    const { error: errorCliente } = await admin.from('clientes').insert({
      id: clienteId,
      nombre_comercial: `Cliente C23 ${sufijo}`,
      razon_social: `Cliente C23 ${sufijo} SA de CV`,
      estado: 'activo',
    });
    if (errorCliente) throw errorCliente;

    const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', {
      p_prefijo: 'OP',
    });
    if (errorFolio || !folio) throw errorFolio ?? new Error('Sin folio de Orden');
    const { error: errorOrden } = await admin.from('ordenes_produccion').insert({
      id: ordenId,
      folio,
      cliente_id: clienteId,
      estado: 'programada',
      prioridad: 'normal',
      fecha_compromiso: '2099-12-31T18:00:00.000Z',
    });
    if (errorOrden) throw errorOrden;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from('logs').delete().eq('recurso_id', ordenId).eq('accion', 'subir_documento_orden');
    if (idsArchivo.length > 0) await admin.from('archivos').delete().in('id', idsArchivo);
    await admin.from('ordenes_produccion').delete().eq('id', ordenId);
    await admin.from('clientes').delete().eq('id', clienteId);
  });

  it('mantiene disponible la versión exacta aceptada y no incorpora reemplazos posteriores', async () => {
    const base = {
      entidad: 'rfq_item' as const,
      entidad_id: rfqItemId,
      clase: 'CAD',
      nombre_original: 'pieza-c23.dxf',
      nombre_erp: 'pieza-c23.dxf',
      bucket: 'adjuntos-cotizacion',
      mime: 'application/dxf',
      tamano_bytes: 2 * 1024 * 1024,
    };
    const { data: version1, error: errorV1 } = await admin
      .from('archivos')
      .insert({ ...base, ruta_storage: `rfq_item/${rfqItemId}/v1-${sufijo}.dxf` })
      .select('id')
      .single();
    if (errorV1 || !version1) throw errorV1 ?? new Error('Sin versión 1');
    idsArchivo.push(version1.id);

    const { data: version2, error: errorV2 } = await admin
      .from('archivos')
      .insert({ ...base, ruta_storage: `rfq_item/${rfqItemId}/v2-${sufijo}.dxf` })
      .select('id')
      .single();
    if (errorV2 || !version2) throw errorV2 ?? new Error('Sin versión 2');
    idsArchivo.push(version2.id);

    const { data: propio, error: errorPropio } = await admin
      .from('archivos')
      .insert({
        entidad: 'orden',
        entidad_id: ordenId,
        clase: 'OTROS',
        nombre_original: 'instruccion-orden.pdf',
        nombre_erp: 'instruccion-orden.pdf',
        bucket: 'adjuntos-cotizacion',
        ruta_storage: `orden/${ordenId}/instruccion-${sufijo}.pdf`,
        mime: 'application/pdf',
        tamano_bytes: 256,
      })
      .select('id')
      .single();
    if (errorPropio || !propio) throw errorPropio ?? new Error('Sin archivo de Orden');
    idsArchivo.push(propio.id);

    const { data: propioV2, error: errorPropioV2 } = await admin
      .from('archivos')
      .insert({
        entidad: 'orden',
        entidad_id: ordenId,
        clase: 'OTROS',
        nombre_original: 'instruccion-orden.pdf',
        nombre_erp: 'instruccion-orden.pdf',
        bucket: 'adjuntos-cotizacion',
        ruta_storage: `orden/${ordenId}/instruccion-v2-${sufijo}.pdf`,
        mime: 'application/pdf',
        tamano_bytes: 512,
      })
      .select('id')
      .single();
    if (errorPropioV2 || !propioV2) throw errorPropioV2 ?? new Error('Sin archivo v2 de Orden');
    idsArchivo.push(propioV2.id);

    const rutaLegacy = `rfq/${randomUUID()}/documento-piso-${sufijo}.pdf`;
    const { data: propioLegacy, error: errorPropioLegacy } = await admin
      .from('archivos')
      .insert({
        entidad: 'rfq',
        entidad_id: randomUUID(),
        clase: 'OTROS',
        nombre_original: 'documento-piso-anterior.pdf',
        nombre_erp: 'documento-piso-anterior.pdf',
        bucket: 'adjuntos-cotizacion',
        ruta_storage: rutaLegacy,
        mime: 'application/pdf',
        tamano_bytes: 128,
      })
      .select('id')
      .single();
    if (errorPropioLegacy || !propioLegacy) {
      throw errorPropioLegacy ?? new Error('Sin archivo legado de piso');
    }
    idsArchivo.push(propioLegacy.id);
    const { error: errorLogLegacy } = await admin.from('logs').insert({
      nombre_usuario: `C2.3 ${sufijo}`,
      rol: 'admin',
      accion: 'subir_documento_orden',
      modulo: 'produccion',
      recurso_id: ordenId,
      detalles: { ruta: rutaLegacy },
    });
    if (errorLogLegacy) throw errorLogLegacy;

    const archivoFaltanteId = randomUUID();

    const snapshot = {
      version: 1,
      orden_id: ordenId,
      origen: {},
      cabecera: {},
      items: [],
      archivos: [
        { archivo_id: version1.id },
        { archivo_id: archivoFaltanteId, nombre_original: 'plano-no-disponible.step' },
      ],
    };
    const { error: errorSnapshot } = await admin
      .from('ordenes_produccion')
      .update({ snapshot_json: snapshot })
      .eq('id', ordenId);
    if (errorSnapshot) throw errorSnapshot;

    const orden = await obtenerOrdenDocumental(admin, ordenId);
    expect(orden).not.toBeNull();
    const documentos = await listarDocumentosOrden(admin, orden!);

    expect(documentos.map((documento) => documento.id)).toEqual(
      expect.arrayContaining([
        version1.id,
        propio.id,
        propioV2.id,
        propioLegacy.id,
        archivoFaltanteId,
      ]),
    );
    expect(documentos.map((documento) => documento.id)).not.toContain(version2.id);
    expect(documentos.find((documento) => documento.id === version1.id)).toMatchObject({
      vigente: false,
      congelado: true,
      origen: 'rfq_item',
    });
    expect(documentos.find((documento) => documento.id === propio.id)).toMatchObject({
      vigente: false,
      congelado: false,
      origen: 'orden',
      disponible: true,
    });
    expect(documentos.find((documento) => documento.id === propioV2.id)).toMatchObject({
      vigente: true,
      version: 2,
      origen: 'orden',
    });
    expect(documentos.find((documento) => documento.id === propioLegacy.id)).toMatchObject({
      origen: 'orden_legacy',
      disponible: true,
    });
    expect(documentos.find((documento) => documento.id === archivoFaltanteId)).toMatchObject({
      nombre: 'plano-no-disponible.step',
      congelado: true,
      disponible: false,
    });
  });
});
