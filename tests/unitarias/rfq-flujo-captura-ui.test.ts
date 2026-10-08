// @vitest-environment jsdom
// Nota de convención: los componentes usan JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`
// (mismo patrón que `rfq-resumen.test.ts`).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { CatalogosRfq } from '@/modulos/rfq/acciones/obtener-catalogos';
import type { Rfq, ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';
import {
  NavegacionCapturaRfq,
  type PasoCapturaRfq,
} from '@/modulos/rfq/componentes/navegacion-captura-rfq';
import { PanelRevisionRfq } from '@/modulos/rfq/componentes/panel-revision-rfq';

const RFQ_BASE: Rfq = {
  id: 'rfq-1',
  folio: 'RFQ-1026_01',
  folioOp: 'OP-000001',
  folioCnc: null,
  estadoRfq: 'INCOMPLETE',
  etapa: 'contactado',
  clienteId: 'cliente-1',
  condicionesPago: null,
  clienteNombre: 'Metales del Norte SA de CV',
  empresa: 'Empresa legada SA',
  contactoId: 'contacto-1',
  contactoNombre: 'Ana Pérez',
  nombreContacto: 'Contacto legado',
  vendedorId: 'vend-1',
  responsableId: 'usuario-1',
  responsableNombre: 'Luis Operador',
  canal: 'TELEFONO',
  canalDetalle: null,
  fechaSolicitud: '2026-01-01',
  fechaRequeridaCliente: null,
  descripcionGeneral: 'Corte de lámina calibre 14',
  proximaAccionCodigo: null,
  proximaAccionTexto: null,
  fechaProximaAccion: null,
  responsableProximaAccionId: null,
  responsableProximaAccionNombre: null,
  actualizadoEn: '2026-01-05T18:30:00+00:00',
  items: [],
};

const CATALOGOS: CatalogosRfq = {
  materiales: [],
  espesores: [],
  procesos: [],
  canales: [{ codigo: 'TELEFONO', nombre: 'Teléfono', esOtro: false, activo: true }],
  proximasAcciones: [],
  usuarios: [],
};

const NOMBRES_PASOS: Record<PasoCapturaRfq, string> = {
  cliente: 'Cliente',
  solicitud: 'Solicitud',
  items: 'Ítems',
  archivos: 'Archivos',
  revisar: 'Revisar',
};

function validacion(
  secciones: Partial<ValidacionRfqListo['secciones']> = {},
): ValidacionRfqListo {
  const completas = {
    cliente: [],
    general: [],
    items: [],
    archivos: [],
    seguimiento: [],
    ...secciones,
  };
  return {
    listo: Object.values(completas).every((faltantes) => faltantes.length === 0),
    secciones: completas,
  };
}

function renderizarNavegacion(
  props: Partial<ComponentProps<typeof NavegacionCapturaRfq>> = {},
) {
  const onSeleccionar = vi.fn();
  render(
    createElement(NavegacionCapturaRfq, {
      pasoActual: 'cliente',
      onSeleccionar,
      ...props,
    }),
  );
  return { onSeleccionar };
}

/** Botones de paso indexados por su `data-paso`. */
function pasosPorClave(): Map<string, HTMLElement> {
  return new Map(screen.getAllByRole('button').map((boton) => [boton.dataset.paso ?? '', boton]));
}

afterEach(() => {
  cleanup();
});

describe('NavegacionCapturaRfq — cinco pasos del flujo durable (C1.2b)', () => {
  it('presenta los cinco pasos en orden, numerados y con nombre completo', () => {
    renderizarNavegacion({ pasoActual: 'items' });

    expect(screen.getByRole('navigation', { name: /captura/i })).toBeDefined();

    const pasos = screen.getAllByRole('button');
    expect(pasos).toHaveLength(5);

    const esperados: PasoCapturaRfq[] = ['cliente', 'solicitud', 'items', 'archivos', 'revisar'];
    esperados.forEach((paso, indice) => {
      const boton = pasos[indice]!;
      expect(boton.dataset.paso).toBe(paso);
      expect(boton.getAttribute('type')).toBe('button');
      // Número visible del paso y nombre legible sin truncar.
      expect(boton.textContent).toContain(String(indice + 1));
      expect(boton.textContent).toContain(NOMBRES_PASOS[paso]);
      expect(boton.querySelector('.truncate')).toBeNull();
    });
  });

  it('marca el paso actual con aria-current="step" y solo ese', () => {
    renderizarNavegacion({ pasoActual: 'archivos' });

    const actuales = screen
      .getAllByRole('button')
      .filter((boton) => boton.getAttribute('aria-current') === 'step');
    expect(actuales).toHaveLength(1);
    expect(actuales[0]!.dataset.paso).toBe('archivos');
  });

  it('distingue actual, completado previo y pendiente sin depender del color', () => {
    renderizarNavegacion({ pasoActual: 'items' });

    const porPaso = pasosPorClave();
    expect(porPaso.get('cliente')!.dataset.estado).toBe('completado');
    expect(porPaso.get('solicitud')!.dataset.estado).toBe('completado');
    expect(porPaso.get('items')!.dataset.estado).toBe('actual');
    expect(porPaso.get('archivos')!.dataset.estado).toBe('pendiente');
    expect(porPaso.get('revisar')!.dataset.estado).toBe('pendiente');

    // El estado también está en el nombre accesible, no solo en el estilo.
    expect(porPaso.get('cliente')!.textContent).toMatch(/completado/i);
    expect(porPaso.get('items')!.textContent).toMatch(/paso actual/i);
    expect(porPaso.get('archivos')!.textContent).toMatch(/pendiente/i);
  });

  it('señala los pasos con faltantes en texto, incluido el paso actual', () => {
    renderizarNavegacion({ pasoActual: 'items', pasosConFaltantes: ['cliente', 'items'] });

    const porPaso = pasosPorClave();
    expect(porPaso.get('cliente')!.dataset.faltantes).toBe('si');
    expect(porPaso.get('items')!.dataset.faltantes).toBe('si');
    expect(porPaso.get('archivos')!.dataset.faltantes).toBe('no');

    expect(porPaso.get('cliente')!.textContent).toMatch(/faltan datos/i);
    expect(porPaso.get('items')!.textContent).toMatch(/faltan datos/i);
    // El paso actual con faltantes conserva su marca de actual.
    expect(porPaso.get('items')!.getAttribute('aria-current')).toBe('step');
    expect(porPaso.get('archivos')!.textContent).not.toMatch(/faltan datos/i);
  });

  it('un paso previo con faltantes no se presenta como completado', () => {
    renderizarNavegacion({ pasoActual: 'revisar', pasosConFaltantes: ['cliente'] });

    const cliente = pasosPorClave().get('cliente')!;
    expect(cliente.dataset.estado).toBe('pendiente');
    expect(cliente.textContent).not.toMatch(/completado|✓/i);
    expect(pasosPorClave().get('solicitud')!.dataset.estado).toBe('completado');
  });

  it('cada paso es un botón operable por teclado que informa la selección', () => {
    const { onSeleccionar } = renderizarNavegacion({ pasoActual: 'cliente' });

    const botones = screen.getAllByRole('button');
    for (const boton of botones) {
      expect((boton as HTMLButtonElement).disabled).toBe(false);
      expect(boton.getAttribute('tabindex')).not.toBe('-1');
    }

    const archivos = botones.find((boton) => boton.dataset.paso === 'archivos')!;
    archivos.focus();
    expect(document.activeElement).toBe(archivos);
    fireEvent.click(archivos);
    expect(onSeleccionar).toHaveBeenCalledWith('archivos');

    fireEvent.click(botones.find((boton) => boton.dataset.paso === 'revisar')!);
    expect(onSeleccionar).toHaveBeenLastCalledWith('revisar');
    expect(onSeleccionar).toHaveBeenCalledTimes(2);
  });

  it('usa lista envolvente para no desbordar en pantallas angostas', () => {
    renderizarNavegacion();

    const lista = screen.getByRole('list');
    expect(lista.className).toContain('flex-wrap');
    expect(lista.className).not.toContain('overflow-x');
  });
});

describe('PanelRevisionRfq — revisión comprensible antes de marcar listo (C1.2b)', () => {
  function renderizar(props: Partial<ComponentProps<typeof PanelRevisionRfq>> = {}) {
    const callbacks = {
      onRevalidar: vi.fn(),
      onEditarResumen: vi.fn(),
      onIrAItems: vi.fn(),
      onIrAArchivos: vi.fn(),
    };
    render(
      createElement(PanelRevisionRfq, {
        rfq: RFQ_BASE,
        catalogos: CATALOGOS,
        validacion: null,
        validando: false,
        error: null,
        ...callbacks,
        ...props,
      }),
    );
    return callbacks;
  }

  it('mientras valida comunica el progreso con role=status y no muestra checklist', () => {
    renderizar({ validando: true });

    const estado = screen.getByRole('status');
    expect(estado.textContent ?? '').toMatch(/revisa|valida/i);
    expect(screen.queryByTestId('revision-checklist')).toBeNull();
  });

  it('en error avisa con role=alert y ofrece reintentar', () => {
    const { onRevalidar } = renderizar({ error: 'No se pudo validar el RFQ' });

    expect(screen.getByRole('alert').textContent).toContain('No se pudo validar el RFQ');
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(onRevalidar).toHaveBeenCalledTimes(1);
  });

  it('agrupa los faltantes por sección y ofrece corregir donde corresponde', () => {
    const callbacks = renderizar({
      validacion: validacion({
        cliente: ['Falta ligar el cliente del catálogo'],
        items: ['Falta al menos un ítem activo'],
        archivos: ['Falta un archivo técnico para corte láser'],
      }),
    });

    const checklist = screen.getByTestId('revision-checklist');
    expect(checklist.textContent).toContain('Falta ligar el cliente del catálogo');
    expect(checklist.textContent).toContain('Falta al menos un ítem activo');
    expect(checklist.textContent).toContain('Falta un archivo técnico para corte láser');

    // Las secciones sin faltantes también se comunican como revisadas.
    const general = screen.getByTestId('revision-seccion-general');
    expect(general.dataset.faltantes).toBe('no');
    expect(general.textContent).toMatch(/sin faltantes/i);
    expect(screen.getByTestId('revision-seccion-cliente').dataset.faltantes).toBe('si');

    fireEvent.click(screen.getByRole('button', { name: /corregir en resumen/i }));
    expect(callbacks.onEditarResumen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /ir a ítems/i }));
    expect(callbacks.onIrAItems).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /ir a archivos/i }));
    expect(callbacks.onIrAArchivos).toHaveBeenCalledTimes(1);
  });

  it('solo ofrece la acción de las áreas con faltantes', () => {
    renderizar({ validacion: validacion({ items: ['Falta al menos un ítem activo'] }) });

    expect(screen.getByRole('button', { name: /ir a ítems/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /ir a archivos/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /corregir en resumen/i })).toBeNull();
  });

  it('agrupa General y Seguimiento tras la misma corrección del Resumen', () => {
    const callbacks = renderizar({
      validacion: validacion({
        general: ['Falta la descripción general'],
        seguimiento: ['Falta la próxima acción'],
      }),
    });

    const correcciones = screen.getAllByRole('button', { name: /corregir en resumen/i });
    expect(correcciones).toHaveLength(1);
    fireEvent.click(correcciones[0]!);
    expect(callbacks.onEditarResumen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('revision-seccion-general').dataset.faltantes).toBe('si');
    expect(screen.getByTestId('revision-seccion-seguimiento').dataset.faltantes).toBe('si');
  });

  it('sin faltantes comunica que el RFQ está listo y remite a la acción superior', () => {
    renderizar({ validacion: validacion() });

    const estado = screen.getByRole('status');
    expect(estado.textContent ?? '').toContain('Marcar listo para propuesta');
    expect(screen.queryByRole('button', { name: /ir a ítems/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /corregir en resumen/i })).toBeNull();
    // Ninguna sección queda marcada con faltantes.
    expect(
      screen.getByTestId('revision-checklist').querySelectorAll('[data-faltantes="si"]'),
    ).toHaveLength(0);
  });

  it('reutiliza ResumenRfq para los datos del RFQ y su edición explícita', () => {
    const callbacks = renderizar({ validacion: validacion() });

    expect(screen.getByTestId('resumen-rfq')).toBeDefined();
    // Las reglas de nombres/fechas/canal viven en ResumenRfq, no aquí.
    expect(screen.getByText('Metales del Norte SA de CV')).toBeDefined();
    expect(screen.getByText('Teléfono')).toBeDefined();
    expect(screen.getByText('1 de enero de 2026')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Editar resumen' }));
    expect(callbacks.onEditarResumen).toHaveBeenCalledTimes(1);
  });

  it('permite revalidar a demanda y nunca muta el RFQ', () => {
    const { onRevalidar } = renderizar({ validacion: validacion({ items: ['Falta un ítem'] }) });

    fireEvent.click(screen.getByRole('button', { name: /revalidar/i }));
    expect(onRevalidar).toHaveBeenCalledTimes(1);

    for (const boton of screen.getAllByRole('button')) {
      expect(boton.getAttribute('type')).toBe('button');
    }
  });

  it('deshabilita revalidar mientras una validación está en vuelo', () => {
    renderizar({ validando: true });

    const boton = screen.getByRole('button', { name: /revalidar/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });
});
