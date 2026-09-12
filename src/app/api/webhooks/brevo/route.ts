import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

/**
 * Webhook de eventos transaccionales de Brevo (entregado, rebote, spam,
 * apertura, clic). Brevo lo llama con `?token=<BREVO_WEBHOOK_TOKEN>`.
 *
 * - Sin token configurado o inválido responde 401 (falla cerrado).
 * - Nunca registra correos ni cuerpos completos: solo el tipo de evento.
 * - No modifica datos; por ahora es telemetría operativa para detectar
 *   entregas fallidas. Si un flujo futuro necesita reaccionar (p. ej. marcar
 *   una notificación como rebotada), se extiende aquí.
 */

const esquemaEvento = z
  .object({
    event: z.string().min(1).max(80),
    email: z.string().max(254).optional(),
    'message-id': z.string().max(200).optional(),
    ts_event: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

const esquemaCuerpo = z.union([esquemaEvento, z.array(esquemaEvento).max(100)]);

function compararToken(a: string, b: string): boolean {
  const buferA = Buffer.from(a);
  const buferB = Buffer.from(b);
  if (buferA.length !== buferB.length) return false;
  return timingSafeEqual(buferA, buferB);
}

export async function POST(request: Request): Promise<Response> {
  const tokenEsperado = process.env.BREVO_WEBHOOK_TOKEN;
  const tokenRecibido = new URL(request.url).searchParams.get('token') ?? '';

  if (!tokenEsperado || !tokenRecibido || !compararToken(tokenEsperado, tokenRecibido)) {
    return NextResponse.json({ error: 'no_autorizado' }, { status: 401 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'cuerpo_ilegible' }, { status: 400 });
  }

  const analisis = esquemaCuerpo.safeParse(cuerpo);
  if (!analisis.success) {
    return NextResponse.json({ error: 'evento_invalido' }, { status: 400 });
  }

  const eventos = Array.isArray(analisis.data) ? analisis.data : [analisis.data];
  console.info('[CORREO] Eventos Brevo recibidos:', eventos.map((evento) => evento.event).join(','));

  return NextResponse.json({ recibido: true, eventos: eventos.length });
}
