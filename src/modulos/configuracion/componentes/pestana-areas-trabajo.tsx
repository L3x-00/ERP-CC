'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { guardarAreaTrabajoAccion } from '@/modulos/configuracion/acciones/indice';
import type { AreaTrabajoConfig } from '@/modulos/configuracion/tipos/indice';

export function PestanaAreasTrabajo({ datos, onGuardado }: { datos: readonly AreaTrabajoConfig[]; onGuardado: (area: AreaTrabajoConfig) => void }) {
  const [seleccionada, setSeleccionada] = useState<AreaTrabajoConfig | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [formulario, setFormulario] = useState({ codigo: '', nombre: '', colorHex: '#3B82F6', costoHoraInterno: '0', tarifaHoraVenta: '0', esExterno: false, activo: true, orden: '0' });

  function cargarFormulario(area: AreaTrabajoConfig): void {
    setFormulario({
      codigo: area.codigo,
      nombre: area.nombre,
      colorHex: area.colorHex,
      costoHoraInterno: String(area.costoHoraInterno),
      tarifaHoraVenta: String(area.tarifaHoraVenta),
      esExterno: area.esExterno,
      activo: area.activo,
      orden: String(area.orden),
    });
  }

  function nuevo(): void {
    setSeleccionada(null);
    setFormulario({ codigo: '', nombre: '', colorHex: '#3B82F6', costoHoraInterno: '0', tarifaHoraVenta: '0', esExterno: false, activo: true, orden: '0' });
    setMensaje(null);
  }

  async function guardar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await guardarAreaTrabajoAccion({
        id: seleccionada?.id,
        codigo: formulario.codigo,
        nombre: formulario.nombre,
        colorHex: formulario.colorHex,
        costoHoraInterno: Number(formulario.costoHoraInterno),
        tarifaHoraVenta: Number(formulario.tarifaHoraVenta),
        esExterno: formulario.esExterno,
        activo: formulario.activo,
        orden: Number(formulario.orden),
      });
      if (!respuesta.exito || !respuesta.datos) setMensaje(respuesta.exito ? 'No se recibió el área actualizada' : respuesta.error);
      else { onGuardado(respuesta.datos); setMensaje('Área guardada'); }
    } catch {
      setMensaje('No se pudo guardar el área');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <section aria-labelledby="titulo-areas-config" className="grid gap-3">
        <div className="flex items-center justify-between gap-2"><h2 id="titulo-areas-config" className="text-lg font-semibold text-texto-primario">Áreas configuradas</h2><Button tamano="sm" variante="contorno" onClick={nuevo}>Nueva área</Button></div>
        {datos.length === 0 ? (
          <EstadoVacio
            titulo="Sin áreas configuradas"
            descripcion="Crea la primera área de trabajo para definir tarifas internas y de venta."
          />
        ) : (
          <TablaContenedor>
            <Tabla className="min-w-[620px]">
              <caption className="sr-only">Tarifas por área de trabajo</caption>
              <TablaEncabezado>
                <tr>
                  <TablaEncabezadoCelda>Código</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Área</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Interno/h</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Venta/h</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Estado</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda><span className="sr-only">Acción</span></TablaEncabezadoCelda>
                </tr>
              </TablaEncabezado>
              <TablaCuerpo>
                {datos.map((area) => (
                  <TablaFila key={area.id} className="h-12">
                    <TablaCelda className="font-mono">{area.codigo}</TablaCelda>
                    <TablaCelda>
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 shrink-0 rounded-full border border-borde"
                          style={{ backgroundColor: area.colorHex }}
                        />
                        {area.nombre}
                      </span>
                    </TablaCelda>
                    <TablaCelda className="tabular-nums">{area.costoHoraInterno.toFixed(2)}</TablaCelda>
                    <TablaCelda className="tabular-nums">{area.tarifaHoraVenta.toFixed(2)}</TablaCelda>
                    <TablaCelda><BadgeEstado estado={area.activo ? 'activo' : 'inactivo'} /></TablaCelda>
                    <TablaCelda>
                      <Button tamano="sm" variante="fantasma" onClick={() => { setSeleccionada(area); cargarFormulario(area); }}>Editar</Button>
                    </TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </TablaContenedor>
        )}
      </section>
      <form className="grid content-start gap-3 rounded-lg border border-borde bg-superficie p-4" onSubmit={guardar} aria-label="Editor de área de trabajo">
        <h2 className="text-lg font-semibold">{seleccionada ? `Editar ${seleccionada.codigo}` : 'Nueva área'}</h2>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-codigo">Código<Input id="configuracion-area-codigo" value={formulario.codigo} onChange={(e) => setFormulario((v) => ({ ...v, codigo: e.target.value.toUpperCase() }))} required maxLength={49} /></label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-nombre">Nombre<Input id="configuracion-area-nombre" value={formulario.nombre} onChange={(e) => setFormulario((v) => ({ ...v, nombre: e.target.value }))} required maxLength={120} /></label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-color">Color hexadecimal<Input id="configuracion-area-color" type="color" value={formulario.colorHex} onChange={(e) => setFormulario((v) => ({ ...v, colorHex: e.target.value }))} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-costo">Costo interno/h<Input id="configuracion-area-costo" type="number" min="0" step="0.01" value={formulario.costoHoraInterno} onChange={(e) => setFormulario((v) => ({ ...v, costoHoraInterno: e.target.value }))} required /></label><label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-venta">Tarifa venta/h<Input id="configuracion-area-venta" type="number" min="0" step="0.01" value={formulario.tarifaHoraVenta} onChange={(e) => setFormulario((v) => ({ ...v, tarifaHoraVenta: e.target.value }))} required /></label></div>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-orden">Orden<Input id="configuracion-area-orden" type="number" min="0" step="1" value={formulario.orden} onChange={(e) => setFormulario((v) => ({ ...v, orden: e.target.value }))} required /></label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={formulario.esExterno} onChange={(e) => setFormulario((v) => ({ ...v, esExterno: e.target.checked }))} /> Capacidad externa</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={formulario.activo} onChange={(e) => setFormulario((v) => ({ ...v, activo: e.target.checked }))} /> Área activa</label>
        <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar área'}</Button>{mensaje ? <p role="status" className="text-sm text-texto-secundario">{mensaje}</p> : null}</div>
      </form>
    </div>
  );
}
