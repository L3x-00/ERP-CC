'use client';

import { useEffect, useState } from 'react';

import { usarClientes } from '@/modulos/clientes/hooks/usar-clientes';
import { AltaRapidaCliente } from '@/modulos/pipeline/componentes/alta-rapida-cliente';
import { clienteAClienteRfq, type ClienteRfq } from '@/modulos/pipeline/tipos/indice';
import { ETIQUETA_CONDICIONES_PAGO } from '@/modulos/pipeline/utilidades/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

/** Espera tras la última tecla antes de consultar el catálogo (ms). */
const RETARDO_BUSQUEDA = 300;

type Sugerencias = {
  empresa?: string;
  contacto?: string;
  correo?: string;
  telefono?: string;
};

type Props = {
  seleccionado: ClienteRfq | null;
  onSeleccionar: (cliente: ClienteRfq | null) => void;
  /** Datos ya capturados en la RFQ, para precargar el alta rápida. */
  sugerencias?: Sugerencias;
  soloLectura?: boolean;
};

/**
 * Selector de cliente para la RFQ — RFQ-02: busca en el catálogo, permite dar de
 * alta uno nuevo sin salir de la cotización y devuelve el elegido al formulario
 * que lo contiene. No persiste nada por sí mismo: quien lo monta decide si eso
 * es un alta (`crearProspectoAccion`) o un cambio sobre una oportunidad abierta
 * (`asignarClienteOportunidadAccion`).
 *
 * El alcance de lo que se ve lo impone RLS sobre `clientes` (permiso
 * `ver_clientes`): sin él, la búsqueda simplemente no devuelve resultados.
 */
export function SelectorCliente({
  seleccionado,
  onSeleccionar,
  sugerencias,
  soloLectura = false,
}: Props) {
  const [abiertoBuscador, setAbiertoBuscador] = useState(false);
  const [enAlta, setEnAlta] = useState(false);
  const [texto, setTexto] = useState('');
  const [termino, setTermino] = useState('');

  useEffect(() => {
    const temporizador = setTimeout(() => setTermino(texto.trim()), RETARDO_BUSQUEDA);
    return () => clearTimeout(temporizador);
  }, [texto]);

  function elegir(cliente: ClienteRfq | null): void {
    onSeleccionar(cliente);
    setAbiertoBuscador(false);
    setEnAlta(false);
    setTexto('');
  }

  if (seleccionado && !abiertoBuscador) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-borde px-4 py-3">
        <span className="text-sm font-medium text-texto-primario">Cliente</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-texto-primario">{seleccionado.razonSocial}</span>
          {seleccionado.nombreComercial !== seleccionado.razonSocial && (
            <span className="text-xs text-texto-secundario">({seleccionado.nombreComercial})</span>
          )}
          {seleccionado.rfc !== null && (
            <span className="text-xs text-texto-secundario">{seleccionado.rfc}</span>
          )}
          {seleccionado.estado !== 'activo' && (
            <Badge variante={seleccionado.estado === 'inactivo' ? 'alerta' : 'info'}>
              {seleccionado.estado === 'inactivo' ? 'Inactivo' : 'Prospecto'}
            </Badge>
          )}
        </div>
        {!soloLectura && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              onClick={() => setAbiertoBuscador(true)}
            >
              Cambiar cliente
            </Button>
            <Button type="button" variante="fantasma" tamano="sm" onClick={() => elegir(null)}>
              Quitar
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (soloLectura) {
    return (
      <div className="rounded-lg border border-borde px-4 py-3 text-sm text-texto-secundario">
        Sin cliente del catálogo ligado.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <Label htmlFor="rfq-buscar-cliente">Cliente (opcional)</Label>
          <Input
            id="rfq-buscar-cliente"
            type="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Buscar por razón social, nombre comercial o RFC"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variante="contorno"
            tamano="sm"
            onClick={() => setEnAlta((valor) => !valor)}
          >
            {enAlta ? 'Cerrar alta' : 'Nuevo cliente'}
          </Button>
          {seleccionado && (
            <Button
              type="button"
              variante="fantasma"
              tamano="sm"
              onClick={() => setAbiertoBuscador(false)}
            >
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {enAlta ? (
        <AltaRapidaCliente
          nombreSugerido={sugerencias?.empresa ?? ''}
          contactoSugerido={sugerencias?.contacto ?? ''}
          correoSugerido={sugerencias?.correo ?? ''}
          telefonoSugerido={sugerencias?.telefono ?? ''}
          onCreado={elegir}
          onCancelar={() => setEnAlta(false)}
        />
      ) : (
        <ResultadosClientes termino={termino} onElegir={elegir} />
      )}
    </div>
  );
}

/**
 * Resultados del catálogo para el término buscado. Vive en su propio componente
 * para que la consulta solo exista mientras el buscador está abierto.
 */
function ResultadosClientes({
  termino,
  onElegir,
}: {
  termino: string;
  onElegir: (cliente: ClienteRfq) => void;
}) {
  const { data, isLoading, isError } = usarClientes(
    termino === '' ? undefined : { busqueda: termino },
  );

  if (isLoading) {
    return <p className="text-xs text-texto-secundario">Buscando clientes…</p>;
  }

  if (isError) {
    return (
      <p role="alert" className="text-xs text-peligro-texto">
        No se pudo consultar el catálogo de clientes.
      </p>
    );
  }

  const registros = data?.registros ?? [];
  if (registros.length === 0) {
    return (
      <p className="text-xs text-texto-secundario">
        Sin clientes que coincidan. Usa “Nuevo cliente” para darlo de alta sin perder la RFQ.
      </p>
    );
  }

  return (
    <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
      {registros.map((cliente) => (
        <li key={cliente.id}>
          <button
            type="button"
            onClick={() => onElegir(clienteAClienteRfq(cliente))}
            className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-superficie-2"
          >
            <span className="text-sm text-texto-primario">{cliente.razonSocial}</span>
            <span className="text-xs text-texto-secundario">
              {cliente.rfc ?? 'Sin RFC'}
              {cliente.condicionesPago !== null &&
                ` · ${ETIQUETA_CONDICIONES_PAGO[cliente.condicionesPago]}`}
              {cliente.estado !== 'activo' && ` · ${cliente.estado === 'inactivo' ? 'Inactivo' : 'Prospecto'}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
