import { describe, expect, it, vi } from 'vitest';
import {
  construirCorreoMencion,
  construirEnlaceEntidad,
  notificarMencionesPorCorreo,
  type ClienteComentarios,
} from '@/modulos/comentarios/servicios/indice';

type FetchStub = (entrada: RequestInfo | URL, opciones?: RequestInit) => Promise<Response>;

const AUTOR_ID = '11111111-1111-4111-8111-111111111111';
const GERENTE_ID = '22222222-2222-4222-8222-222222222222';
const CLIENTE_ID = '33333333-3333-4333-8333-333333333333';

function crearClienteStub(filas: Array<{ id: string; email: string; nombre_completo: string }>): ClienteComentarios {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          eq: async () => ({ data: filas, error: null }),
        }),
      }),
    }),
  } as unknown as ClienteComentarios;
}

function opciones(fetchImpl: FetchStub) {
  return {
    apiKey: 'clave-de-prueba',
    remitente: 'erp@orca.test',
    sitioUrl: 'https://erp.orcacnc.mx',
    fetchImpl,
  };
}

describe('correo de menciones en comentarios', () => {
  it('construye el enlace interno por tipo de entidad', () => {
    expect(construirEnlaceEntidad('orden', 'abc')).toBe('/ordenes?ordenId=abc');
    expect(construirEnlaceEntidad('cotizacion', 'abc')).toBe('/pipeline?cotizacionId=abc');
    expect(construirEnlaceEntidad('cliente', 'abc')).toBe('/clientes?clienteId=abc');
  });

  it('escapa el HTML del comentario y del autor', () => {
    const correo = construirCorreoMencion({
      autorNombre: '<b>Ana</b>',
      contenido: '<script>alert(1)</script>',
      enlace: 'https://erp.orcacnc.mx/clientes?clienteId=abc',
    });

    expect(correo.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(correo.html).not.toContain('<script>');
    expect(correo.html).toContain('https://erp.orcacnc.mx/clientes?clienteId=abc');
    expect(correo.asunto).toContain('<b>Ana</b>');
    expect(correo.texto).toContain('<script>alert(1)</script>');
  });

  it('envía un correo por mención activa y excluye al autor', async () => {
    const fetchImpl = vi.fn<FetchStub>(async () => (
      new Response(JSON.stringify({ messageId: 'msg-1' }), { status: 201 })
    ));

    const resumen = await notificarMencionesPorCorreo(
      crearClienteStub([{ id: GERENTE_ID, email: 'gerente@orca.test', nombre_completo: 'Gerente' }]),
      {
        autorId: AUTOR_ID,
        autorNombre: 'Vendedor',
        comentario: {
          entidadTipo: 'cliente',
          entidadId: CLIENTE_ID,
          contenido: 'Revisar el material',
        },
        mencionesIds: [GERENTE_ID, AUTOR_ID],
      },
      opciones(fetchImpl),
    );

    expect(resumen).toEqual({ enviados: 1, fallidos: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const cuerpo = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      to: Array<{ email: string }>;
      htmlContent: string;
    };
    expect(cuerpo.to).toEqual([{ email: 'gerente@orca.test', name: 'Gerente' }]);
    expect(cuerpo.htmlContent).toContain('https://erp.orcacnc.mx/clientes?clienteId=' + CLIENTE_ID);
  });

  it('no envía nada cuando solo se mencionó al autor', async () => {
    const fetchImpl = vi.fn<FetchStub>(async () => new Response('{}'));

    const resumen = await notificarMencionesPorCorreo(
      crearClienteStub([]),
      {
        autorId: AUTOR_ID,
        autorNombre: 'Vendedor',
        comentario: { entidadTipo: 'orden', entidadId: CLIENTE_ID, contenido: 'Hola' },
        mencionesIds: [AUTOR_ID],
      },
      opciones(fetchImpl),
    );

    expect(resumen).toEqual({ enviados: 0, fallidos: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('no interrumpe el flujo cuando el proveedor falla', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const resumen = await notificarMencionesPorCorreo(
        crearClienteStub([{ id: GERENTE_ID, email: 'gerente@orca.test', nombre_completo: 'Gerente' }]),
        {
          autorId: AUTOR_ID,
          autorNombre: 'Vendedor',
          comentario: { entidadTipo: 'cliente', entidadId: CLIENTE_ID, contenido: 'Hola' },
          mencionesIds: [GERENTE_ID],
        },
        opciones(async () => new Response('{}', { status: 503 })),
      );

      expect(resumen).toEqual({ enviados: 0, fallidos: 1 });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
