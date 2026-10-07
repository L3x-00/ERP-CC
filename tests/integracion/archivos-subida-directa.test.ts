import { randomUUID } from 'node:crypto';
import { type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import {
  confirmarSubidaDirecta,
  descartarSubidaDirecta,
  prepararSubidaDirecta,
  verificarSubidaDirecta,
} from '@/nucleo/almacenamiento/archivos/subida-directa';
import { BUCKET_ADJUNTOS } from '@/nucleo/almacenamiento/constantes';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// H-B1-29: el binario viaja del navegador a Storage con una URL firmada; las
// Server Actions solo reciben metadatos. Fixtures únicamente en el stack local.
const { describir: suite, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'subida directa a Storage (H-B1-29)',
);

const DOS_MIB = 2 * 1024 * 1024;

suite('preparar → subir directo → verificar → descartar', () => {
  let admin: SupabaseClient<Database>;
  let navegador: SupabaseClient<Database>;
  const entidadId = randomUUID();
  const usuarioId = randomUUID();
  const rutasCreadas: string[] = [];

  beforeAll(() => {
    admin = crearClienteServicio();
    navegador = crearClienteAnonimo();
  });

  afterAll(async () => {
    if (admin && rutasCreadas.length) await admin.storage.from(BUCKET_ADJUNTOS).remove(rutasCreadas);
  });

  async function preparar(nombre: string, tamano: number, mime: string, propietario = usuarioId) {
    return prepararSubidaDirecta(admin, {
      bucket: BUCKET_ADJUNTOS, entidad: 'rfq', entidadId, usuarioId: propietario,
      solicitud: { nombre, tamano, mime },
    });
  }

  async function subir(nombre: string, tamano: number, mime: string, propietario = usuarioId): Promise<string> {
    const preparada = await preparar(nombre, tamano, mime, propietario);
    if (!preparada.ok) throw new Error(preparada.error);
    rutasCreadas.push(preparada.datos.ruta);
    const { error } = await navegador.storage.from(BUCKET_ADJUNTOS).uploadToSignedUrl(
      preparada.datos.ruta,
      preparada.datos.token,
      new Blob([new Uint8Array(tamano)], { type: mime }),
      { contentType: preparada.datos.mime },
    );
    if (error) throw error;
    return preparada.datos.ruta;
  }

  function verificar(ruta: string, nombre: string, ids = { entidadId, usuarioId }) {
    return verificarSubidaDirecta(admin, { bucket: BUCKET_ADJUNTOS, entidad: 'rfq', ruta, nombre, ...ids });
  }

  async function vincular(ruta: string, nombre: string, objeto = { tamano: 1024, mime: 'application/pdf' }) {
    const { data, error } = await admin.from('archivos').insert({
      entidad: 'rfq', entidad_id: entidadId, clase: 'OTROS', nombre_original: nombre,
      nombre_erp: `${randomUUID()}-${nombre}`, bucket: BUCKET_ADJUNTOS, ruta_storage: ruta,
      mime: objeto.mime, tamano_bytes: objeto.tamano,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  }

  function confirmar(
    ruta: string,
    nombre: string,
    registrar: (objeto: { tamano: number; mime: string }) => Promise<unknown> = (objeto) =>
      vincular(ruta, nombre, objeto),
  ) {
    return confirmarSubidaDirecta(
      admin,
      { bucket: BUCKET_ADJUNTOS, entidad: 'rfq', entidadId, usuarioId, ruta, nombre },
      registrar,
    );
  }

  async function existe(ruta: string): Promise<boolean> {
    const corte = ruta.lastIndexOf('/');
    const { data } = await admin.storage
      .from(BUCKET_ADJUNTOS)
      .list(ruta.slice(0, corte), { search: ruta.slice(corte + 1) });
    return Boolean(data?.some((objeto) => objeto.name === ruta.slice(corte + 1)));
  }

  it('acepta y verifica un plano de 2 MiB que nunca pasa por una Server Action', async () => {
    const ruta = await subir('plano.pdf', DOS_MIB, 'application/pdf');
    expect(await verificar(ruta, 'plano.pdf')).toEqual({
      ok: true,
      datos: { tamano: DOS_MIB, mime: 'application/pdf' },
    });
  });

  it('liga la ruta firmada a entidad, registro y usuario', async () => {
    const ruta = await subir('plano-2.pdf', 1024, 'application/pdf');
    expect(ruta.startsWith(`rfq/${entidadId}/${usuarioId}/`)).toBe(true);
    expect((await verificar(ruta, 'plano-2.pdf', { entidadId: randomUUID(), usuarioId })).ok).toBe(false);
    expect((await verificar(ruta, 'plano-2.pdf', { entidadId, usuarioId: randomUUID() })).ok).toBe(false);
    expect((await verificar(ruta, 'plano-2.dxf')).ok).toBe(false);
  });

  it('rechaza preparar archivos fuera del perfil de la entidad', async () => {
    expect((await preparar('enorme.pdf', 21 * 1024 * 1024, 'application/pdf')).ok).toBe(false);
    expect((await preparar('programa.exe', 10, 'application/octet-stream')).ok).toBe(false);
    expect((await preparar('vacio.pdf', 0, 'application/pdf')).ok).toBe(false);
  });

  it('falla cerrado si el objeto real no existe', async () => {
    const preparada = await preparar('nunca-subido.pdf', 100, 'application/pdf');
    if (!preparada.ok) throw new Error(preparada.error);
    expect((await verificar(preparada.datos.ruta, 'nunca-subido.pdf')).ok).toBe(false);
  });

  it('descartar solo borra cargas propias que no estén vinculadas', async () => {
    const ruta = await subir('borrador.pdf', 1024, 'application/pdf');
    expect((await descartarSubidaDirecta(admin, { bucket: BUCKET_ADJUNTOS, ruta, usuarioId: randomUUID() })).ok)
      .toBe(false);
    expect((await descartarSubidaDirecta(admin, { bucket: BUCKET_ADJUNTOS, ruta, usuarioId })).ok).toBe(true);
    expect((await verificar(ruta, 'borrador.pdf')).ok).toBe(false);
  });

  it('descartar nunca borra un archivo ya vinculado al modelo único', async () => {
    const ruta = await subir('vinculado.pdf', 1024, 'application/pdf');
    await vincular(ruta, 'vinculado.pdf');
    expect((await descartarSubidaDirecta(admin, { bucket: BUCKET_ADJUNTOS, ruta, usuarioId })).ok).toBe(false);
    expect(await existe(ruta)).toBe(true);
  });

  it('confirmar vincula con el tamaño y MIME reales del objeto', async () => {
    const ruta = await subir('plano-confirmado.pdf', DOS_MIB, 'application/pdf');
    const registrar = vi.fn(async (objeto: { tamano: number; mime: string }) => objeto);
    expect(await confirmar(ruta, 'plano-confirmado.pdf', registrar)).toEqual({
      ok: true,
      datos: { tamano: DOS_MIB, mime: 'application/pdf' },
    });
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it('confirmar repetido falla cerrado y conserva el archivo ya vinculado', async () => {
    const ruta = await subir('repetido.pdf', 2048, 'application/pdf');
    expect((await confirmar(ruta, 'repetido.pdf')).ok).toBe(true);
    expect(await confirmar(ruta, 'repetido.pdf')).toEqual({ ok: false, error: 'El archivo ya está vinculado' });
    expect(await existe(ruta)).toBe(true);
  });

  it('confirmar limpia la carga propia si la vinculación falla', async () => {
    const ruta = await subir('sin-vinculo.pdf', 2048, 'application/pdf');
    const resultado = await confirmar(ruta, 'sin-vinculo.pdf', async () => {
      throw new Error('fallo de registro');
    });
    expect(resultado).toEqual({ ok: false, error: 'No se pudo registrar el archivo' });
    expect(await existe(ruta)).toBe(false);
  });

  it('confirmar limpia la carga propia inconsistente y nunca toca una ruta ajena', async () => {
    const propia = await subir('propio.pdf', 1024, 'application/pdf');
    expect((await confirmar(propia, 'propio.dxf')).ok).toBe(false);
    expect(await existe(propia)).toBe(false);

    const ajena = await subir('ajeno.pdf', 1024, 'application/pdf', randomUUID());
    expect((await confirmar(ajena, 'ajeno.pdf')).ok).toBe(false);
    expect(await existe(ajena)).toBe(true);
  });
});
