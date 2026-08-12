'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const MS_AGRUPACION_RAFAGA = 350;
const MS_GRACIA_OPERACION_LOCAL = 1_500;
const EVENTO_OPERACION_LOCAL = 'ordenes:piso-operacion-local';

/**
 * Sincroniza una terminal PIN sin exponer una clave privilegiada al navegador.
 * El EventSource sólo recibe una señal sin payload desde una ruta que vuelve a
 * validar la cookie HMAC; la ruta RSC carga después los datos ya acotados al
 * operador asignado.
 */
export function SincronizadorPisoRealtime() {
  const router = useRouter();
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bloquearHastaRef = useRef(0);

  useEffect(() => {
    const eventos = new EventSource('/api/produccion-piso/sincronizacion');

    function programarRefresco(): void {
      if (temporizadorRef.current !== null) {
        clearTimeout(temporizadorRef.current);
      }
      const esperaPorOperacionLocal = Math.max(0, bloquearHastaRef.current - Date.now());
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        router.refresh();
      }, Math.max(MS_AGRUPACION_RAFAGA, esperaPorOperacionLocal));
    }

    function bloquearRefrescoPorOperacionLocal(): void {
      bloquearHastaRef.current = Date.now() + MS_GRACIA_OPERACION_LOCAL;
    }

    eventos.addEventListener('cambio', programarRefresco);
    eventos.addEventListener('sesion_expirada', () => router.replace('/operador'));
    window.addEventListener(EVENTO_OPERACION_LOCAL, bloquearRefrescoPorOperacionLocal);

    return () => {
      eventos.removeEventListener('cambio', programarRefresco);
      eventos.close();
      window.removeEventListener(EVENTO_OPERACION_LOCAL, bloquearRefrescoPorOperacionLocal);
      if (temporizadorRef.current !== null) {
        clearTimeout(temporizadorRef.current);
        temporizadorRef.current = null;
      }
    };
  }, [router]);

  return null;
}
