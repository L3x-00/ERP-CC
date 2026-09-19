import type { ClienteRfq, CondicionesPago } from '@/modulos/pipeline/tipos/indice';

/** Valores capturados en el alta rápida de cliente desde la RFQ (texto crudo). */
export type CapturaAltaRapida = {
  razonSocial: string;
  nombreComercial: string;
  rfc: string;
  contacto: string;
  correo: string;
  telefono: string;
  condicionesPago: CondicionesPago | null;
};

/** Texto capturado → valor persistible (vacío se guarda como null). */
function aTextoONull(valor: string): string | null {
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}

/**
 * Construye el `ClienteRfq` del cliente recién creado por el alta rápida
 * (RFQ-02), sin releer la fila.
 *
 * Normaliza igual que `crearClienteAccion` (trim, RFC en mayúsculas, correo en
 * minúsculas, vacío → null) para que lo que la RFQ muestra coincida con lo
 * guardado. Si el nombre comercial no se capturó, se usa la razón social — la
 * misma sustitución que hace el formulario al enviar.
 */
export function clienteRfqDesdeAlta(id: string, captura: CapturaAltaRapida): ClienteRfq {
  const razonSocial = captura.razonSocial.trim();
  const nombreComercial = captura.nombreComercial.trim();
  const rfc = captura.rfc.trim().toUpperCase();
  const correo = captura.correo.trim().toLowerCase();

  return {
    id,
    razonSocial,
    nombreComercial: nombreComercial === '' ? razonSocial : nombreComercial,
    rfc: rfc === '' ? null : rfc,
    contacto: aTextoONull(captura.contacto),
    correo: correo === '' ? null : correo,
    telefono: aTextoONull(captura.telefono),
    condicionesPago: captura.condicionesPago,
    // El alta desde una RFQ es un cliente en prospección; pasa a `activo` cuando
    // la oportunidad se gana (`promoverAClienteSiNoExiste`).
    estado: 'prospecto',
  };
}
