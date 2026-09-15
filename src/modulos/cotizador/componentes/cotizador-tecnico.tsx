'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/compartido/componentes/ui/dialog';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { calcularCotizacionTecnica } from '../servicios/calcular-cotizacion-tecnica';
import { leerGeometria, type GeometriaEstimada, type UnidadGeometria } from '../servicios/leer-geometria';
import type { CotizacionTecnicaCalculada, ProcesoCotizacion } from '../tipos/indice';

type Campo = readonly [string, string, string?];
const PROCESOS: Record<ProcesoCotizacion, string> = { laser: 'Corte láser', router: 'Router CNC', doblado: 'Doblado', fabricacion: 'Fabricación', otros: 'Otros y flete' };
const EQUIPO: Campo[] = [['tarifas.maquinaHora', 'Tarifa máquina por hora'], ['tarifas.preparacionHora', 'Tarifa de preparación por hora']];
const CAMPOS: Record<ProcesoCotizacion, Campo[]> = {
  laser: [['perimetroM','Perímetro de corte (m)'],['velocidadMMin','Velocidad (m/min)'],['perforaciones','Perforaciones estimadas','0'],['preparacionHoras','Preparación (horas)','0'],['costoMaterial','Costo de material','0'],...EQUIPO,['tarifas.consumoGasHora','Consumo de gas por hora'],['tarifas.gas.O2','Costo unitario de O₂'],['tarifas.gas.N2','Costo unitario de N₂'],['tarifas.gas.aire','Costo unitario de aire'],['pierce.hasta3Mm','Segundos/perforación hasta 3 mm'],['pierce.hasta6Mm','Segundos/perforación hasta 6 mm'],['pierce.mayor6Mm','Segundos/perforación mayor a 6 mm']],
  router: [['horas','Maquinado (horas)'],['preparacionHoras','Preparación (horas)','0'],['fresas','Número de fresas','0'],['costoMaterial','Costo de material','0'],...EQUIPO,['tarifas.endmill','Costo End-mill'],['tarifas.ballnose','Costo Ball-nose']],
  doblado: [['longitudMm','Longitud de pieza (mm)'],['preparacionHoras','Preparación (horas)','0'],['costoMaterial','Costo de material','0'],...EQUIPO,['tarifas.segundoOperarioHora','Tarifa segundo operario por hora'],['tarifas.longitudMaximaMm','Longitud de referencia del equipo (mm)'],['tarifas.factorLongitudMaxima','Reducción de productividad a longitud máxima (0–1)'],['tarifas.piezasHora.simple','Piezas/hora, complejidad simple'],['tarifas.piezasHora.media','Piezas/hora, complejidad media'],['tarifas.piezasHora.compleja','Piezas/hora, complejidad compleja']],
  fabricacion: [['horasManoObra','Mano de obra (horas)','0'],['horasSoldadura','Soldadura (horas)','0'],['horasAcabado','Acabado (horas)','0'],['costoMaterial','Costo de material','0'],['subcontrato','Subcontrato y otros','0'],['tarifas.manoObraHora','Tarifa mano de obra por hora'],['tarifas.soldaduraHora','Tarifa soldadura por hora'],['tarifas.consumiblesHora','Consumibles de soldadura por hora'],['tarifas.acabadoHora','Tarifa acabado por hora']],
  otros: [['flete','Flete','0'],['adicionales','Costos adicionales','0']],
};

function aplanar(valor: unknown, prefijo = '', salida: Record<string, string> = {}): Record<string, string> {
  if (typeof valor === 'object' && valor !== null) for (const [clave, hijo] of Object.entries(valor)) aplanar(hijo, prefijo ? `${prefijo}.${clave}` : clave, salida);
  else if (valor !== undefined) salida[prefijo] = String(valor);
  return salida;
}

function FormularioTecnico({ moneda, cantidad, inicial, soloLectura, aplicar }: { moneda: 'MXN' | 'USD'; cantidad: number; inicial?: CotizacionTecnicaCalculada; soloLectura: boolean; aplicar: (calculo: CotizacionTecnicaCalculada) => void }) {
  const [campos, setCampos] = useState<Record<string,string>>(() => {
    const salida = aplanar(inicial?.entrada ?? { cantidad, material: 'Acero al carbono', recargoPorcentaje: 0, descuentoPorcentaje: 0 });
    const laser = inicial?.entrada.laser;
    if (laser) { salida.material = inicial?.entrada.material ?? laser.material; salida.espesorMm = String(inicial?.entrada.espesorMm ?? laser.espesorMm); const tiempos = laser.tarifas.segundosPerforacion[laser.material] ?? laser.tarifas.segundosPerforacion.Otro; if (tiempos) for (const [k,v] of Object.entries(tiempos)) salida[`laser.pierce.${k}`] = String(v); }
    return salida;
  });
  const [activos, setActivos] = useState<ProcesoCotizacion[]>(() => inicial?.procesos.map(p => p.proceso) ?? []);
  const [resultado, setResultado] = useState<CotizacionTecnicaCalculada | null>(inicial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [geometria, setGeometria] = useState<GeometriaEstimada | null>(null);
  const [unidad, setUnidad] = useState<UnidadGeometria | ''>('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const lectura = useRef(0);
  useEffect(() => () => { lectura.current++; }, []);
  const cambiar = (clave:string, valor:string) => { setCampos(prev => ({ ...prev, [clave]:valor })); setResultado(null); setError(null); };
  const leer = (clave:string, defecto='') => campos[clave] ?? defecto;
  const n = (clave:string, defecto='') => leer(clave,defecto).trim() === '' ? NaN : Number(leer(clave,defecto));
  const equipo = (proceso:ProcesoCotizacion) => ({ maquinaHora:n(`${proceso}.tarifas.maquinaHora`), preparacionHora:n(`${proceso}.tarifas.preparacionHora`) });

  function calcular(evento:FormEvent<HTMLFormElement>) {
    evento.preventDefault(); evento.stopPropagation(); setError(null);
    const material=leer('material'); const espesorMm=n('espesorMm');
    const entrada={moneda,cantidad:n('cantidad'),material,espesorMm,recargoPorcentaje:n('recargoPorcentaje','0'),descuentoPorcentaje:n('descuentoPorcentaje','0'),
      ...(activos.includes('laser')?{laser:{material,espesorMm,perimetroM:n('laser.perimetroM'),velocidadMMin:n('laser.velocidadMMin'),perforaciones:n('laser.perforaciones','0'),preparacionHoras:n('laser.preparacionHoras','0'),costoMaterial:n('laser.costoMaterial','0'),gas:leer('laser.gas','O2'),tarifas:{...equipo('laser'),consumoGasHora:n('laser.tarifas.consumoGasHora'),gas:{O2:n('laser.tarifas.gas.O2'),N2:n('laser.tarifas.gas.N2'),aire:n('laser.tarifas.gas.aire')},segundosPerforacion:{[material]:{hasta3Mm:n('laser.pierce.hasta3Mm'),hasta6Mm:n('laser.pierce.hasta6Mm'),mayor6Mm:n('laser.pierce.mayor6Mm')}}}}}:{}),
      ...(activos.includes('router')?{router:{horas:n('router.horas'),preparacionHoras:n('router.preparacionHoras','0'),fresas:n('router.fresas','0'),fresa:leer('router.fresa','endmill'),costoMaterial:n('router.costoMaterial','0'),tarifas:{...equipo('router'),endmill:n('router.tarifas.endmill'),ballnose:n('router.tarifas.ballnose')}}}:{}),
      ...(activos.includes('doblado')?{doblado:{complejidad:leer('doblado.complejidad','media'),longitudMm:n('doblado.longitudMm'),preparacionHoras:n('doblado.preparacionHoras','0'),dosOperarios:leer('doblado.dosOperarios','false')==='true',costoMaterial:n('doblado.costoMaterial','0'),tarifas:{...equipo('doblado'),segundoOperarioHora:n('doblado.tarifas.segundoOperarioHora'),longitudMaximaMm:n('doblado.tarifas.longitudMaximaMm'),factorLongitudMaxima:n('doblado.tarifas.factorLongitudMaxima'),piezasHora:{simple:n('doblado.tarifas.piezasHora.simple'),media:n('doblado.tarifas.piezasHora.media'),compleja:n('doblado.tarifas.piezasHora.compleja')}}}}:{}),
      ...(activos.includes('fabricacion')?{fabricacion:{horasManoObra:n('fabricacion.horasManoObra','0'),horasSoldadura:n('fabricacion.horasSoldadura','0'),horasAcabado:n('fabricacion.horasAcabado','0'),costoMaterial:n('fabricacion.costoMaterial','0'),subcontrato:n('fabricacion.subcontrato','0'),tarifas:{manoObraHora:n('fabricacion.tarifas.manoObraHora'),soldaduraHora:n('fabricacion.tarifas.soldaduraHora'),consumiblesHora:n('fabricacion.tarifas.consumiblesHora'),acabadoHora:n('fabricacion.tarifas.acabadoHora')}}}:{}),
      ...(activos.includes('otros')?{otros:{flete:n('otros.flete','0'),adicionales:n('otros.adicionales','0')}}:{}),
    };
    try { setResultado(calcularCotizacionTecnica(entrada)); } catch { setResultado(null); setError('Revisa los procesos, las tarifas y los valores positivos de cantidad, velocidad y productividad.'); }
  }
  async function procesarArchivo() {
    if (!archivo) return;
    const solicitud=++lectura.current; setLeyendo(true); setError(null); setGeometria(null);
    try {
      if (archivo.size>5*1024*1024) throw new Error('El plano debe tener como máximo 5 MiB');
      const extension=archivo.name.split('.').pop()?.toLowerCase();
      if (extension!=='dxf' && extension!=='eps' && extension!=='ai') throw new Error('Selecciona un archivo DXF, EPS o AI');
      const datos=leerGeometria(await archivo.text(),extension,unidad||undefined);
      if (solicitud!==lectura.current) return;
      setGeometria(datos);
      if (extension==='dxf') { setCampos(prev=>({...prev,'laser.perimetroM':String(datos.perimetroM),'laser.perforaciones':String(datos.perforacionesEstimadas)})); setResultado(null); }
    } catch (causa) { if(solicitud===lectura.current) setError(causa instanceof Error?causa.message:'No se pudo leer el plano'); }
    finally { if(solicitud===lectura.current) setLeyendo(false); }
  }
  return <form onSubmit={calcular} className="grid gap-5" aria-label="Cálculo técnico de la línea">
    <fieldset disabled={soloLectura} className="grid min-w-0 gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Material<Select value={leer('material')} onChange={e=>cambiar('material',e.target.value)}>{['Acero al carbono','Acero inoxidable','Aluminio','Otro'].map(m=><option key={m}>{m}</option>)}</Select></label>
        {(['espesorMm','cantidad','recargoPorcentaje','descuentoPorcentaje'] as const).map((clave,i)=><label key={clave} className="grid gap-1 text-sm">{['Espesor (mm)','Cantidad de piezas','Recargo sobre costo (%)','Descuento (%)'][i]}<Input type="number" required min={clave==='cantidad'?'0.01':i===0?'0.0001':'0'} step={clave==='cantidad'?'0.01':'any'} max={clave==='descuentoPorcentaje'?100:undefined} value={leer(clave,i>1?'0':'')} onChange={e=>cambiar(clave,e.target.value)} /></label>)}
      </div>
      <section className="grid gap-3 rounded-lg border border-borde bg-superficie-2 p-3"><h3 className="font-semibold">Medidas del plano</h3><label className="grid gap-1 text-sm">Archivo para lectura local (máximo 5 MiB)<Input type="file" accept=".dxf,.eps,.ai" onChange={e=>{lectura.current++;setLeyendo(false);setGeometria(null);setArchivo(e.target.files?.[0]??null);}} /></label>
        <label className="grid gap-1 text-sm">Unidad cuando el DXF no la declara<Select value={unidad} onChange={e=>setUnidad(e.target.value as UnidadGeometria|'')}><option value="">Seleccionar</option>{(['mm','cm','m','in','ft'] as const).map(u=><option key={u}>{u}</option>)}</Select></label>
        <Button type="button" variante="contorno" disabled={!archivo||leyendo} onClick={()=>void procesarArchivo()}>{leyendo?'Leyendo…':'Leer medidas'}</Button>
        <p className="text-xs text-texto-secundario">La lectura no adjunta el archivo a la cotización. EPS aporta dimensiones; AI requiere captura manual. Verifica los datos antes de aplicar.</p>
        {geometria&&<div className="grid gap-2 text-sm"><p>{geometria.anchoMm.toFixed(3)} × {geometria.altoMm.toFixed(3)} mm · Envolvente: {geometria.areaEnvolventeM2.toFixed(6)} m²</p><p>Perímetro estimado: {geometria.perimetroM.toFixed(6)} m · Perforaciones estimadas: {geometria.perforacionesEstimadas}</p>{geometria.advertencias.map(a=><p className="text-advertencia-texto" key={a}>{a}</p>)}</div>}
      </section>
      <div className="flex flex-wrap gap-4">{(Object.entries(PROCESOS) as [ProcesoCotizacion,string][]).map(([clave,nombre])=><label key={clave} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={activos.includes(clave)} onChange={e=>{setActivos(prev=>e.target.checked?[...prev,clave]:prev.filter(p=>p!==clave));setResultado(null);}}/>{nombre}</label>)}</div>
      <p className="text-sm text-texto-secundario">Importes y tarifas en {moneda}. Los costos corresponden al trabajo completo; indica cero cuando un concepto no tenga costo.</p>
      {activos.map(proceso=><section key={proceso} className="grid gap-3 rounded-lg border border-borde p-3"><h3 className="font-semibold">{PROCESOS[proceso]}</h3>
        {proceso==='laser'&&<label className="grid gap-1 text-sm">Gas<Select value={leer('laser.gas','O2')} onChange={e=>cambiar('laser.gas',e.target.value)}><option value="O2">O₂</option><option value="N2">N₂</option><option value="aire">Aire</option></Select></label>}
        {proceso==='router'&&<label className="grid gap-1 text-sm">Tipo de fresa<Select value={leer('router.fresa','endmill')} onChange={e=>cambiar('router.fresa',e.target.value)}><option value="endmill">End-mill</option><option value="ballnose">Ball-nose</option></Select></label>}
        {proceso==='doblado'&&<><label className="grid gap-1 text-sm">Complejidad<Select value={leer('doblado.complejidad','media')} onChange={e=>cambiar('doblado.complejidad',e.target.value)}><option value="simple">Simple</option><option value="media">Media</option><option value="compleja">Compleja</option></Select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={leer('doblado.dosOperarios')==='true'} onChange={e=>cambiar('doblado.dosOperarios',String(e.target.checked))}/>Segundo operario</label></>}
        <div className="grid gap-3 sm:grid-cols-2">{CAMPOS[proceso].map(([clave,etiqueta,defecto])=><label key={clave} className="grid gap-1 text-sm">{etiqueta}<Input type="number" required min="0" step="any" value={leer(`${proceso}.${clave}`,defecto)} onChange={e=>cambiar(`${proceso}.${clave}`,e.target.value)}/></label>)}</div>
      </section>)}
      <Button type="submit" disabled={activos.length===0||leyendo}>Calcular precio</Button>
    </fieldset>
    {error&&<p role="alert" className="text-sm text-peligro-texto">{error}</p>}
    {resultado&&<section className="grid gap-3 rounded-lg border border-borde bg-superficie-2 p-4" aria-label="Resultado del cálculo"><h3 className="font-semibold">Desglose en {moneda}</h3>{resultado.procesos.map(p=><p key={p.proceso} className="flex justify-between gap-2 text-sm"><span>{PROCESOS[p.proceso]}</span><span>{formatearMoneda(p.total,moneda)}</span></p>)}<p>Material: {formatearMoneda(resultado.costoMaterial,moneda)} · Servicios: {formatearMoneda(resultado.costoServicios,moneda)} · Otros: {formatearMoneda(resultado.costoOtros,moneda)}</p><p>Costo total: {formatearMoneda(resultado.costoTotal,moneda)} · Costo unitario: {formatearMoneda(resultado.costoTotal/resultado.entrada.cantidad,moneda)}</p><p className="text-lg font-semibold">Precio unitario: {formatearMoneda(resultado.precioUnitario,moneda)}</p><p>Precio total sin IVA: {formatearMoneda(resultado.precioTotal,moneda)}</p>{resultado.advertencias.map(a=><p key={a} className="text-sm text-advertencia-texto">{a}</p>)}{!soloLectura&&<Button type="button" onClick={()=>aplicar(resultado)}>Aplicar a la línea</Button>}</section>}
  </form>;
}

export function CotizadorTecnico({ moneda, cantidad, inicial, soloLectura=false, onAplicar }: { moneda:'MXN'|'USD'; cantidad:number; inicial?:CotizacionTecnicaCalculada; soloLectura?:boolean; onAplicar:(calculo:CotizacionTecnicaCalculada)=>void }) {
  const [abierto,setAbierto]=useState(false);
  return <><Button type="button" variante="contorno" onClick={()=>setAbierto(true)}>{soloLectura?'Consultar cálculo técnico':'Calcular precio por procesos'}</Button><Dialog open={abierto} onOpenChange={setAbierto}><DialogContent className="sm:max-w-4xl"><DialogHeader><DialogTitle>Cálculo técnico de la pieza</DialogTitle><DialogDescription>Combina procesos y revisa el precio antes de aplicarlo a esta línea.</DialogDescription></DialogHeader>{abierto&&<FormularioTecnico moneda={moneda} cantidad={cantidad} inicial={inicial} soloLectura={soloLectura} aplicar={calculo=>{onAplicar(calculo);setAbierto(false);}}/>}</DialogContent></Dialog></>;
}
