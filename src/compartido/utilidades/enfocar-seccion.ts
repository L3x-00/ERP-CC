'use client';

/**
 * Utilidad compartida para la guía de configuración: abre el contenedor
 * plegable que rodea un destino, hace scroll hacia él y lo resalta durante
 * unos segundos. El resaltado es temporal y se limpia solo; no altera datos.
 */

const ESPERA_ANIMACION_MS = 320;
const DURACION_RESALTADO_MS = 2400;
const MAX_REINTENTOS = 12;
const INTERVALO_REINTENTO_MS = 120;

function preferirMovimientoReducido(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function abrirContenedorSiEstaCerrado(elemento: HTMLElement): void {
  let actual: HTMLElement | null = elemento;
  while (actual) {
    if (actual.dataset.estado === 'cerrado') {
      const boton = actual.querySelector('button');
      if (boton) boton.click();
      return;
    }
    actual = actual.parentElement;
  }
}

function resaltar(elemento: HTMLElement): void {
  elemento.scrollIntoView({
    behavior: preferirMovimientoReducido() ? 'auto' : 'smooth',
    block: 'start',
  });

  if (preferirMovimientoReducido()) return;

  const estilo = window.getComputedStyle(elemento);
  const color = estilo.getPropertyValue('--color-acento').trim() || estilo.color;
  elemento.animate(
    [
      { outline: `3px solid ${color}`, outlineOffset: '2px' },
      { outline: '3px solid transparent', outlineOffset: '2px' },
      { outline: `3px solid ${color}`, outlineOffset: '2px' },
    ],
    { duration: DURACION_RESALTADO_MS / 2, iterations: 2, easing: 'ease-in-out' },
  );
}

/**
 * Enfoca un destino por id. Si todavía no está montado (las pestañas se
 * remontan al guardar), lo intenta de nuevo durante un corto periodo.
 */
export function enfocarElemento(
  id: string,
  opciones: { abrirContenedor?: boolean; reintentos?: number } = {},
): void {
  const { abrirContenedor = true, reintentos = MAX_REINTENTOS } = opciones;
  const elemento = document.getElementById(id);

  if (!elemento) {
    if (reintentos > 0) {
      window.setTimeout(
        () => enfocarElemento(id, { ...opciones, reintentos: reintentos - 1 }),
        INTERVALO_REINTENTO_MS,
      );
    }
    return;
  }

  if (abrirContenedor) {
    abrirContenedorSiEstaCerrado(elemento);
    window.setTimeout(() => resaltar(elemento), ESPERA_ANIMACION_MS);
    return;
  }

  resaltar(elemento);
}
