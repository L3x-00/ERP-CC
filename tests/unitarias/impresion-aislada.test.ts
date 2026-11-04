// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  construirHtmlImpresion,
  imprimirHtmlAislado,
  MARCA_DOCUMENTO_NEUTRA,
} from '@/compartido/utilidades/impresion-documento';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('impresión aislada', () => {
  it('imprime solo el documento dentro del iframe, nunca la pantalla del ERP', async () => {
    const imprimirMarco = vi.fn();
    const enfocarMarco = vi.fn();
    const imprimirPantalla = vi.fn();
    vi.spyOn(window, 'print').mockImplementation(imprimirPantalla);
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue({
      focus: enfocarMarco,
      print: imprimirMarco,
      addEventListener: vi.fn(),
    } as unknown as Window);

    const html = construirHtmlImpresion({
      titulo: 'Orden de servicio O-1',
      folio: 'O-1',
      etiqueta: 'Orden de servicio',
      marca: MARCA_DOCUMENTO_NEUTRA,
      cuerpoHtml: '<section><p>Solo el documento</p></section>',
    });

    // La pantalla tiene barra lateral: la impresión no debe capturarla.
    document.body.innerHTML = '<aside id="sidebar">Navegación</aside>';

    await expect(imprimirHtmlAislado(html, 'Impresión de la orden O-1')).resolves.toBeUndefined();

    expect(imprimirMarco).toHaveBeenCalledOnce();
    expect(enfocarMarco).toHaveBeenCalledOnce();
    expect(imprimirPantalla).not.toHaveBeenCalled();

    const marco = document.querySelector('iframe');
    expect(marco).not.toBeNull();
    const contenido = marco?.contentDocument?.body.innerHTML ?? '';
    expect(contenido).toContain('Solo el documento');
    expect(contenido).not.toContain('Navegación');
  });
});
