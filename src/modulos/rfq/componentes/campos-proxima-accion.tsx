'use client';

import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import type { ProximaAccionCaptura } from '@/modulos/rfq/utilidades/proxima-accion';

import type { CatalogosRfq } from '../acciones/obtener-catalogos';

/**
 * Campos de la próxima acción que acompaña un cambio de estado no terminal
 * (C2.2/DC-06). Presentacional: el panel decide cuándo es obligatoria y el
 * servidor la guarda en la misma operación que el estado.
 */
export function CamposProximaAccion({
  idBase,
  valor,
  onCambio,
  catalogos,
  hoy,
}: {
  idBase: string;
  valor: ProximaAccionCaptura;
  onCambio: (valor: ProximaAccionCaptura) => void;
  catalogos: Pick<CatalogosRfq, 'proximasAcciones' | 'usuarios'>;
  hoy: string;
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
    </fieldset>
  );
}
