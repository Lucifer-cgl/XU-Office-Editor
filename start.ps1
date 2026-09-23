param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 4173
$prefix = "http://localhost:$port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

function Get-ContentType([string]$path) {
  switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".js" { "text/javascript; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".wasm" { "application/wasm" }
    ".data" { "application/octet-stream" }
    ".metadata" { "application/json" }
    default { "application/octet-stream" }
  }
}

try {
  $listener.Start()
  if (-not $NoBrowser) { Start-Process $prefix }
  Write-Host "XU Office Editor started: $prefix"
  Write-Host "Close this window to stop the local server."

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }
    $requested = [System.IO.Path]::GetFullPath((Join-Path $root $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)))

    if (-not $requested.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $requested -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $context.Response.Close()
      continue
    }

    $bytes = [System.IO.File]::ReadAllBytes($requested)
    $context.Response.StatusCode = 200
    $context.Response.ContentType = Get-ContentType $requested
    $context.Response.Headers.Add("Cross-Origin-Opener-Policy", "same-origin")
    $context.Response.Headers.Add("Cross-Origin-Embedder-Policy", "require-corp")
    $context.Response.Headers.Add("Cross-Origin-Resource-Policy", "same-origin")
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
} finally {
  try {
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
  } catch {
    # The listener may already be disposed after a startup failure.
  }
}
