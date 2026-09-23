param(
  [int]$ChunkSizeMiB = 20
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runtime = Join-Path $root "assets\zetaoffice"
$chunkSize = $ChunkSizeMiB * 1MB
$targets = @(
  @{ Name = "soffice.wasm"; ContentType = "application/wasm" },
  @{ Name = "soffice.data"; ContentType = "application/octet-stream" }
)
$manifest = [ordered]@{}

foreach ($target in $targets) {
  $source = Join-Path $runtime $target.Name
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "缺少运行组件：$source"
  }

  $info = Get-Item -LiteralPath $source
  $parts = [System.Collections.Generic.List[string]]::new()
  $input = [System.IO.File]::OpenRead($source)
  try {
    $buffer = New-Object byte[] $chunkSize
    $index = 1
    while (($read = $input.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $partName = "{0}.part{1:D3}" -f $target.Name, $index
      $partPath = Join-Path $runtime $partName
      $output = [System.IO.File]::Create($partPath)
      try { $output.Write($buffer, 0, $read) } finally { $output.Dispose() }
      $parts.Add($partName)
      $index++
    }
  } finally {
    $input.Dispose()
  }

  $manifest[$target.Name] = [ordered]@{
    contentType = $target.ContentType
    length = $info.Length
    parts = $parts
  }
}

$manifestPath = Join-Path $runtime "runtime-manifest.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Host "运行组件已拆分，清单：$manifestPath"
