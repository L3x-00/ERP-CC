"""Compone exclusivamente documentación local; no importa el ERP ni accede a red/BD."""
import csv
import hashlib
import html
import json
import re
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parent
REPO = BASE.parent.parent
FUENTES = BASE / 'fuentes'
CLASES = {
    'CV': 'conservada verificada', 'EV': 'equivalente verificada',
    'P': 'cobertura parcial', 'N': 'no cubierta en el alcance revisado',
    'NV': 'no verificable por datos/acceso/servicio',
    'S': 'sustituida por observación', 'D': 'decisión pendiente',
}

def leer_csv(path, delim=';'):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f, delimiter=delim))

def escribir_csv(path, rows):
    with path.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]), delimiter=';')
        w.writeheader()
        w.writerows(rows)

def guardar_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

catalogo = leer_csv(FUENTES / 'catalogo.csv')
evaluaciones = leer_csv(BASE / 'evaluacion-base.tsv', '\t') + leer_csv(BASE / 'evaluacion-observaciones.tsv', '\t')
por_id = {e['ID']: e for e in evaluaciones}
assert len(catalogo) == len(por_id) == len(evaluaciones) == 164
assert {c['ID'] for c in catalogo} == set(por_id)
referencias = json.loads((BASE / 'referencias.json').read_text(encoding='utf-8'))
indice_evidencia = []
for alias, ref in referencias.items():
    nombre, numero = ref.rsplit(':', 1)
    path = REPO / nombre
    lineas = path.read_text(encoding='utf-8-sig').splitlines()
    numero = int(numero)
    assert 1 <= numero <= len(lineas), ref
    indice_evidencia.append({'alias': alias, 'archivo_linea': ref,
        'sha256_archivo': hashlib.sha256(path.read_bytes()).hexdigest(),
        'fragmento_desde_linea': '\n'.join(lineas[numero-1:numero+4])})
guardar_json(BASE / 'evidencias/referencias-codigo.json', indice_evidencia)

pruebas = json.loads((BASE / 'evidencias/pruebas-locales.json').read_text(encoding='utf-8-sig'))
casos_locales = []
for suite in pruebas['testResults']:
    nombre = suite['name'].replace('\\', '/').split('/tests/')[-1]
    for caso in suite['assertionResults']:
        casos_locales.append({'archivo': 'tests/' + nombre, 'caso': caso['fullName'],
            'resultado': caso['status'], 'duracion_ms': caso.get('duration', 0),
            'alcance': 'Local; función/componente/acción con dependencias simuladas. No prueba SQL ni navegador E2E.'})
assert len(casos_locales) == pruebas['numTotalTests'] == 427
assert all(c['resultado'] == 'passed' for c in casos_locales)
escribir_csv(BASE / 'evidencias/casos-locales.csv', casos_locales)

contextos = {
 'ACC': ('Admin / operador; demás roles con sesión administrativa', '/iniciar-sesion; /operador; menú y cierre', 'usuarios; sesión administrativa; identidad PIN; permisos'),
 'DAS': ('Admin / gerente / vendedor / contador según proyección', '/dashboard y filtros de período', 'pipeline; ordenes_produccion; cuentas_por_cobrar; gastos; consumos; sesiones'),
 'CLI': ('Admin / vendedor con permiso ver_clientes', '/clientes: listado, modal alta/edición, ficha', 'clientes; documentos_cliente; CxC para consumo y crédito'),
 'RFQ': ('Admin / vendedor / gerente según permiso', '/pipeline: Kanban, tarjeta y tabla; formulario de cotización aislado', 'pipeline; cotizacion_lineas; clientes; ordenes_produccion'),
 'COT': ('Responsable comercial / cotizador', 'Calculadora técnica no localizada; formulario comercial aislado; /configuracion', 'cotizacion_lineas; configuracion_sistema.tarifas_json; geometría no localizada'),
 'ORD': ('Admin / responsable de producción', '/ordenes: alta manual, tabla, partidas, cambio de estado, comentarios', 'ordenes_produccion; partidas_orden_produccion; pipeline; programacion_areas'),
 'PRD': ('Operador PIN / gerente o admin con sesión administrativa', '/produccion: Kanban/panel/entrega; /produccion-piso: control asignado', 'partidas; programacion_areas; sesiones_trabajo; registros_avance_partida; notas_entrega'),
 'PLA': ('Admin / gerente con permiso de planeación', '/planeacion: rango, tabla y panel de asignación', 'recursos_planeacion; capacidad; excepciones; programacion_areas; partidas'),
 'DOC': ('Administración / producción; cliente destinatario sin portal', 'Orden de servicio sin entrada; entrega en /produccion; documentos en ficha cliente', 'notas_entrega; partidas_nota_entrega; archivos; configuración de empresa/plantillas'),
 'AR': ('Admin / contador con permisos financieros', '/cobranza: listado, modal cobro/saldo, recibo; alta solo en servidor', 'cuentas_por_cobrar; pagos_ar; movimientos_saldo_favor; clientes; OP'),
 'GAS': ('Admin / contador con permisos financieros', '/gastos: filtros, alta/OCR, tabla, estado y rentabilidad', 'gastos; proveedores; OP; consumos; sesiones y tarifas históricas'),
 'CFG': ('Admin o permiso configuracion', '/configuracion: Empresa, Tarifas/TC, Áreas, Cuentas, Plantillas', 'configuracion_sistema; areas_trabajo; cuentas_bancarias; catálogos constantes'),
 'TRA': ('Todos según su permiso y asignación', 'Entradas combinadas de los módulos; ver mapa de accesos', 'Cadena comercial/productiva/financiera y catálogos'),
}
obs_grupo = {
 1:'AR', 2:'RFQ', 3:'RFQ', 4:'RFQ', 5:'PRD', 6:'DOC', 7:'COT', 8:'PLA',
 9:'PRD', 10:'PRD', 11:'CLI', 12:'PRD', 13:'DOC', 14:'CFG', 15:'ORD',
 16:'ORD', 17:'ORD', 18:'PLA', 19:'PLA', 20:'PRD', 21:'PRD', 22:'AR',
 23:'AR', 24:'AR', 25:'AR', 26:'AR', 27:'AR', 28:'GAS', 29:'GAS', 30:'COT'}
filas = []
for c in catalogo:
    e = por_id[c['ID']]
    prefijo = c['ID'].split('-')[0]
    grupo = obs_grupo[int(c['ID'].split('-')[1])] if prefijo == 'OBS' else prefijo
    actor, entrada, datos = contextos[grupo]
    seleccion = [t for t in e['Pruebas_locales'].split(';') if t]
    pruebas_asociadas = [t for t in casos_locales if any(t['archivo'] == 'tests/'+p+'.test.ts' for p in seleccion)]
    assert not seleccion or pruebas_asociadas, (c['ID'], seleccion)
    codigo = '; '.join(referencias[r] for r in e['Referencias'].split(','))
    ejecutada = ('; '.join(f"{p} ({sum(t['archivo'] == 'tests/'+p+'.test.ts' for t in casos_locales)} casos aprobados)" for p in seleccion)
        + '. Detalle en evidencias/casos-locales.csv. Solo evidencia parcial local, sin flujo persistido.' if seleccion
        else 'Sin caso local específico ejecutado para este requisito.')
    dependencias = 'Entorno de prueba aislado, usuarios ficticios por rol, datos preparados y servicio correspondiente.'
    if e['Decision']:
        dependencias += ' Resolver ' + e['Decision'] + ' para la variante indicada; no bloquea otras comprobaciones.'
    if e['Clase'] in ('P', 'N'):
        dependencias += ' Resolver la brecha documentada antes de aceptar el resultado integral.'
    siguiente = ('Evaluar sustituto OBS-15.' if c['ID']=='ORD-04' else
        'Evaluar sustituto OBS-19.' if e['Clase']=='S' else
        f"{c['Casos_E2E']}: {c['Resultado_esperado']}")
    filas.append({
      'ID':c['ID'], 'Origen':c['Origen'], 'Modulo_base':c['Modulo'], 'Capacidad_base':c['Capacidad'],
      'Fuente_base':c['Fuente'], 'Resultado_exigido':c['Resultado_esperado'], 'Actor_objetivo':actor,
      'Puntos_entrada_revisados':entrada, 'Operacion_disparador':c['Condicion_o_solicitud'],
      'Datos_relacionados':datos, 'Regla_estado_y_resultado_objetivo':e['Resultado_objetivo_y_motivo'],
      'Evidencia_codigo':codigo, 'Evidencia_ejecutada_local':ejecutada,
      'Evidencia_funcional_E2E':'No ejecutada en navegador/BD de prueba; persistencia y segunda sesión pendientes.',
      'Clasificacion':CLASES[e['Clase']], 'Motivo':e['Resultado_objetivo_y_motivo'],
      'Siguiente_prueba_necesaria':siguiente, 'Dependencia':dependencias, 'Decisiones_relacionadas':e['Decision'],
    })
escribir_csv(BASE / 'matriz-cobertura.csv', filas)
guardar_json(BASE / 'matriz-cobertura.json', filas)
conteos = {v: sum(f['Clasificacion']==v for f in filas) for v in CLASES.values()}
denominador = 164-conteos[CLASES['S']]-conteos[CLASES['D']]
resumen = {'base_auditada':'9209de8', 'inventario_total':164, 'base':134, 'observaciones':30,
 'decisiones_catalogadas_aparte':16, 'conteos':conteos, 'requisitos_aplicables_decididos':denominador,
 'numerador_verificado':0, 'cobertura_verificada_porcentaje':0,
 'formula':f'(0 conservadas + 0 equivalentes verificadas) / {denominador}',
 'denominador_explicacion':'Se excluyen solo requisitos clasificados sustituidos o decisión pendiente; las dependencias no verificables permanecen dentro. Las 16 decisiones tienen inventario separado y no se restan de nuevo.',
 'unitarias':390,'acciones_con_dependencias_simuladas':37,'pruebas_aprobadas':427,
 'E2E_catalogados':41,'E2E_ejecutados':0,'aceptacion_funcional':'Pendiente; no certificada'}
guardar_json(BASE / 'resumen.json', resumen)

prioridad_alta = {'CLI-07','CLI-08','RFQ-01','RFQ-04','RFQ-05','RFQ-09','RFQ-15','RFQ-16','ORD-08','PRD-09','PRD-16','DOC-01','DOC-02','AR-01','AR-02','AR-06'}
backlog=[]
for f in filas:
    if f['Clasificacion'] == CLASES['S']: continue
    nivel='Alta' if f['ID'] in prioridad_alta or f['ID'].startswith('COT-') or f['ID'] in ['OBS-05','OBS-06','OBS-07','OBS-09','OBS-12','OBS-15','OBS-22','OBS-24','OBS-29'] else 'Media'
    backlog.append({'ID':f['ID'],'Prioridad_proceso':nivel,'Tipo_trabajo':
      'Obtener evidencia funcional' if f['Clasificacion']==CLASES['NV'] else 'Resolver decisión de negocio' if f['Clasificacion']==CLASES['D'] else 'Completar cobertura funcional',
      'Capacidad_y_brecha':f['Capacidad_base']+'. '+f['Motivo'], 'Actores':f['Actor_objetivo'],
      'Relacion_otros_modulos':f['Datos_relacionados'], 'Criterio_aceptacion':f['Resultado_exigido'],
      'Prueba':f['Siguiente_prueba_necesaria'], 'Dependencia':f['Dependencia']})
escribir_csv(BASE / 'backlog-cobertura.csv', backlog)

texto_e2e=(FUENTES/'03_Prompt_flujos_E2E.md').read_text(encoding='utf-8-sig')
cabeceras=re.findall(r'^## (E2E-\d+) · (.+)$',texto_e2e,re.M)
assert len(cabeceras)==41
e2e=[]
for id_caso,titulo in cabeceras:
    relacionados=[c['ID'] for c in catalogo if id_caso in re.findall(r'E2E-\d+',c['Casos_E2E'])]
    e2e.append({'Caso':id_caso,'Titulo':titulo,'Requisitos':', '.join(relacionados),
      'Estado':'No ejecutado en navegador/BD de prueba',
      'Limite':'Sin entorno aislado confirmado; Docker local no disponible. Suites remotas mutantes excluidas.',
      'Siguiente_paso':'Preparar escenario ficticio del Prompt 3 en entorno de prueba aprobado; recorrer UI y persistencia por los IDs asociados.',
      'Fuente':'fuentes/03_Prompt_flujos_E2E.md:'+str(next(i for i,l in enumerate(texto_e2e.splitlines(),1) if l.startswith('## '+id_caso+' ·')))})
escribir_csv(BASE/'registro-e2e.csv',e2e)

fuentes=[{'archivo':str(p.relative_to(BASE)).replace('\\','/'),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(FUENTES.iterdir()) if p.is_file()]
guardar_json(BASE/'evidencias/fuentes.json',fuentes)
md=['# Auditoría funcional y paridad — ORCA MFG ERP', '',
 'Corte: 13 de septiembre de 2026. Versión objetivo: `9209de8`. Auditoría documental y pruebas locales terminadas; aceptación funcional E2E pendiente.', '',
 '**164/164 requisitos inventariados y clasificados**, con evidencia de código separada de evidencia ejecutada. No se modificó el producto ni se operó producción.', '',
 '| Clasificación | Requisitos |','|---|---:|']
md += [f'| {k} | {v} |' for k,v in conteos.items()]
md += ['',f'**Cobertura funcional verificada: 0/{denominador} = 0 %.** Hay capacidades implementadas y 427 pruebas locales aprobadas; ninguna demuestra por sí sola todos los puntos de entrada, guardado, recuperación y dependencias de un requisito completo.', '',
 resumen['denominador_explicacion'], '',
 'Las 41 pruebas E2E del catálogo siguen sin ejecución. No se certifica la cadena comercial → taller → entrega → cobro. Se localizaron brechas de acceso, cálculo, documentos y continuidad antes de intentar pruebas mutantes.', '',
 '- [Informe navegable y buscador por ID](informe.html)',
 '- [Matriz completa para Excel](matriz-cobertura.csv)',
 '- [Informe de procesos, accesos, decisiones y capacidades adicionales](informe-procesos.md)',
 '- [Backlog por requisito y criterio de aceptación](backlog-cobertura.csv)',
 '- [Registro de los 41 casos E2E](registro-e2e.csv)',
 '- [Evidencia ejecutada y límites](evidencias/ejecucion.md)',
 '- [427 casos locales y resultados](evidencias/casos-locales.csv)',
 '- [Referencias de código con huella de archivo](evidencias/referencias-codigo.json)',
 '- [Conteos reproducibles](resumen.json)', '',
 'Para reproducir los documentos: `python docs/auditoria-funcional-2026-09-13/generar-informe.py`. Solo procesa los archivos locales de auditoría. Las evaluaciones TSV son los juicios por ID; la matriz resultante es la entrega consolidada. El informe de procesos explica las decisiones y el cierre.']
(BASE/'README.md').write_text('\n'.join(md)+'\n',encoding='utf-8')

esc=html.escape
detalles=[]
for f in filas:
    detalle=''.join(f'<dt>{esc(k.replace("_"," "))}</dt><dd>{esc(str(v))}</dd>' for k,v in f.items() if k not in ['ID','Capacidad_base','Clasificacion'])
    detalles.append(f'<details data-clase="{esc(f["Clasificacion"])}" data-origen="{esc(f["Origen"])}"><summary><strong>{esc(f["ID"])}</strong> <span>{esc(f["Capacidad_base"])}</span><em>{esc(f["Clasificacion"])}</em></summary><dl>{detalle}</dl></details>')
opciones=''.join(f'<option>{esc(c)}</option>' for c in conteos)
cards=''.join(f'<div><b>{v}</b><span>{esc(k)}</span></div>' for k,v in conteos.items())
pagina='''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auditoría funcional ORCA · 164 requisitos</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#f4f6f9;color:#182436;margin:0}main{max-width:1200px;margin:auto;padding:40px 24px}header{border-top:5px solid #225a87}h1{font-size:32px;margin:20px 0 8px}h2{font-size:22px}p{max-width:960px}.nota{background:#fff0d6;padding:16px;border-left:4px solid #a36500}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px}.cards div{padding:15px;background:white;border:1px solid #d9e0e8;border-radius:8px}.cards b{display:block;font-size:30px}.cards span{font-size:14px}nav{display:flex;flex-wrap:wrap;gap:18px;margin:24px 0}a{color:#18567f}.filtros{display:flex;gap:12px;flex-wrap:wrap;position:sticky;top:0;padding:16px 0;background:#f4f6f9;z-index:1}input,select{font:inherit;padding:10px;border:1px solid #9ba9bb;border-radius:6px;max-width:100%}input{flex:1;min-width:200px}details{margin:8px 0;background:white;border:1px solid #d9e0e8;border-radius:8px;padding:14px}summary{cursor:pointer;display:flex;gap:15px;align-items:baseline}summary strong{min-width:74px}summary span{flex:1}summary em{font-style:normal;font-size:13px;color:#5c4220;text-align:right}dl{display:grid;grid-template-columns:210px 1fr;gap:12px;margin:20px 0}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}small{color:#536579}button{font:inherit;padding:9px;border:1px solid #9ba9bb;border-radius:6px;background:white;cursor:pointer}[hidden]{display:none!important}@media(max-width:680px){main{padding:20px 12px}summary{flex-wrap:wrap}summary em{width:100%;text-align:left}dl{grid-template-columns:1fr}dt{margin-top:8px}}@media print{.filtros,nav,button{display:none}body{background:white}details{break-inside:avoid}summary{font-size:12px}dl{font-size:11px}.cards{grid-template-columns:repeat(4,1fr)}}</style>
<main><header><small>ORCA MFG ERP · 13 SEP 2026 · CORTE 9209de8</small><h1>Auditoría de cobertura funcional</h1><p>164 requisitos revisados: 134 de la referencia y 30 observaciones. 16 decisiones de negocio registradas por separado.</p></header>
<p class="nota"><b>Aceptación E2E pendiente.</b> 427 pruebas locales aprobadas. Ningún flujo completo ejecutado con base de datos aislada: cobertura verificada <b>0 / DENOM</b>. Este porcentaje expresa evidencia integral pendiente; no ausencia total de funcionalidad.</p>
<div class="cards">CARDS</div>
<h2>Prioridades de continuidad del negocio</h2><p>Conectar cotización y calculadora técnica; recuperar historial cliente–pedido; distribuir actividades y parciales por proceso; enlazar CxC desde aprobación y anticipos; completar documentos y conciliación por cuenta bancaria.</p>
<nav><a href="matriz-cobertura.csv" download>Matriz CSV</a><a href="backlog-cobertura.csv" download>Backlog</a><a href="informe-procesos.md">Informe de procesos y decisiones</a><a href="registro-e2e.csv">41 casos E2E</a><a href="evidencias/ejecucion.md">Evidencia y límites</a></nav>
<h2>Matriz por requisito</h2><p>Abra cada fila para ver exigencia original, actor, entradas, datos, evidencia, motivo y siguiente prueba.</p>
<div class="filtros"><input id="buscar" aria-label="Buscar requisito" placeholder="Buscar ID, capacidad, módulo o decisión"><select id="clase" aria-label="Filtrar clasificación"><option value="">Todas las clasificaciones</option>OPCIONES</select><select id="origen" aria-label="Filtrar origen"><option value="">Base y observaciones</option><option value="B">Base B</option><option value="C">Base condicionada C</option><option value="OBS">Observaciones</option></select><button id="limpiar">Limpiar</button></div><p id="conteo" aria-live="polite">164 requisitos</p><section id="matriz">DETALLES</section></main>
<script>const rows=[...document.querySelectorAll('#matriz details')]; const buscar=document.querySelector('#buscar'),clase=document.querySelector('#clase'),origen=document.querySelector('#origen'); function filtrar(){const q=buscar.value.toLocaleLowerCase('es').trim();let n=0;for(const row of rows){const visible=(!q||row.textContent.toLocaleLowerCase('es').includes(q))&&(!clase.value||row.dataset.clase===clase.value)&&(!origen.value||row.dataset.origen===origen.value);row.hidden=!visible;if(visible)n++;}document.querySelector('#conteo').textContent=n+' de 164 requisitos';}for(const el of [buscar,clase,origen])el.addEventListener('input',filtrar);document.querySelector('#limpiar').addEventListener('click',()=>{buscar.value='';clase.value='';origen.value='';filtrar();});</script></html>'''
pagina=pagina.replace('DENOM',str(denominador)).replace('CARDS',cards).replace('OPCIONES',opciones).replace('DETALLES','\n'.join(detalles))
(BASE/'informe.html').write_text(pagina,encoding='utf-8')
guardar_json(BASE/'evidencias/validacion-entregables.json',{'ids_catalogo':164,'ids_evaluados':len(por_id),'duplicados':0,'faltantes':0,'referencias_validas':len(indice_evidencia),'casos_locales':len(casos_locales),'E2E_inventariados':len(e2e),'suma_clasificaciones':sum(conteos.values()),'denominador':denominador})
print(json.dumps(resumen,ensure_ascii=False,indent=2))
