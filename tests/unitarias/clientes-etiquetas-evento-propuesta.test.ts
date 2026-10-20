import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { etiquetaAccion } from '@/modulos/auditoria/utilidades/actividad';
import { etiquetaAccionEventoPropuesta } from '@/modulos/clientes/utilidades/etiquetas-evento-propuesta';

const RUTA_MIGRACIONES = join(process.cwd(), 'supabase', 'migrations');

/**
 * Códigos de acción que las migraciones insertan en `propuesta_revision_eventos`.
 * Se leen del SQL real para que una RPC nueva no vuelva a mostrar su código
 * técnico en la ficha sin que alguien le ponga etiqueta.
 */
function codigosDeAccionEnMigraciones(): string[] {
  const codigos = new Set<string>();
  for (const archivo of readdirSync(RUTA_MIGRACIONES).filter((nombre) => nombre.endsWith('.sql'))) {
    const sql = readFileSync(join(RUTA_MIGRACIONES, archivo), 'utf8');
    for (const coincidencia of sql.matchAll(/INSERT INTO public\.propuesta_revision_eventos/g)) {
      const ventana = sql.slice(coincidencia.index, coincidencia.index + 420);
      for (const codigo of ventana.matchAll(/'([a-z]+(?:_[a-z]+)+)'/g)) codigos.add(codigo[1]!);
    }
  }
  return [...codigos].sort();
}

describe('etiquetas de acciones de eventos de revisión', () => {
  it('traduce los códigos que escriben las RPC de Propuestas', () => {
    expect(etiquetaAccionEventoPropuesta('crear_propuesta')).toBe('Propuesta creada');
    expect(etiquetaAccionEventoPropuesta('crear_nueva_revision')).toBe('Nueva versión creada');
    expect(etiquetaAccionEventoPropuesta('validar_revision')).toBe('Revisión validada');
    expect(etiquetaAccionEventoPropuesta('registrar_seguimiento')).toBe('Seguimiento registrado');
    expect(etiquetaAccionEventoPropuesta('costear_ruteo')).toBe('Ruteo costeado');
    expect(etiquetaAccionEventoPropuesta('reabrir_revision')).toBe('Revisión reabierta');
    expect(etiquetaAccionEventoPropuesta('agregar_item_propuesta')).toBe('Ítem agregado');
  });

  it('reutiliza las etiquetas de estado existentes en las acciones que terminan en un estado', () => {
    expect(etiquetaAccionEventoPropuesta('enviar_revision')).toBe('Revisión enviada');
    expect(etiquetaAccionEventoPropuesta('aceptar_revision')).toBe('Revisión aceptada');
    expect(etiquetaAccionEventoPropuesta('rechazar_propuesta')).toBe('Propuesta rechazada');
    expect(etiquetaAccionEventoPropuesta('cerrar_propuesta')).toBe('Propuesta cerrada');
    expect(etiquetaAccionEventoPropuesta('confirmar_venta')).toBe('Venta confirmada');
    expect(etiquetaAccionEventoPropuesta('confirmar_venta_desde_orden')).toBe(
      'Venta confirmada al crear la orden',
    );
  });

  it('todo código de acción del SQL tiene etiqueta propia y ninguna muestra guiones bajos', () => {
    const codigos = codigosDeAccionEnMigraciones();

    // Si el SQL deja de insertar eventos, la prueba no debe pasar en vacío.
    expect(codigos.length).toBeGreaterThanOrEqual(14);
    for (const codigo of codigos) {
      const etiqueta = etiquetaAccionEventoPropuesta(codigo);
      expect(etiqueta, codigo).not.toMatch(/_/);
      // Distinta del respaldo: hay traducción dedicada, no solo humanización.
      expect(etiqueta, codigo).not.toBe(etiquetaAccion(codigo));
    }
  });

  it('un código aún sin traducción se humaniza con la función de Actividad', () => {
    expect(etiquetaAccionEventoPropuesta('accion_nueva_sin_etiqueta')).toBe(
      etiquetaAccion('accion_nueva_sin_etiqueta'),
    );
    expect(etiquetaAccionEventoPropuesta('accion_nueva_sin_etiqueta')).toBe('Accion nueva sin etiqueta');
  });
});
