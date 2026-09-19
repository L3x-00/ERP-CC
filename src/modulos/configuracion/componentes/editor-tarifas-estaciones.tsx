'use client';

import { Input } from '@/compartido/componentes/ui/input';
import {
  MATERIALES_COTIZADOR,
  type CatalogoTarifasCotizador,
} from '@/modulos/cotizador/tipos/indice';

/** Input numérico etiquetado; el estado del catálogo guarda números. */
function CampoNum({
  etiqueta,
  valor,
  onCambio,
  min = '0',
  max,
  step = 'any',
  deshabilitado,
}: {
  etiqueta: string;
  valor: number;
  onCambio: (n: number) => void;
  min?: string;
  max?: string;
  step?: string;
  deshabilitado?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {etiqueta}
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={valor}
        onChange={(evento) => {
          const numero = Number(evento.target.value);
          onCambio(Number.isFinite(numero) ? numero : 0);
        }}
        disabled={deshabilitado}
        required
      />
    </label>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-lg border border-borde p-3">
      <h4 className="font-semibold text-texto-primario">{titulo}</h4>
      {children}
    </section>
  );
}

export interface EditorTarifasEstacionesProps {
  valor: CatalogoTarifasCotizador;
  onCambio: (valor: CatalogoTarifasCotizador) => void;
  deshabilitado?: boolean;
}

/**
 * Editor del catálogo de tarifas por estación (CFG-10/OBS-30). Cada cambio
 * emite el catálogo completo hacia arriba mediante `onCambio` para que la
 * pestaña lo guarde junto con el resto de la sección de tarifas. Las unidades se
 * indican en cada etiqueta; el efecto solo aplica a cotizaciones nuevas.
 */
export function EditorTarifasEstaciones({ valor, onCambio, deshabilitado }: EditorTarifasEstacionesProps) {
  const { laser, router, doblado, fabricacion } = valor;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-texto-secundario">
        Estas tarifas precargan el cotizador. Cambiarlas afecta solo a las cotizaciones nuevas; las cotizaciones ya
        calculadas conservan las tarifas con que se guardaron.
      </p>

      <Seccion titulo="Corte láser">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoNum etiqueta="Tarifa máquina por hora" valor={laser.maquinaHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, laser: { ...laser, maquinaHora: n } })} />
          <CampoNum etiqueta="Tarifa de preparación por hora" valor={laser.preparacionHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, laser: { ...laser, preparacionHora: n } })} />
          <CampoNum etiqueta="Consumo de gas por hora" valor={laser.consumoGasHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, laser: { ...laser, consumoGasHora: n } })} />
          <CampoNum etiqueta="Costo unitario de O₂" valor={laser.gas.O2} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, laser: { ...laser, gas: { ...laser.gas, O2: n } } })} />
          <CampoNum etiqueta="Costo unitario de N₂" valor={laser.gas.N2} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, laser: { ...laser, gas: { ...laser.gas, N2: n } } })} />
          <CampoNum etiqueta="Costo unitario de aire" valor={laser.gas.aire} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, laser: { ...laser, gas: { ...laser.gas, aire: n } } })} />
        </div>
        <div className="grid gap-3">
          <p className="text-xs text-texto-secundario">Segundos por perforación según material y espesor.</p>
          {MATERIALES_COTIZADOR.map((material) => {
            const tiempos = laser.segundosPerforacion[material];
            return (
              <div key={material} className="grid gap-2 rounded-md bg-superficie-2 p-2 sm:grid-cols-[10rem_1fr_1fr_1fr]">
                <span className="self-center text-sm font-medium">{material}</span>
                <CampoNum etiqueta="≤ 3 mm" valor={tiempos.hasta3Mm} deshabilitado={deshabilitado}
                  onCambio={(n) => onCambio({ ...valor, laser: { ...laser, segundosPerforacion: { ...laser.segundosPerforacion, [material]: { ...tiempos, hasta3Mm: n } } } })} />
                <CampoNum etiqueta="≤ 6 mm" valor={tiempos.hasta6Mm} deshabilitado={deshabilitado}
                  onCambio={(n) => onCambio({ ...valor, laser: { ...laser, segundosPerforacion: { ...laser.segundosPerforacion, [material]: { ...tiempos, hasta6Mm: n } } } })} />
                <CampoNum etiqueta="> 6 mm" valor={tiempos.mayor6Mm} deshabilitado={deshabilitado}
                  onCambio={(n) => onCambio({ ...valor, laser: { ...laser, segundosPerforacion: { ...laser.segundosPerforacion, [material]: { ...tiempos, mayor6Mm: n } } } })} />
              </div>
            );
          })}
        </div>
      </Seccion>

      <Seccion titulo="Router CNC">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoNum etiqueta="Tarifa máquina por hora" valor={router.maquinaHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, router: { ...router, maquinaHora: n } })} />
          <CampoNum etiqueta="Tarifa de preparación por hora" valor={router.preparacionHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, router: { ...router, preparacionHora: n } })} />
          <CampoNum etiqueta="Costo End-mill (por fresa)" valor={router.endmill} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, router: { ...router, endmill: n } })} />
          <CampoNum etiqueta="Costo Ball-nose (por fresa)" valor={router.ballnose} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, router: { ...router, ballnose: n } })} />
        </div>
      </Seccion>

      <Seccion titulo="Dobladora">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoNum etiqueta="Tarifa máquina por hora" valor={doblado.maquinaHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, doblado: { ...doblado, maquinaHora: n } })} />
          <CampoNum etiqueta="Tarifa de preparación por hora" valor={doblado.preparacionHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, doblado: { ...doblado, preparacionHora: n } })} />
          <CampoNum etiqueta="Tarifa segundo operario por hora" valor={doblado.segundoOperarioHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, doblado: { ...doblado, segundoOperarioHora: n } })} />
          <CampoNum etiqueta="Longitud de referencia del equipo (mm)" valor={doblado.longitudMaximaMm} min="0.01" deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, doblado: { ...doblado, longitudMaximaMm: n } })} />
          <CampoNum etiqueta="Reducción de productividad a longitud máxima (0–1)" valor={doblado.factorLongitudMaxima} max="1" deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, doblado: { ...doblado, factorLongitudMaxima: n } })} />
          <CampoNum etiqueta="Piezas/hora, complejidad simple" valor={doblado.piezasHora.simple} min="0.01" deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, doblado: { ...doblado, piezasHora: { ...doblado.piezasHora, simple: n } } })} />
          <CampoNum etiqueta="Piezas/hora, complejidad media" valor={doblado.piezasHora.media} min="0.01" deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, doblado: { ...doblado, piezasHora: { ...doblado.piezasHora, media: n } } })} />
          <CampoNum etiqueta="Piezas/hora, complejidad compleja" valor={doblado.piezasHora.compleja} min="0.01" deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, doblado: { ...doblado, piezasHora: { ...doblado.piezasHora, compleja: n } } })} />
        </div>
      </Seccion>

      <Seccion titulo="Fabricación">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoNum etiqueta="Tarifa mano de obra por hora" valor={fabricacion.manoObraHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, fabricacion: { ...fabricacion, manoObraHora: n } })} />
          <CampoNum etiqueta="Tarifa soldadura por hora" valor={fabricacion.soldaduraHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, fabricacion: { ...fabricacion, soldaduraHora: n } })} />
          <CampoNum etiqueta="Consumibles de soldadura por hora" valor={fabricacion.consumiblesHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, fabricacion: { ...fabricacion, consumiblesHora: n } })} />
          <CampoNum etiqueta="Tarifa acabado por hora" valor={fabricacion.acabadoHora} deshabilitado={deshabilitado}
            onCambio={(n) => onCambio({ ...valor, fabricacion: { ...fabricacion, acabadoHora: n } })} />
        </div>
      </Seccion>
    </div>
  );
}
