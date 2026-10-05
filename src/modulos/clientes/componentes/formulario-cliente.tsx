'use client';

import { useState, type FormEvent } from 'react';

import { crearClienteAccion } from '@/modulos/clientes/acciones/crear-cliente';
import { actualizarClienteAccion } from '@/modulos/clientes/acciones/actualizar-cliente';
import type {
  Cliente,
  Direccion,
  MonedaCliente,
} from '@/modulos/clientes/tipos/indice';

const CLASE_INPUT =
  'rounded-base border border-borde-fuerte bg-superficie px-3 py-2 text-sm text-foreground outline-none focus:border-primario focus:ring-2 focus:ring-primario/30 disabled:cursor-not-allowed disabled:opacity-60';
const CLASE_ETIQUETA = 'text-sm font-medium';
const CLASE_BOTON_PRIMARIO =
  'rounded-base bg-primario px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const CLASE_BOTON_SECUNDARIO =
  'rounded-base border border-borde-fuerte px-4 py-2 text-sm font-medium hover:bg-superficie-2';

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
  /** Permite editar crédito/días (SII-B2.4); el servidor lo revalida. */
  puedeComercial?: boolean;
  /** Permite editar el límite de crédito; el servidor lo revalida. */
  puedeFinanzas?: boolean;
  onExito: () => void;
  onCancelar: () => void;
};

/**
 * Formulario maestro de alta/edición (SII-B2.2/B2.7). En alta llama a la RPC
 * atómica `crearClienteAccion` (cliente + contacto principal); en edición a
 * `actualizarClienteAccion`. Secciones: General, Contacto principal (alta),
 * Comercial y Direcciones. El estado no se edita aquí: cambia por acción.
 */
export function FormularioCliente({
  cliente,
  puedeComercial = false,
  puedeFinanzas = false,
  onExito,
  onCancelar,
}: Props) {
  const edicion = cliente !== undefined;

  const [razonSocial, setRazonSocial] = useState(cliente?.razonSocial ?? '');
  const [nombreComercial, setNombreComercial] = useState(cliente?.nombreComercial ?? '');
  const [rfc, setRfc] = useState(cliente?.rfc ?? '');
  const [correo, setCorreo] = useState(cliente?.correo ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoPuesto, setContactoPuesto] = useState('');
  const [contactoCorreo, setContactoCorreo] = useState('');
  const [contactoTelefono, setContactoTelefono] = useState('');
  const [moneda, setMoneda] = useState<MonedaCliente>(cliente?.moneda ?? 'MXN');
  const [creditoHabilitado, setCreditoHabilitado] = useState(
    cliente?.creditoHabilitado ?? false,
  );
  const [diasCredito, setDiasCredito] = useState(
    String(cliente?.diasCredito ?? (cliente?.creditoHabilitado ? 30 : 45)),
  );
  const [limiteCredito, setLimiteCredito] = useState(String(cliente?.limiteCredito ?? 0));
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

  function diasResueltos(): number {
    return creditoHabilitado ? Math.max(1, Math.min(365, Number(diasCredito) || 0)) : 0;
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    const direccionFiscal = aDireccionONull(fiscal);
    const direccionEnvio = mismaQueFiscal ? direccionFiscal : aDireccionONull(envio);

    try {
      if (edicion && cliente) {
        const cambios: Record<string, unknown> = {
          id: cliente.id,
          razonSocial,
          nombreComercial,
          rfc,
          correo,
          telefono,
          direccionFiscal,
          direccionEnvio,
        };
        if (moneda !== cliente.moneda) cambios.moneda = moneda;
        const dias = diasResueltos();
        if (
          creditoHabilitado !== cliente.creditoHabilitado ||
          (creditoHabilitado && dias !== (cliente.diasCredito ?? 0))
        ) {
          cambios.creditoHabilitado = creditoHabilitado;
          cambios.diasCredito = dias;
        }
        const limite = Number(limiteCredito) || 0;
        if (limite !== cliente.limiteCredito) cambios.limiteCredito = limite;

        const respuesta = await actualizarClienteAccion(cambios);
        if (!respuesta.exito) {
          setError(respuesta.error);
          return;
        }
      } else {
        const respuesta = await crearClienteAccion({
          razonSocial,
          nombreComercial,
          rfc,
          correo,
          telefono,
          limiteCredito: Number(limiteCredito) || 0,
          estado: 'activo',
          moneda,
          creditoHabilitado,
          diasCredito: diasResueltos(),
          direccionFiscal,
          direccionEnvio,
          ...(contactoNombre.trim()
            ? {
                contactoPrincipal: {
                  nombre: contactoNombre,
                  puesto: contactoPuesto,
                  correo: contactoCorreo,
                  telefono: contactoTelefono,
                },
              }
            : {}),
        });
        if (!respuesta.exito) {
          setError(respuesta.error);
          return;
        }
      }
      onExito();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={manejarEnvio} className="flex flex-col gap-5" noValidate>
      {edicion && cliente?.folio && (
        <p className="text-sm text-texto-secundario">
          Folio <span className="font-mono font-medium text-texto-primario">{cliente.folio}</span>
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-texto-primario">General</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="cli-razon" etiqueta="Razón social" valor={razonSocial} onCambio={setRazonSocial} />
          <Campo
            id="cli-nombre"
            etiqueta="Nombre comercial"
            valor={nombreComercial}
            onCambio={setNombreComercial}
          />
          <Campo id="cli-rfc" etiqueta="RFC (opcional)" valor={rfc} onCambio={setRfc} />
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
        </div>
      </section>

      {!edicion && (
        <section className="flex flex-col gap-3 rounded-base border border-borde p-4">
          <h3 className="text-sm font-semibold text-texto-primario">Contacto principal</h3>
          <p className="text-xs text-texto-secundario">
            Se crea junto con el cliente en una sola operación (alta atómica).
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="cli-contacto-nombre"
              etiqueta="Nombre del contacto"
              valor={contactoNombre}
              onCambio={setContactoNombre}
            />
            <Campo
              id="cli-contacto-puesto"
              etiqueta="Puesto o área (opcional)"
              valor={contactoPuesto}
              onCambio={setContactoPuesto}
            />
            <Campo
              id="cli-contacto-correo"
              etiqueta="Correo del contacto (opcional)"
              tipo="email"
              valor={contactoCorreo}
              onCambio={setContactoCorreo}
            />
            <Campo
              id="cli-contacto-telefono"
              etiqueta="Teléfono del contacto (opcional)"
              tipo="tel"
              valor={contactoTelefono}
              onCambio={setContactoTelefono}
            />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-base border border-borde p-4">
        <h3 className="text-sm font-semibold text-texto-primario">Comercial</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="cli-moneda" className={CLASE_ETIQUETA}>
              Moneda
            </label>
            <select
              id="cli-moneda"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as MonedaCliente)}
              className={CLASE_INPUT}
            >
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={creditoHabilitado}
              onChange={(e) => setCreditoHabilitado(e.target.checked)}
              disabled={edicion && !puedeComercial}
            />
            Crédito habilitado
          </label>

          <div className="flex flex-col gap-1">
            <label htmlFor="cli-dias" className={CLASE_ETIQUETA}>
              Días de crédito
            </label>
            <input
              id="cli-dias"
              type="number"
              min={1}
              max={365}
              value={diasCredito}
              onChange={(e) => setDiasCredito(e.target.value)}
              disabled={!creditoHabilitado || (edicion && !puedeComercial)}
              className={CLASE_INPUT}
            />
          </div>

          <Campo
            id="cli-limite"
            etiqueta="Límite de crédito"
            tipo="number"
            valor={limiteCredito}
            onCambio={setLimiteCredito}
            deshabilitado={edicion && !puedeFinanzas}
          />
        </div>
      </section>

      <fieldset className="flex flex-col gap-3 rounded-base border border-borde p-4">
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
        <fieldset className="flex flex-col gap-3 rounded-base border border-borde p-4">
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
  deshabilitado = false,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  tipo?: 'text' | 'email' | 'tel' | 'number';
  deshabilitado?: boolean;
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
        disabled={deshabilitado}
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
