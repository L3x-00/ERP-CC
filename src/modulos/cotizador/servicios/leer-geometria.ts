export type UnidadGeometria = 'mm' | 'cm' | 'm' | 'in' | 'ft';
export interface GeometriaEstimada {
  anchoMm: number;
  altoMm: number;
  perimetroM: number;
  areaEnvolventeM2: number;
  perforacionesEstimadas: number;
  unidad: UnidadGeometria;
  advertencias: string[];
  estimado: true;
}
type Par = [number, string];
type Punto = { x: number; y: number; bulge?: number };
const TAU = Math.PI * 2;
const FACTORES: Record<UnidadGeometria, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const UNIDADES_DXF: Record<number, UnidadGeometria> = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };
const MAXIMO_BYTES = 5 * 1024 * 1024;
const MAXIMO_ENTIDADES = 10_000;

function numero(texto: string | undefined, respaldo?: number): number {
  if (texto === undefined && respaldo !== undefined) return respaldo;
  if (texto === undefined || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(texto)) throw new Error('Coordenada o parámetro numérico inválido');
  const valor = Number(texto);
  if (!Number.isFinite(valor) || Math.abs(valor) > 1e12) throw new Error('Geometría fuera del rango permitido');
  return valor;
}
const valor = (pares: Par[], codigo: number, respaldo?: number) => numero(pares.find(([c]) => c === codigo)?.[1], respaldo);
const normalizar = (angulo: number) => ((angulo % TAU) + TAU) % TAU;
function barrido(inicio: number, fin: number): number {
  if (Math.abs(fin - inicio) >= TAU - 1e-10) return TAU;
  const longitud = normalizar(fin - inicio);
  if (longitud < 1e-12) throw new Error('Arco sin barrido angular');
  return longitud;
}
function estaEnArco(angulo: number, inicio: number, amplitud: number): boolean {
  return (amplitud >= 0 ? normalizar(angulo - inicio) : normalizar(inicio - angulo)) <= Math.abs(amplitud) + 1e-10;
}

/** Lee únicamente ENTITIES del espacio modelo. Las magnitudes son estimaciones
 * de corte, no áreas netas ni trayectorias CAM. Nunca evalúa contenido del archivo.
 */
export function leerGeometria(contenido: string, formato: 'dxf' | 'eps' | 'ai', unidadManual?: UnidadGeometria): GeometriaEstimada {
  if (typeof contenido !== 'string' || contenido.length > MAXIMO_BYTES || new TextEncoder().encode(contenido).byteLength > MAXIMO_BYTES) throw new Error('El plano debe tener como máximo 5 MiB');
  if (formato === 'ai') throw new Error('AI requiere captura manual o exportación a DXF/EPS');
  if (formato === 'eps') return leerEps(contenido);
  if (formato !== 'dxf' || contenido.includes('\0') || contenido.startsWith('AutoCAD Binary DXF')) throw new Error('Se requiere un DXF de texto');
  if (unidadManual && !Object.hasOwn(FACTORES, unidadManual)) throw new Error('Unidad manual no admitida');
  const lineas = contenido.replace(/^\uFEFF/, '').trimEnd().split(/\r\n|\n|\r/).map(linea => linea.trim());
  if (lineas.length % 2 !== 0 || lineas.length > 500_000) throw new Error('DXF incompleto o demasiado complejo');
  const pares: Par[] = [];
  for (let i = 0; i < lineas.length; i += 2) {
    if (!/^\d{1,4}$/.test(lineas[i])) throw new Error('Código de grupo DXF inválido');
    pares.push([Number(lineas[i]), lineas[i + 1]]);
  }
  if (!pares.some(([codigo, texto]) => codigo === 0 && texto === 'EOF')) throw new Error('DXF incompleto: falta EOF');
  let seccion = ''; let unidad: UnidadGeometria | undefined; let entidades = false;
  const registros: { tipo: string; datos: Par[] }[] = [];
  for (let i = 0; i < pares.length; i++) {
    const [codigo, texto] = pares[i];
    if (codigo === 0 && texto === 'EOF') { if (seccion || i !== pares.length - 1) throw new Error('DXF incompleto o con datos después de EOF'); break; }
    if (codigo === 0 && texto === 'SECTION') { if (seccion || pares[i + 1]?.[0] !== 2) throw new Error('Sección DXF inválida'); seccion = pares[++i][1]; if (seccion === 'ENTITIES') entidades = true; continue; }
    if (codigo === 0 && texto === 'ENDSEC') { if (!seccion) throw new Error('Cierre de sección DXF inválido'); seccion = ''; continue; }
    if (seccion === 'HEADER' && codigo === 9 && texto === '$INSUNITS') unidad = UNIDADES_DXF[numero(pares[i + 1]?.[1])];
    if (seccion !== 'ENTITIES' || codigo !== 0) continue;
    const datos: Par[] = [];
    while (i + 1 < pares.length && pares[i + 1][0] !== 0) datos.push(pares[++i]);
    registros.push({ tipo: texto, datos });
    if (registros.length > MAXIMO_ENTIDADES) throw new Error('El plano excede el límite de entidades');
  }
  if (!entidades) throw new Error('No se encontró la sección ENTITIES');
  const advertencias = new Set<string>(['El área es la envolvente rectangular; las perforaciones requieren revisión del recorrido de corte.']);
  if (!unidad) { if (!unidadManual) throw new Error('DXF sin unidad compatible: selecciona la unidad del dibujo'); unidad = unidadManual; advertencias.add('Se utilizó la unidad indicada manualmente.'); }
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  let longitud = 0; let perforaciones = 0;
  const incluir = ({ x, y }: Punto) => { if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Geometría no finita'); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  const segmento = (a: Punto, b: Punto) => { incluir(a); incluir(b); longitud += Math.hypot(b.x - a.x, b.y - a.y); };
  const arco = (centro: Punto, radio: number, inicio: number, amplitud: number) => {
    if (!(radio > 0)) throw new Error('Radio inválido');
    const punto = (angulo: number) => ({ x: centro.x + radio * Math.cos(angulo), y: centro.y + radio * Math.sin(angulo) });
    incluir(punto(inicio)); incluir(punto(inicio + amplitud));
    for (const angulo of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) if (estaEnArco(angulo, inicio, amplitud)) incluir(punto(angulo));
    longitud += radio * Math.abs(amplitud);
  };
  const polilinea = (puntos: Punto[], cerrada: boolean) => {
    if (puntos.length < 2) throw new Error('Polilínea sin vértices suficientes');
    for (let j = 0; j < puntos.length - (cerrada ? 0 : 1); j++) {
      const a = puntos[j]; const b = puntos[(j + 1) % puntos.length]; const curvatura = a.bulge ?? 0;
      if (Math.abs(curvatura) < 1e-12) { segmento(a, b); continue; }
      const dx = b.x - a.x; const dy = b.y - a.y; const cuerda = Math.hypot(dx, dy);
      if (cuerda === 0) throw new Error('Curvatura con extremos coincidentes');
      const factor = (1 - curvatura * curvatura) / (4 * curvatura);
      const centro = { x: (a.x + b.x) / 2 - dy * factor, y: (a.y + b.y) / 2 + dx * factor };
      arco(centro, cuerda * (1 + curvatura * curvatura) / (4 * Math.abs(curvatura)), Math.atan2(a.y - centro.y, a.x - centro.x), 4 * Math.atan(curvatura));
    }
    perforaciones++;
  };
  const puntosRepetidos = (datos: Par[], codigoX = 10): Punto[] => {
    const puntos: Punto[] = [];
    for (const [codigo, texto] of datos) {
      if (codigo === codigoX) puntos.push({ x: numero(texto), y: NaN });
      else if (codigo === codigoX + 10 && puntos.length) puntos[puntos.length - 1].y = numero(texto);
      else if (codigo === 42 && puntos.length) puntos[puntos.length - 1].bulge = numero(texto);
    }
    return puntos;
  };
  for (let i = 0; i < registros.length; i++) {
    const { tipo, datos } = registros[i];
    if (valor(datos, 67, 0) === 1) { advertencias.add('Se omitieron entidades del espacio papel.'); continue; }
    if (valor(datos, 210, 0) !== 0 || valor(datos, 220, 0) !== 0 || valor(datos, 230, 1) !== 1 || datos.some(([c, v]) => [30, 31, 32, 38, 39].includes(c) && numero(v) !== 0)) throw new Error('El plano contiene geometría 3D o extrusión; exporta geometría 2D en XY');
    if (tipo === 'LINE') { segmento({ x: valor(datos, 10), y: valor(datos, 20) }, { x: valor(datos, 11), y: valor(datos, 21) }); perforaciones++; }
    else if (tipo === 'CIRCLE' || tipo === 'ARC') {
      const inicio = tipo === 'CIRCLE' ? 0 : valor(datos, 50) * Math.PI / 180;
      arco({ x: valor(datos, 10), y: valor(datos, 20) }, valor(datos, 40), inicio, tipo === 'CIRCLE' ? TAU : barrido(inicio, valor(datos, 51) * Math.PI / 180)); perforaciones++;
    } else if (tipo === 'LWPOLYLINE') {
      const puntos = puntosRepetidos(datos);
      if (valor(datos, 90, puntos.length) !== puntos.length) throw new Error('Cantidad de vértices inconsistente');
      polilinea(puntos, (valor(datos, 70, 0) & 1) !== 0);
    } else if (tipo === 'POLYLINE') {
      if ((valor(datos, 70, 0) & (8 | 16 | 64)) !== 0) throw new Error('POLYLINE 3D o malla no admitida');
      const puntos: Punto[] = [];
      while (registros[i + 1]?.tipo === 'VERTEX') { const vertice = registros[++i].datos; if (valor(vertice, 30, 0) !== 0) throw new Error('Vértice fuera del plano XY'); puntos.push({ x: valor(vertice, 10), y: valor(vertice, 20), bulge: valor(vertice, 42, 0) }); }
      if (registros[i + 1]?.tipo !== 'SEQEND') throw new Error('POLYLINE incompleta'); i++;
      polilinea(puntos, (valor(datos, 70, 0) & 1) !== 0);
    } else if (tipo === 'ELLIPSE') {
      const centro = { x: valor(datos, 10), y: valor(datos, 20) }; const mayor = { x: valor(datos, 11), y: valor(datos, 21) }; const proporcion = valor(datos, 40);
      if (Math.hypot(mayor.x, mayor.y) === 0 || proporcion <= 0 || proporcion > 1) throw new Error('Elipse inválida');
      const menor = { x: -mayor.y * proporcion, y: mayor.x * proporcion }; const inicio = valor(datos, 41, 0); const amplitud = barrido(inicio, valor(datos, 42, TAU));
      const punto = (t: number) => ({ x: centro.x + mayor.x * Math.cos(t) + menor.x * Math.sin(t), y: centro.y + mayor.y * Math.cos(t) + menor.y * Math.sin(t) });
      incluir(punto(inicio)); incluir(punto(inicio + amplitud));
      for (const t of [Math.atan2(menor.x, mayor.x), Math.atan2(menor.y, mayor.y)]) for (const angulo of [t, t + Math.PI]) if (estaEnArco(angulo, inicio, amplitud)) incluir(punto(angulo));
      // Simpson compuesto integra longitud; la envolvente se evalúa analíticamente.
      const pasos = 256; const h = amplitud / pasos;
      const rapidez = (t: number) => Math.hypot(-mayor.x * Math.sin(t) + menor.x * Math.cos(t), -mayor.y * Math.sin(t) + menor.y * Math.cos(t));
      let integral = rapidez(inicio) + rapidez(inicio + amplitud);
      for (let j = 1; j < pasos; j++) integral += (j % 2 ? 4 : 2) * rapidez(inicio + j * h);
      longitud += integral * h / 3; perforaciones++; advertencias.add('La longitud de las elipses se calculó por aproximación numérica.');
    } else if (tipo === 'SPLINE') {
      if (datos.some(([c, v]) => c === 41 && numero(v) <= 0)) throw new Error('Spline con pesos no positivos');
      let puntos = puntosRepetidos(datos); if (puntos.length < 2) puntos = puntosRepetidos(datos, 11);
      polilinea(puntos, (valor(datos, 70, 0) & 1) !== 0); advertencias.add('Spline aproximada por su polígono de control o ajuste; verifica su longitud y envolvente en CAD.');
    } else { advertencias.add(tipo === 'INSERT' ? 'Bloques insertados sin resolver: completa sus medidas manualmente.' : `Entidad ${tipo.slice(0, 40)} omitida.`); }
  }
  if (!Number.isFinite(minX) || longitud <= 0) throw new Error('No se encontró geometría 2D medible');
  return resultado((maxX - minX) * FACTORES[unidad], (maxY - minY) * FACTORES[unidad], longitud * FACTORES[unidad] / 1000, perforaciones, unidad, [...advertencias]);
}

function resultado(anchoMm: number, altoMm: number, perimetroM: number, perforacionesEstimadas: number, unidad: UnidadGeometria, advertencias: string[]): GeometriaEstimada {
  const areaEnvolventeM2 = anchoMm * altoMm / 1e6;
  if (![anchoMm, altoMm, perimetroM, areaEnvolventeM2].every(v => Number.isFinite(v) && v >= 0 && v <= 1e15)) throw new Error('Dimensiones fuera del rango permitido');
  return { anchoMm, altoMm, perimetroM, areaEnvolventeM2, perforacionesEstimadas, unidad, advertencias, estimado: true };
}
function leerEps(texto: string): GeometriaEstimada {
  if (!texto.startsWith('%!PS-Adobe-') || !texto.slice(0, 100).includes('EPSF')) throw new Error('Se requiere EPS de texto con cabecera válida');
  const formato = /^%%(?:HiResBoundingBox|BoundingBox):\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s*$/gm;
  const cajas = [...texto.matchAll(formato)];
  const caja = cajas.find(c => c[0].startsWith('%%HiResBoundingBox')) ?? cajas[0];
  if (!caja) throw new Error('EPS sin envolvente numérica: captura las medidas manualmente');
  const [x0, y0, x1, y1] = caja.slice(1).map(v => numero(v));
  if (x1 <= x0 || y1 <= y0) throw new Error('Envolvente EPS inválida');
  const ancho = (x1 - x0) * 25.4 / 72; const alto = (y1 - y0) * 25.4 / 72;
  return resultado(ancho, alto, 2 * (ancho + alto) / 1000, 1, 'mm', ['EPS solo aporta la envolvente; el perímetro rectangular y la perforación son estimados, completa el recorrido real antes de cotizar.']);
}
