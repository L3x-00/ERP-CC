import { describe, expect, it } from 'vitest';
import {
  enviarCorreoTransaccional,
  ErrorCorreo,
  type OpcionesCorreo,
} from '@/nucleo/correo/indice';

type FetchStub = (entrada: RequestInfo | URL, opciones?: RequestInit) => Promise<Response>;

const ENTRADA = {
  destinatario: 'cliente@orca.test',
  nombreDestinatario: 'Cliente de pruebas',
  asunto: 'Te mencionaron en un comentario',
  html: '<p>Hola</p>',
  texto: 'Hola',
};

function opcionesBase(fetchImpl: FetchStub): OpcionesCorreo {
  return { apiKey: 'clave-de-prueba', remitente: 'erp@orca.test', fetchImpl };
}

describe('correo transaccional con Brevo', () => {
  it('envía el correo y devuelve el identificador del proveedor', async () => {
    let url: RequestInfo | URL | undefined;
    let opciones: RequestInit | undefined;
    const fetchImpl: FetchStub = async (entrada, init) => {
      url = entrada;
      opciones = init;
      return new Response(JSON.stringify({ messageId: 'msg-123' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    };

    const resultado = await enviarCorreoTransaccional(ENTRADA, opcionesBase(fetchImpl));

    expect(resultado).toEqual({ idMensaje: 'msg-123' });
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(opciones?.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': 'clave-de-prueba',
    });
    const cuerpo = JSON.parse(String(opciones?.body)) as {
      sender: { name: string; email: string };
      to: Array<{ email: string; name?: string }>;
      subject: string;
      htmlContent: string;
    };
    expect(cuerpo.sender).toEqual({ name: 'ORCA MFG ERP', email: 'erp@orca.test' });
    expect(cuerpo.to).toEqual([{ email: 'cliente@orca.test', name: 'Cliente de pruebas' }]);
    expect(cuerpo.subject).toBe(ENTRADA.asunto);
    expect(cuerpo.htmlContent).toBe(ENTRADA.html);
  });

  it('falla cerrado sin configuración y con solicitudes inválidas', async () => {
    await expect(enviarCorreoTransaccional(ENTRADA, {
      apiKey: 'clave-de-prueba',
      remitente: '',
      fetchImpl: async () => new Response('{}'),
    })).rejects.toMatchObject({ codigo: 'configuracion_faltante' });

    await expect(enviarCorreoTransaccional(
      { ...ENTRADA, destinatario: 'no-es-un-correo' },
      opcionesBase(async () => new Response('{}')),
    )).rejects.toMatchObject({ codigo: 'solicitud_invalida' });

    await expect(enviarCorreoTransaccional(
      { ...ENTRADA, asunto: '   ' },
      opcionesBase(async () => new Response('{}')),
    )).rejects.toMatchObject({ codigo: 'solicitud_invalida' });
  });

  it('reporta proveedor no disponible y tiempo agotado', async () => {
    await expect(enviarCorreoTransaccional(
      ENTRADA,
      opcionesBase(async () => new Response('{}', { status: 503 })),
    )).rejects.toMatchObject({ codigo: 'proveedor_no_disponible' });

    const fetchColgado: FetchStub = async (_entrada, init) => ({
      ok: true,
      json: () => new Promise((_resolver, rechazar) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('abortado');
          error.name = 'AbortError';
          rechazar(error);
        }, { once: true });
      }),
    } as Response);

    await expect(enviarCorreoTransaccional(
      ENTRADA,
      { ...opcionesBase(fetchColgado), timeoutMs: 20 },
    )).rejects.toMatchObject({ codigo: 'tiempo_agotado' });

    expect(new ErrorCorreo('proveedor_no_disponible')).toBeInstanceOf(Error);
  });
});
