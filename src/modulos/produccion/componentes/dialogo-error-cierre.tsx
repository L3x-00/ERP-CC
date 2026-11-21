'use client';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { Button } from '@/compartido/componentes/ui/button';

export interface AccionErrorCierre {
  etiqueta: string;
  alElegir: () => void;
}

export interface DatosErrorCierre {
  titulo?: string;
  mensaje: string;
  /** Etiqueta de la salida sin corrección, acorde al error concreto. */
  etiquetaCerrar?: string;
  /** Corrección sugerida (por ejemplo, tomar lo producido como consumo). */
  accion?: AccionErrorCierre;
  /** Varias salidas posibles (por ejemplo, registrar consumo o dejarlo para el cierre). */
  acciones?: AccionErrorCierre[];
}

interface PropsDialogoErrorCierre {
  error: DatosErrorCierre | null;
  onCerrar: () => void;
  descripcion?: string;
  testId?: string;
}

const TITULO_PREDETERMINADO = 'No se pudo cerrar la sesión';

/**
 * Aviso modal de un cierre rechazado.
 *
 * Se apoya en el `Dialog` del sistema (Radix) en lugar de un overlay propio:
 * al abrirse sobre otra ventana modal, Radix registra una capa nueva, mantiene
 * los clics dentro del aviso, atrapa el foco y hace que `Esc` cierre solo esta
 * ventana. Un `div` con portal al `body` quedaba dentro de la zona que Radix
 * marca como `pointer-events: none` e `inert`, así que se veía pero los clics
 * pasaban al fondo y `Esc` cerraba el formulario completo.
 */
export function DialogoErrorCierre({
  error,
  onCerrar,
  descripcion = 'El cierre no se registró. Revisa el detalle y corrige lo que se indica.',
  testId = 'error-cierre-dialogo',
}: PropsDialogoErrorCierre) {
  const accion = error?.accion;
  const acciones = error?.acciones ?? (accion ? [accion] : []);
  return (
    <Dialog open={error !== null} onOpenChange={(abierto) => { if (!abierto) onCerrar(); }}>
      <DialogContent
        className="max-w-md"
        data-testid={testId}
        role="alertdialog"
        aria-label={error?.titulo ?? TITULO_PREDETERMINADO}
      >
        <DialogHeader>
          <DialogTitle>{error?.titulo ?? TITULO_PREDETERMINADO}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        <p
          data-testid="error-cierre-mensaje"
          className="rounded-md bg-peligro-suave px-3 py-2 text-sm text-peligro-texto"
        >
          {error?.mensaje}
        </p>
        <DialogFooter>
          {acciones.map((salida, indice) => (
            <Button
              key={salida.etiqueta}
              type="button"
              variante={indice === 0 ? 'secundario' : 'contorno'}
              data-testid={indice === 0 ? 'error-cierre-accion' : `error-cierre-accion-${indice}`}
              onClick={() => {
                salida.alElegir();
                onCerrar();
              }}
            >
              {salida.etiqueta}
            </Button>
          ))}
          <Button
            type="button"
            autoFocus
            onClick={onCerrar}
            data-testid="error-cierre-entendido"
          >
            {error?.etiquetaCerrar ?? 'Entendido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
