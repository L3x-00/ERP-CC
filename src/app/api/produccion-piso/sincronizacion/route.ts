import { randomUUID } from 'node:crypto';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { TIMEOUT_SESION_OPERADOR_MINUTOS } from '@/nucleo/autenticacion/constantes';
import { obtenerOperadorConSesionActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLAS_PISO = [
  'ordenes_produccion',
  'partidas_orden_produccion',
  'registros_tiempo_operador',
  'registros_consumo_material',
  'registros_avance_partida',
  'materiales',
] as const;

const MS_KEEP_ALIVE = 20_000;
const MS_REVALIDACION_SESION = 30_000;
const MS_REINTENTO_INICIAL_SIN_SOCKET = 5_000;
const MS_REINTENTO_MAXIMO_SIN_SOCKET = 60_000;

function codificarEvento(nombre: string, datos: Record<string, never> = {}): Uint8Array {
  return new TextEncoder().encode(`event: ${nombre}\ndata: ${JSON.stringify(datos)}\n\n`);
}

/**
 * Relay SSE para terminales con sesión PIN. Realtime se conecta únicamente en
 * servidor mediante service_role y el navegador recibe una señal vacía; nunca
 * se transmite un cambio, fila, token o costo fuera de RLS.
 */
export async function GET(request: Request): Promise<Response> {
  const operador = await obtenerOperadorConSesionActiva();
  if (!operador) {
    return new Response(null, { status: 401 });
  }

  const codificador = new TextEncoder();
  const expiraEn = Date.now() + TIMEOUT_SESION_OPERADOR_MINUTOS * 60 * 1000;
  let canal: RealtimeChannel | null = null;
  let intervaloKeepAlive: ReturnType<typeof setInterval> | null = null;
  let intervaloSesion: ReturnType<typeof setInterval> | null = null;
  let temporizadorRespaldo: ReturnType<typeof setTimeout> | null = null;
  let cerrar: ((cerrarControlador?: boolean) => Promise<void>) | null = null;

  const flujo = new ReadableStream<Uint8Array>({
    start(controlador) {
      let cerrado = false;

      function enviar(nombre: string): void {
        if (cerrado) {
          return;
        }

        try {
          controlador.enqueue(codificarEvento(nombre));
        } catch {
          void cerrar?.(false);
        }
      }

      function enviarKeepAlive(): void {
        if (cerrado) {
          return;
        }

        try {
          controlador.enqueue(codificador.encode(': keep-alive\n\n'));
        } catch {
          void cerrar?.(false);
        }
      }

      let demoraRespaldo = MS_REINTENTO_INICIAL_SIN_SOCKET;

      function activarRespaldo(): void {
        if (temporizadorRespaldo !== null) {
          return;
        }

        const demoraConVariacion = Math.round(demoraRespaldo * (0.8 + Math.random() * 0.4));
        temporizadorRespaldo = setTimeout(() => {
          temporizadorRespaldo = null;
          enviar('cambio');
          demoraRespaldo = Math.min(demoraRespaldo * 2, MS_REINTENTO_MAXIMO_SIN_SOCKET);
          activarRespaldo();
        }, demoraConVariacion);
      }

      function detenerRespaldo(): void {
        if (temporizadorRespaldo !== null) {
          clearTimeout(temporizadorRespaldo);
          temporizadorRespaldo = null;
        }
        demoraRespaldo = MS_REINTENTO_INICIAL_SIN_SOCKET;
      }

      const supabase = crearClienteSupabaseAdmin();
      canal = supabase.channel(`relay-piso-${operador.id}-${randomUUID()}`);
      for (const tabla of TABLAS_PISO) {
        canal.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tabla },
          () => enviar('cambio'),
        );
      }
      canal.subscribe((estado) => {
        if (estado === 'SUBSCRIBED') {
          detenerRespaldo();
          return;
        }
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
          activarRespaldo();
        }
      });

      intervaloKeepAlive = setInterval(() => {
        enviarKeepAlive();
      }, MS_KEEP_ALIVE);

      cerrar = async (cerrarControlador = true) => {
        if (cerrado) {
          return;
        }
        cerrado = true;
        if (intervaloKeepAlive !== null) {
          clearInterval(intervaloKeepAlive);
          intervaloKeepAlive = null;
        }
        if (intervaloSesion !== null) {
          clearInterval(intervaloSesion);
          intervaloSesion = null;
        }
        detenerRespaldo();
        if (canal !== null) {
          await supabase.removeChannel(canal);
          canal = null;
        }
        if (cerrarControlador) {
          try {
            controlador.close();
          } catch {
            // El navegador puede cerrar el stream antes de propagar `abort`.
          }
        }
      };

      if (request.signal.aborted) {
        void cerrar(false);
        return;
      }

      request.signal.addEventListener('abort', () => {
        void cerrar?.(false);
      });

      intervaloSesion = setInterval(() => {
        void supabase
          .from('usuarios')
          .select('id')
          .eq('id', operador.id)
          .eq('rol', 'operador')
          .eq('activo', true)
          .maybeSingle()
          .then(({ data: operadorActual, error }) => {
            if (Date.now() >= expiraEn || error || !operadorActual) {
              enviar('sesion_expirada');
              void cerrar?.();
            }
          });
      }, MS_REVALIDACION_SESION);
    },
    cancel() {
      return cerrar?.(false);
    },
  });

  return new Response(flujo, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  });
}
