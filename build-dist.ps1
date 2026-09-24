$ErrorActionPreference = "Stop"
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $source "dist"
if (Test-Path -LiteralPath $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }
New-Item -ItemType Directory -Path $dist | Out-Null
$items = @("index.html", "src", "assets", "sw.js", "_headers", "start.ps1", "start.cmd", "README.md", "THIRD_PARTY_NOTICES.md")
foreach ($item in $items) {
  $from = Join-Path $source $item
  if (Test-Path -LiteralPath $from) { Copy-Item -LiteralPath $from -Destination (Join-Path $dist $item) -Recurse -Force }
}
Write-Host "Office dist 已生成：$dist"
