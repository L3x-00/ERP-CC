'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/compartido/componentes/ui/button';
import { enfocarElemento } from '@/compartido/utilidades/enfocar-seccion';
import { useTutorialConfiguracion } from './contexto-tutorial-configuracion';
import { PASOS_TUTORIAL_CONFIGURACION } from './pasos-tutorial-configuracion';

/**
 * Tarjeta flotante del tutorial. No bloquea la pantalla: el usuario puede
 * seguir usando la aplicación mientras la guía resalta la sección activa.
 */
export function GuiaConfiguracion() {
  const { activo, paso, salir, reiniciar, siguiente } = useTutorialConfiguracion();
  const router = useRouter();
  const ruta = usePathname();

  const esUltimo = paso === PASOS_TUTORIAL_CONFIGURACION.length - 1;
  const pasoActual = PASOS_TUTORIAL_CONFIGURACION[paso];

  // Solo navega cuando cambia el paso. Si dependiera de `ruta`, un cambio de
  // página hecho por el usuario devolvería a la guía a su paso y secuestraría
  // la navegación. Se lee `window.location` para no necesitar `ruta` aquí.
  useEffect(() => {
    if (!activo || window.location.pathname.startsWith('/es/docs')) return;
    const destino = new URL(pasoActual.ruta, window.location.origin);
    const actual = window.location.pathname + window.location.search;
    if (actual !== destino.pathname + destino.search) {
      router.push(pasoActual.ruta);
    }
  }, [activo, paso, pasoActual.ruta, router]);

  // El resaltado sí se repite al cambiar de página, porque el destino acaba de
  // montarse. `enfocarElemento` reintenta si todavía no está en el DOM.
  useEffect(() => {
    if (!activo || ruta.startsWith('/es/docs')) return;
    const temporizador = window.setTimeout(() => {
      enfocarElemento(pasoActual.destino);
    }, 400);
    return () => window.clearTimeout(temporizador);
  }, [activo, paso, pasoActual.destino, ruta]);

  if (!activo || !pasoActual || ruta.startsWith('/es/docs')) return null;

  function irA(rutaDestino: string, destino: string) {
    router.push(rutaDestino);
    window.setTimeout(() => enfocarElemento(destino), 250);
  }

  return (
    <aside
      aria-label="Tutorial de configuración"
      className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-acento/40 bg-superficie p-4 shadow-elevada"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-acento-texto">
          Tutorial de configuración
        </p>
        <p className="text-xs text-texto-tenue">
          Paso {paso + 1} de {PASOS_TUTORIAL_CONFIGURACION.length}
        </p>
      </div>

      <h2 className="text-base font-semibold text-texto-primario">{pasoActual.titulo}</h2>
      <p className="mt-1 text-sm leading-relaxed text-texto-secundario">{pasoActual.mensaje}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button tamano="sm" onClick={() => irA(pasoActual.ruta, pasoActual.destino)}>
          Ir a la sección
        </Button>
        {pasoActual.enlaces?.map((enlace) => (
          <Button
            key={enlace.destino}
            variante="contorno"
            tamano="sm"
            onClick={() => irA(enlace.ruta, enlace.destino)}
          >
            {enlace.etiqueta}
          </Button>
        ))}
        <Button variante="fantasma" tamano="sm" onClick={esUltimo ? salir : siguiente}>
          {esUltimo ? 'Terminar' : 'Siguiente'}
        </Button>
        <Button variante="fantasma" tamano="sm" onClick={salir}>
          Salir
        </Button>
        <Button variante="fantasma" tamano="sm" onClick={reiniciar}>
          Reiniciar
        </Button>
      </div>
    </aside>
  );
}
