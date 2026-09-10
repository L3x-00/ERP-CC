import { describe, expect, it } from 'vitest';
import {
  calcularBytesBase64,
  ErrorOcr,
  extraerDatosComprobante,
  extraerObjetoJson,
  type OpcionesOcr,
} from '@/modulos/gastos/servicios/ocr-servicio';

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
  return new Response(JSON.stringify({ content: [{ type: 'text', text: texto }] }), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OCR de comprobantes', () => {
  it('calcula bytes base64 y extrae JSON rodeado de cercas', () => {
    expect(calcularBytesBase64('YWJj')).toBe(3);
    expect(calcularBytesBase64('YQ==')).toBe(1);
    expect(extraerObjetoJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('envía imágenes a Anthropic y valida la respuesta tipada', async () => {
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
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opciones?.headers).toEqual({
      'content-type': 'application/json',
      'x-api-key': 'secreto-de-prueba',
      'anthropic-version': '2023-06-01',
    });
    const cuerpo = JSON.parse(String(opciones?.body)) as {
      model: string;
      messages: Array<{ content: Array<{ type: string; source?: { media_type?: string; data?: string } }> }>;
    };
    expect(cuerpo.model).toBe('modelo-prueba');
    expect(cuerpo.messages[0]?.content[0]).toMatchObject({
      type: 'image',
      source: { media_type: 'image/png', data: 'aGVsbG8=' },
    });
  });

  it('usa contenido document para PDF y rechaza configuración ausente', async () => {
    let opciones: RequestInit | undefined;
    const fetchImpl: FetchStub = async (_entrada, init) => {
      opciones = init;
      return crearRespuesta(JSON.stringify(datosValidos));
    };
    await extraerDatosComprobante(
      { contenidoBase64: 'JVBERiQ=', tipoMime: 'application/pdf' },
      { apiKey: 'secreto-de-prueba', fetchImpl },
    );
    const cuerpo = JSON.parse(String(opciones?.body)) as {
      messages: Array<{ content: Array<{ type: string; source?: { media_type?: string } }> }>;
    };
    expect(cuerpo.messages[0]?.content[0]).toMatchObject({
      type: 'document',
      source: { media_type: 'application/pdf' },
    });

    await expect(extraerDatosComprobante({ contenidoBase64: 'YQ==', tipoMime: 'image/png' }, { fetchImpl: async () => crearRespuesta('{}') }))
      .rejects.toMatchObject({ codigo: 'configuracion_faltante' });
  });

  it('rechaza entrada inválida, tamaño excedido, proveedor no disponible y salida ilegible', async () => {
    const opcionesBase: OpcionesOcr = { apiKey: 'secreto-de-prueba', fetchImpl: async () => crearRespuesta('{}') };
    await expect(extraerDatosComprobante({ contenidoBase64: 'no-base64', tipoMime: 'image/png' }, opcionesBase))
      .rejects.toMatchObject({ codigo: 'comprobante_invalido' });
    await expect(extraerDatosComprobante({ contenidoBase64: 'aGVsbG8=', tipoMime: 'image/png' }, { ...opcionesBase, tamanoMaximoBytes: 2 }))
      .rejects.toMatchObject({ codigo: 'comprobante_excede_limite' });
    await expect(extraerDatosComprobante({ contenidoBase64: 'YQ==', tipoMime: 'image/png' }, { ...opcionesBase, fetchImpl: async () => crearRespuesta('{}', 503) }))
      .rejects.toMatchObject({ codigo: 'proveedor_no_disponible' });
    await expect(extraerDatosComprobante({ contenidoBase64: 'YQ==', tipoMime: 'image/png' }, { ...opcionesBase, fetchImpl: async () => crearRespuesta('{"montoTotal":"no-numero"}') }))
      .rejects.toMatchObject({ codigo: 'respuesta_ilegible' });
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
