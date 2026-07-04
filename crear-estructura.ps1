<#
    ERP CC Manufacturing Group v2 (ORCA MFG ERP)
    Script de creacion de estructura de carpetas del proyecto

    Ejecutar desde la raiz del proyecto, ej: D:\ERP-CC>
    Uso:
        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
        .\crear-estructura.ps1
#>

function Nueva-Carpeta {
    param([string]$Ruta)
    New-Item -ItemType Directory -Force -Path $Ruta | Out-Null
    New-Item -ItemType File -Force -Path (Join-Path $Ruta ".gitkeep") | Out-Null
}

Write-Host "Creando estructura del proyecto ERP CC Manufacturing Group v2..." -ForegroundColor Cyan

# 1. Modulos de negocio (patron fijo por modulo)
$modulos = @(
    "autenticacion", "permisos", "auditoria", "tablero", "pipeline", "clientes",
    "inventario", "ordenes", "planeacion", "produccion", "cobranza", "gastos",
    "configuracion", "comentarios", "portal-cliente"
)
$subcarpetasModulo = @("acciones", "componentes", "hooks", "servicios", "tipos", "validaciones")

foreach ($modulo in $modulos) {
    foreach ($sub in $subcarpetasModulo) {
        Nueva-Carpeta "src\modulos\$modulo\$sub"
    }
}

# 2. Rutas (App Router)
$rutas = @(
    "src\app\(auth)\iniciar-sesion",
    "src\app\(auth)\operador",
    "src\app\(panel)\tablero",
    "src\app\(panel)\pipeline",
    "src\app\(panel)\clientes",
    "src\app\(panel)\inventario",
    "src\app\(panel)\ordenes",
    "src\app\(panel)\planeacion",
    "src\app\(panel)\produccion",
    "src\app\(panel)\cobranza",
    "src\app\(panel)\gastos",
    "src\app\(panel)\configuracion",
    "src\app\(piso)\produccion-piso",
    "src\app\(portal-cliente)\seguimiento",
    "src\app\api\webhooks"
)
foreach ($ruta in $rutas) { Nueva-Carpeta $ruta }

# 3. Codigo compartido
$compartido = @(
    "src\compartido\componentes\ui",
    "src\compartido\componentes\formularios",
    "src\compartido\componentes\diseno",
    "src\compartido\componentes\retroalimentacion",
    "src\compartido\hooks",
    "src\compartido\utilidades",
    "src\compartido\tipos",
    "src\compartido\constantes",
    "src\compartido\validaciones"
)
foreach ($c in $compartido) { Nueva-Carpeta $c }

# 4. Nucleo (infraestructura y clientes de servicios externos)
$nucleo = @(
    "src\nucleo\supabase",
    "src\nucleo\autenticacion",
    "src\nucleo\almacenamiento",
    "src\nucleo\correo",
    "src\nucleo\ia",
    "src\nucleo\auditoria",
    "src\nucleo\monitoreo"
)
foreach ($n in $nucleo) { Nueva-Carpeta $n }

# 5. Estado global y estilos
Nueva-Carpeta "src\estado"
Nueva-Carpeta "src\estilos"

# 6. Supabase (migraciones, funciones, semillas)
Nueva-Carpeta "supabase\migrations"
Nueva-Carpeta "supabase\seed"
Nueva-Carpeta "supabase\functions"

# 7. Pruebas
Nueva-Carpeta "tests\unitarias"
Nueva-Carpeta "tests\e2e"

# 8. Documentacion por fase
Nueva-Carpeta "docs\fases"

# 9. Recursos publicos
Nueva-Carpeta "public\imagenes"
Nueva-Carpeta "public\iconos"

$totalCarpetas = (Get-ChildItem -Recurse -Directory | Measure-Object).Count

Write-Host ""
Write-Host "Estructura creada correctamente." -ForegroundColor Green
Write-Host "Total de carpetas generadas: $totalCarpetas" -ForegroundColor Cyan