'use client';

import { useState, type FormEvent } from 'react';

import { crearClienteAccion } from '@/modulos/clientes/acciones/crear-cliente';
import { actualizarClienteAccion } from '@/modulos/clientes/acciones/actualizar-cliente';
import type {
  Cliente,
  CondicionesPagoCliente,
  Direccion,
  EstadoCliente,
} from '@/modulos/clientes/tipos/indice';

const CLASE_INPUT =
  'rounded-base border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primario focus:ring-2 focus:ring-primario/30';
const CLASE_ETIQUETA = 'text-sm font-medium';
const CLASE_BOTON_PRIMARIO =
  'rounded-base bg-primario px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const CLASE_BOTON_SECUNDARIO =
  'rounded-base border border-foreground/20 px-4 py-2 text-sm font-medium hover:bg-foreground/5';

/** Estado local de una dirección (todos los campos como string para inputs controlados). */
type FormularioDireccion = {
  calle: string;
  numeroExterior: string;
  numeroInterior: string;
  colonia: string;
  municipio: string;
  estado: string;
  codigoPostal: string;
  pais: string;
};

const DIRECCION_VACIA: FormularioDireccion = {
  calle: '',
  numeroExterior: '',
  numeroInterior: '',
  colonia: '',
  municipio: '',
  estado: '',
  codigoPostal: '',
  pais: 'México',
};

function aFormularioDireccion(d: Direccion | null): FormularioDireccion {
  if (!d) return { ...DIRECCION_VACIA };
  return {
    calle: d.calle,
    numeroExterior: d.numeroExterior,
    numeroInterior: d.numeroInterior ?? '',
    colonia: d.colonia,
    municipio: d.municipio,
    estado: d.estado,
    codigoPostal: d.codigoPostal,
    pais: d.pais,
  };
}

/** Devuelve el objeto Direccion si la dirección tiene calle; si no, null (opcional). */
function aDireccionONull(f: FormularioDireccion): Direccion | null {
  if (!f.calle.trim()) return null;
  return {
    calle: f.calle.trim(),
    numeroExterior: f.numeroExterior.trim(),
    numeroInterior: f.numeroInterior.trim() || null,
    colonia: f.colonia.trim(),
    municipio: f.municipio.trim(),
    estado: f.estado.trim(),
    codigoPostal: f.codigoPostal.trim(),
    pais: f.pais.trim() || 'México',
  };
}

type Props = {
  /** Cliente a editar; ausente = alta. */
  cliente?: Cliente;
  onExito: () => void;
  onCancelar: () => void;
};

/**
 * Formulario de alta/edición de cliente. En alta llama a `crearClienteAccion`;
 * en edición a `actualizarClienteAccion`. La dirección de envío puede marcarse
 * "misma que la fiscal" (se copia al enviar). Validación fuerte en el servidor
 * (Zod); aquí se hace validación mínima de UX.
 */
export function FormularioCliente({ cliente, onExito, onCancelar }: Props) {
  const edicion = cliente !== undefined;

  const [razonSocial, setRazonSocial] = useState(cliente?.razonSocial ?? '');
  const [nombreComercial, setNombreComercial] = useState(cliente?.nombreComercial ?? '');
  const [rfc, setRfc] = useState(cliente?.rfc ?? '');
  const [contacto, setContacto] = useState(cliente?.contacto ?? '');
  const [correo, setCorreo] = useState(cliente?.correo ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [condicionesPago, setCondicionesPago] = useState<CondicionesPagoCliente | ''>(
    cliente?.condicionesPago ?? '',
  );
  const [limiteCredito, setLimiteCredito] = useState(String(cliente?.limiteCredito ?? 0));
  const [estado, setEstado] = useState<EstadoCliente>(cliente?.estado ?? 'activo');
  const [fiscal, setFiscal] = useState<FormularioDireccion>(
    aFormularioDireccion(cliente?.direccionFiscal ?? null),
  );
  const [envio, setEnvio] = useState<FormularioDireccion>(
    aFormularioDireccion(cliente?.direccionEnvio ?? null),
  );
  const [mismaQueFiscal, setMismaQueFiscal] = useState(
    edicion ? cliente?.direccionEnvio === null : true,
  );

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    const direccionFiscal = aDireccionONull(fiscal);
    const direccionEnvio = mismaQueFiscal ? direccionFiscal : aDireccionONull(envio);

    const base = {
      razonSocial,
      nombreComercial,
      rfc,
      contacto,
      correo,
      telefono,
      ...(condicionesPago !== '' ? { condicionesPago } : {}),
      limiteCredito: Number(limiteCredito) || 0,
      estado,
      direccionFiscal,
      direccionEnvio,
    };

    try {
      const respuesta = edicion
        ? await actualizarClienteAccion({ id: cliente!.id, ...base })
        : await crearClienteAccion(base);

      if (respuesta.exito) {
        onExito();
      } else {
        setError(respuesta.error);
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }
    setEnviando(false);
  }

  return (
    <form onSubmit={manejarEnvio} className="flex flex-col gap-5" noValidate>
      <section className="grid gap-4 sm:grid-cols-2">
        <Campo id="cli-razon" etiqueta="Razón social" valor={razonSocial} onCambio={setRazonSocial} />
        <Campo
          id="cli-nombre"
          etiqueta="Nombre comercial"
          valor={nombreComercial}
          onCambio={setNombreComercial}
        />
        <Campo id="cli-rfc" etiqueta="RFC (opcional)" valor={rfc} onCambio={setRfc} />
        <Campo
          id="cli-contacto"
          etiqueta="Contacto principal (opcional)"
          valor={contacto}
          onCambio={setContacto}
        />
        <Campo
          id="cli-correo"
          etiqueta="Correo (opcional)"
          tipo="email"
          valor={correo}
          onCambio={setCorreo}
        />
        <Campo
          id="cli-telefono"
          etiqueta="Teléfono (opcional)"
          tipo="tel"
          valor={telefono}
          onCambio={setTelefono}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="cli-condiciones" className={CLASE_ETIQUETA}>
            Condiciones de pago
          </label>
          <select
            id="cli-condiciones"
            value={condicionesPago}
            onChange={(e) => setCondicionesPago(e.target.value as CondicionesPagoCliente | '')}
            className={CLASE_INPUT}
          >
            <option value="">Sin especificar</option>
            <option value="contado">Contado</option>
            <option value="15_dias">15 días</option>
            <option value="30_dias">30 días</option>
            <option value="credito">Crédito</option>
          </select>
        </div>

        <Campo
          id="cli-limite"
          etiqueta="Límite de crédito (MXN)"
          tipo="number"
          valor={limiteCredito}
          onCambio={setLimiteCredito}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="cli-estado" className={CLASE_ETIQUETA}>
            Estado
          </label>
          <select
            id="cli-estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoCliente)}
            className={CLASE_INPUT}
          >
            <option value="prospecto">Prospecto</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
      </section>

      <fieldset className="flex flex-col gap-3 rounded-base border border-foreground/15 p-4">
        <legend className="px-1 text-sm font-semibold">Dirección fiscal</legend>
        <CamposDireccion prefijo="fiscal" valor={fiscal} onCambio={setFiscal} />
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mismaQueFiscal}
          onChange={(e) => setMismaQueFiscal(e.target.checked)}
        />
        La dirección de envío es la misma que la fiscal
      </label>

      {!mismaQueFiscal && (
        <fieldset className="flex flex-col gap-3 rounded-base border border-foreground/15 p-4">
          <legend className="px-1 text-sm font-semibold">Dirección de envío</legend>
          <CamposDireccion prefijo="envio" valor={envio} onCambio={setEnvio} />
        </fieldset>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className={CLASE_BOTON_SECUNDARIO}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className={CLASE_BOTON_PRIMARIO}>
          {enviando ? 'Guardando…' : edicion ? 'Guardar cambios' : 'Crear cliente'}
        </button>
      </div>
    </form>
  );
}

/** Campo de texto/numérico reutilizable. */
function Campo({
  id,
  etiqueta,
  valor,
  onCambio,
  tipo = 'text',
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  tipo?: 'text' | 'email' | 'tel' | 'number';
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={CLASE_ETIQUETA}>
        {etiqueta}
      </label>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className={CLASE_INPUT}
        min={tipo === 'number' ? 0 : undefined}
      />
    </div>
  );
}

/** Grupo de campos de una dirección. */
function CamposDireccion({
  prefijo,
  valor,
  onCambio,
}: {
  prefijo: string;
  valor: FormularioDireccion;
  onCambio: (v: FormularioDireccion) => void;
}) {
  function set<K extends keyof FormularioDireccion>(clave: K, v: string): void {
    onCambio({ ...valor, [clave]: v });
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo id={`${prefijo}-calle`} etiqueta="Calle" valor={valor.calle} onCambio={(v) => set('calle', v)} />
      <div className="grid grid-cols-2 gap-3">
        <Campo id={`${prefijo}-numext`} etiqueta="Núm. ext." valor={valor.numeroExterior} onCambio={(v) => set('numeroExterior', v)} />
        <Campo id={`${prefijo}-numint`} etiqueta="Núm. int." valor={valor.numeroInterior} onCambio={(v) => set('numeroInterior', v)} />
      </div>
      <Campo id={`${prefijo}-colonia`} etiqueta="Colonia" valor={valor.colonia} onCambio={(v) => set('colonia', v)} />
      <Campo id={`${prefijo}-municipio`} etiqueta="Municipio" valor={valor.municipio} onCambio={(v) => set('municipio', v)} />
      <Campo id={`${prefijo}-estado`} etiqueta="Estado" valor={valor.estado} onCambio={(v) => set('estado', v)} />
      <Campo id={`${prefijo}-cp`} etiqueta="Código postal" valor={valor.codigoPostal} onCambio={(v) => set('codigoPostal', v)} />
      <Campo id={`${prefijo}-pais`} etiqueta="País" valor={valor.pais} onCambio={(v) => set('pais', v)} />
    </div>
  );
}
