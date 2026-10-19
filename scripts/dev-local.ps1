# Arranca Next.js contra el Supabase LOCAL con la demo sembrada.
# No modifica `.env.local`; las variables de este proceso tienen prioridad.
param([int]$Puerto = 3000)

$ErrorActionPreference = 'Continue'
$vars = @{}
& supabase status -o env 2>$null | ForEach-Object {
  if ($_ -match '^([A-Z0-9_]+)="?(.*?)"?$') { $vars[$matches[1]] = $matches[2] }
}

$api = $vars['API_URL']
if (-not $api -or ($api -notmatch '127\.0\.0\.1|localhost')) {
  throw "El stack local no respondió o API_URL no es loopback: $api"
}

$env:NEXT_PUBLIC_SUPABASE_URL = $api
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $vars['ANON_KEY']
$env:SUPABASE_SERVICE_ROLE_KEY = $vars['SERVICE_ROLE_KEY']
$env:NEXT_PUBLIC_SITIO_URL = "http://127.0.0.1:$Puerto"
$env:SECRETO_SESION_OPERADOR = -join (1..64 | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$env:BREVO_API_KEY = 'desactivado-demo'
$env:OPENROUTER_API_KEY = 'desactivado-demo'
$env:BREVO_WEBHOOK_TOKEN = 'desactivado-demo'

Write-Host "Demo local: http://127.0.0.1:$Puerto" -ForegroundColor Green
Write-Host 'Usuarios: supabase/semillas/README.md (admin: ales_2_@hotmail.com / Demo2026!)'
pnpm dev --port $Puerto
