import { describe, expect, it } from 'vitest';
import {
  calcularBytesBase64,
  ErrorOcr,
  extraerDatosComprobante,
  extraerObjetoJson,
  type OpcionesOcr,
} from '@/modulos/gastos/servicios/ocr-servicio';
import type { ComprobanteOCRInput } from '@/modulos/gastos/validaciones/gastos';

type FetchStub = (entrada: RequestInfo | URL, opciones?: RequestInit) => Promise<Response>;

const datosValidos = {
  proveedorSugerido: 'Proveedor de prueba',
  rfc: 'XAXX010101000',
  folioFactura: 'FAC-001',
  montoSubtotal: 100,
  montoIva: 16,
  montoTotal: 116,
  moneda: 'MXN',
  fechaEmision: '2026-09-01',
  confianza: 0.94,
  advertencias: [],
};

function crearRespuesta(texto: string, estado = 200): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: texto } }] }),
    { status: estado, headers: { 'content-type': 'application/json' } },
  );
}

describe('OCR de comprobantes con OpenRouter', () => {
  it('calcula bytes base64 y extrae JSON rodeado de cercas', () => {
    expect(calcularBytesBase64('YWJj')).toBe(3);
    expect(calcularBytesBase64('YQ==')).toBe(1);
    expect(extraerObjetoJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('envía la imagen a OpenRouter y valida la respuesta tipada', async () => {
    let url: RequestInfo | URL | undefined;
    let opciones: RequestInit | undefined;
    const fetchImpl: FetchStub = async (entrada, init) => {
      url = entrada;
      opciones = init;
      return crearRespuesta(JSON.stringify(datosValidos));
    };
    const resultado = await extraerDatosComprobante(
      { contenidoBase64: 'aGVsbG8=', tipoMime: 'image/png' },
      { apiKey: 'secreto-de-prueba', modelo: 'modelo-prueba', fetchImpl },
    );

    expect(resultado).toEqual(datosValidos);
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(opciones?.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer secreto-de-prueba',
      'x-title': 'ORCA MFG ERP',
    });
    const cuerpo = JSON.parse(String(opciones?.body)) as {
      model: string;
      messages: Array<{ content: Array<{ type: string; image_url?: { url?: string } }> }>;
    };
    expect(cuerpo.model).toBe('modelo-prueba');
    expect(cuerpo.messages[1]?.content[0]).toMatchObject({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,aGVsbG8=' },
    });
  });

  it('rechaza PDF (solo imágenes), configuración ausente y entrada inválida', async () => {
    const apiKeyOriginal = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      await expect(extraerDatosComprobante(
        { contenidoBase64: 'YQ==', tipoMime: 'image/png' },
        { fetchImpl: async () => crearRespuesta('{}') },
      )).rejects.toMatchObject({ codigo: 'configuracion_faltante' });
    } finally {
      if (apiKeyOriginal) process.env.OPENROUTER_API_KEY = apiKeyOriginal;
    }

    await expect(extraerDatosComprobante(
      { contenidoBase64: 'JVBERiQ=', tipoMime: 'application/pdf' } as unknown as ComprobanteOCRInput,
      { apiKey: 'secreto-de-prueba', fetchImpl: async () => crearRespuesta('{}') },
    )).rejects.toMatchObject({ codigo: 'comprobante_invalido' });

    await expect(extraerDatosComprobante(
      { contenidoBase64: 'no-base64', tipoMime: 'image/png' },
      { apiKey: 'secreto-de-prueba', fetchImpl: async () => crearRespuesta('{}') },
    )).rejects.toMatchObject({ codigo: 'comprobante_invalido' });
  });

  it('rechaza tamaño excedido, proveedor no disponible y salida ilegible', async () => {
    const opcionesBase: OpcionesOcr = {
      apiKey: 'secreto-de-prueba',
      fetchImpl: async () => crearRespuesta('{}'),
    };
    await expect(extraerDatosComprobante(
      { contenidoBase64: 'aGVsbG8=', tipoMime: 'image/png' },
      { ...opcionesBase, tamanoMaximoBytes: 2 },
    )).rejects.toMatchObject({ codigo: 'comprobante_excede_limite' });
    await expect(extraerDatosComprobante(
      { contenidoBase64: 'YQ==', tipoMime: 'image/png' },
      { ...opcionesBase, fetchImpl: async () => crearRespuesta('{}', 503) },
    )).rejects.toMatchObject({ codigo: 'proveedor_no_disponible' });
    await expect(extraerDatosComprobante(
      { contenidoBase64: 'YQ==', tipoMime: 'image/png' },
      { ...opcionesBase, fetchImpl: async () => crearRespuesta('{"montoTotal":"no-numero"}') },
    )).rejects.toMatchObject({ codigo: 'respuesta_ilegible' });
    expect(new ErrorOcr('respuesta_ilegible')).toBeInstanceOf(Error);
  });

  it('mantiene el timeout activo mientras se lee la respuesta del proveedor', async () => {
    const fetchImpl: FetchStub = async (_entrada, init) => ({
      ok: true,
      json: () => new Promise((_resolver, rechazar) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('abortado');
          error.name = 'AbortError';
          rechazar(error);
        }, { once: true });
      }),
    } as Response);

    await expect(extraerDatosComprobante(
      { contenidoBase64: 'YQ==', tipoMime: 'image/png' },
      { apiKey: 'secreto-de-prueba', fetchImpl, timeoutMs: 20 },
    )).rejects.toMatchObject({ codigo: 'tiempo_agotado' });
  });
});
