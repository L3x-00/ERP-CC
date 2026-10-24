'use client';

import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import type { ProximaAccionCaptura } from '@/modulos/rfq/utilidades/proxima-accion';

import type { CatalogosRfq } from '../acciones/obtener-catalogos';

/**
 * Campos de la próxima acción que acompaña un cambio de estado no terminal
 * (C2.2/DC-06). Presentacional: el panel decide cuándo es obligatoria y el
 * servidor la guarda en la misma operación que el estado.
 *
 * `sinResponsable` permite reutilizarlo cuando el responsable ya se elige en
 * otro campo (modal de «Finalizar captura» del alta: un único responsable para
 * el RFQ y la próxima acción); ese valor viaja igual en `valor.responsableId`
 * y se muestra de solo lectura con `responsableFijoNombre` para que quien
 * captura vea a quién quedó asignado sin poder alterarlo.
 */
export function CamposProximaAccion({
  idBase,
  valor,
  onCambio,
  catalogos,
  hoy,
  sinResponsable = false,
  responsableFijoNombre,
}: {
  idBase: string;
  valor: ProximaAccionCaptura;
  onCambio: (valor: ProximaAccionCaptura) => void;
  catalogos: Pick<CatalogosRfq, 'proximasAcciones' | 'usuarios'>;
  hoy: string;
  sinResponsable?: boolean;
  /** Nombre visible del responsable fijo (solo con `sinResponsable`). */
  responsableFijoNombre?: string | null;
}) {
  const accion = catalogos.proximasAcciones.find((opcion) => opcion.codigo === valor.codigo);

  return (
    <fieldset className="grid min-w-0 gap-3 rounded-lg border border-borde p-3 sm:grid-cols-2" data-testid="campos-proxima-accion">
      <legend className="px-1 text-sm font-semibold">Próxima acción</legend>
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${idBase}-accion`}>Acción a seguir</Label>
        <Select
          id={`${idBase}-accion`}
          value={valor.codigo}
          onChange={(evento) => onCambio({ ...valor, codigo: evento.target.value })}
        >
          <option value="">Elige una acción</option>
          {catalogos.proximasAcciones.map((opcion) => (
            <option key={opcion.codigo} value={opcion.codigo}>
              {opcion.nombre}
            </option>
          ))}
        </Select>
      </div>
      {accion?.esOtro && (
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={`${idBase}-texto`}>Detalle de la acción</Label>
          <Input
            id={`${idBase}-texto`}
            value={valor.texto}
            maxLength={300}
            onChange={(evento) => onCambio({ ...valor, texto: evento.target.value })}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${idBase}-fecha`}>Fecha de la acción</Label>
        <Input
          id={`${idBase}-fecha`}
          type="date"
          min={hoy}
          value={valor.fecha}
          onChange={(evento) => onCambio({ ...valor, fecha: evento.target.value })}
        />
      </div>
      {!sinResponsable && (
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={`${idBase}-responsable`}>Responsable de la acción a seguir</Label>
          <Select
            id={`${idBase}-responsable`}
            value={valor.responsableId}
            onChange={(evento) => onCambio({ ...valor, responsableId: evento.target.value })}
          >
            <option value="">Elige un responsable</option>
            {catalogos.usuarios.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nombre}
              </option>
            ))}
          </Select>
        </div>
      )}
      {sinResponsable && (
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={`${idBase}-responsable`}>Responsable de la acción a seguir</Label>
          <Input
            id={`${idBase}-responsable`}
            data-testid="responsable-proxima-accion-fijo"
            value={responsableFijoNombre ?? 'Usuario que registró el RFQ'}
            disabled
            readOnly
          />
          <span className="text-xs text-texto-secundario">
            Se asigna automáticamente a quien registra el RFQ.
          </span>
        </div>
      )}
    </fieldset>
  );
}
