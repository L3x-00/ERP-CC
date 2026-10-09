'use client';

import { useEffect, useRef, useState } from 'react';

import { usarClientes } from '@/modulos/clientes/hooks/usar-clientes';
import { AltaRapidaCliente } from '@/modulos/pipeline/componentes/alta-rapida-cliente';
import { clienteAClienteRfq, type ClienteRfq } from '@/modulos/pipeline/tipos/indice';
import { ETIQUETA_CONDICIONES_PAGO } from '@/modulos/pipeline/utilidades/indice';
import { CLASE_CAMPO_FALTANTE } from '@/modulos/rfq/utilidades/faltantes';
import { Button } from '@/compartido/componentes/ui/button';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { cn } from '@/compartido/utilidades/cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Icono } from '@/compartido/componentes/navegacion/iconos';

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
  /** Marca el selector con borde rojo suave cuando falta el cliente. */
  invalido?: boolean;
};

/**
 * Selector de cliente para la RFQ — RFQ-02: busca en el catálogo, permite dar de
 * alta uno nuevo sin salir de la cotización y devuelve el elegido al formulario
 * que lo contiene. No persiste nada por sí mismo: quien lo monta decide si eso
 * es un alta (`crearProspectoAccion`) o un cambio sobre una oportunidad abierta
 * (`asignarClienteOportunidadAccion`).
 *
 * La búsqueda es un desplegable cerrable (X, clic fuera o Escape) que no empuja
 * el layout, y el alta rápida vive en un diálogo modal: así la captura nunca
 * duplica formularios ni alarga el scroll de la RFQ.
 *
 * El alcance de lo que se ve lo impone RLS sobre `clientes` (permiso
 * `ver_clientes`): sin él, la búsqueda simplemente no devuelve resultados.
 */
export function SelectorCliente({
  seleccionado,
  onSeleccionar,
  sugerencias,
  soloLectura = false,
  invalido = false,
}: Props) {
  const [abiertoBuscador, setAbiertoBuscador] = useState(false);
  const [enAlta, setEnAlta] = useState(false);
  const [texto, setTexto] = useState('');
  const [termino, setTermino] = useState('');
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const temporizador = setTimeout(() => setTermino(texto.trim()), RETARDO_BUSQUEDA);
    return () => clearTimeout(temporizador);
  }, [texto]);

  useEffect(() => {
    if (!abiertoBuscador) return;
    const manejarTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') setAbiertoBuscador(false);
    };
    const manejarClic = (evento: MouseEvent): void => {
      if (!contenedorRef.current?.contains(evento.target as Node)) setAbiertoBuscador(false);
    };
    document.addEventListener('keydown', manejarTecla);
    document.addEventListener('mousedown', manejarClic);
    return () => {
      document.removeEventListener('keydown', manejarTecla);
      document.removeEventListener('mousedown', manejarClic);
    };
  }, [abiertoBuscador]);

  function elegir(cliente: ClienteRfq | null): void {
    onSeleccionar(cliente);
    setAbiertoBuscador(false);
    setEnAlta(false);
    setTexto('');
  }

  if (seleccionado && !abiertoBuscador) {
    return (
      <div
        className={cn(
          'flex flex-col gap-2 rounded-lg border px-4 py-3',
          invalido ? 'border-peligro/40 bg-peligro-suave' : 'border-borde',
        )}
      >
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
      <div
        className={cn(
          'rounded-lg border px-4 py-3 text-sm text-texto-secundario',
          invalido ? 'border-peligro/40 bg-peligro-suave' : 'border-borde',
        )}
      >
        Sin cliente del catálogo ligado.
      </div>
    );
  }

  return (
    <div
      ref={contenedorRef}
      className={cn(
        'flex flex-col gap-3 rounded-lg border px-4 py-3',
        invalido ? 'border-peligro/40 bg-peligro-suave' : 'border-borde',
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="relative flex min-w-60 flex-1 flex-col gap-1">
          <Label htmlFor="rfq-buscar-cliente">Cliente (opcional)</Label>
          <Input
            id="rfq-buscar-cliente"
            type="search"
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value);
              setAbiertoBuscador(true);
            }}
            onFocus={() => setAbiertoBuscador(true)}
            aria-expanded={abiertoBuscador}
            aria-controls="rfq-clientes-sugerencias"
            aria-invalid={invalido}
            className={invalido ? CLASE_CAMPO_FALTANTE : undefined}
            placeholder="Buscar por razón social, nombre comercial o RFC"
          />
          {abiertoBuscador ? (
            <div
              id="rfq-clientes-sugerencias"
              aria-label="Clientes del catálogo"
              className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-borde bg-superficie shadow-lg"
            >
              <div className="flex items-center justify-between gap-2 border-b border-borde px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-texto-tenue">
                  Clientes del catálogo
                </span>
                <button
                  type="button"
                  onClick={() => setAbiertoBuscador(false)}
                  aria-label="Cerrar resultados de clientes"
                  className="rounded-md p-1 text-texto-secundario transition-colors hover:bg-superficie-2 hover:text-texto-primario focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
                >
                  <Icono nombre="cerrar" className="h-4 w-4" />
                </button>
              </div>
              <div className="p-2">
                <ResultadosClientes termino={termino} onElegir={elegir} />
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variante="contorno"
            tamano="sm"
            onClick={() => {
              setAbiertoBuscador(false);
              setEnAlta(true);
            }}
          >
            Nuevo cliente
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

      <Dialog open={enAlta} onOpenChange={setEnAlta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
            <DialogDescription>
              Se dará de alta como prospecto y quedará seleccionado en esta RFQ sin perder lo
              capturado.
            </DialogDescription>
          </DialogHeader>
          <AltaRapidaCliente
            nombreSugerido={sugerencias?.empresa ?? ''}
            contactoSugerido={sugerencias?.contacto ?? ''}
            correoSugerido={sugerencias?.correo ?? ''}
            telefonoSugerido={sugerencias?.telefono ?? ''}
            onCreado={elegir}
            onCancelar={() => setEnAlta(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Resultados del catálogo para el término buscado. Vive en su propio componente
 * para que la consulta solo exista mientras el desplegable está abierto.
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
    return <p className="p-2 text-xs text-texto-secundario">Buscando clientes…</p>;
  }

  if (isError) {
    return (
      <p role="alert" className="p-2 text-xs text-peligro-texto">
        No se pudo consultar el catálogo de clientes.
      </p>
    );
  }

  const registros = data?.registros ?? [];
  if (registros.length === 0) {
    return (
      <p className="p-2 text-xs text-texto-secundario">
        Sin clientes que coincidan. Usa “Nuevo cliente” para darlo de alta sin perder la RFQ.
      </p>
    );
  }

  return (
    <ul className="scroll-sutil flex max-h-64 flex-col gap-1 overflow-y-auto">
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
