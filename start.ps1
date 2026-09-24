param(
  [switch]$NoBrowser,
  [string]$Root
)

$ErrorActionPreference = "Stop"
$root = if ($Root) { [System.IO.Path]::GetFullPath($Root) } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$port = 4173
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
$listener.Start()
$prefix = "http://127.0.0.1:$port/"
if (-not $NoBrowser) { Start-Process $prefix }
Write-Host "XU Office Editor started: $prefix"
Write-Host "Close this window to stop the local server."

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
  while ($listener.Server.IsBound) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream)
      $requestLine = $reader.ReadLine()
      while (($line = $reader.ReadLine()) -and $line.Length -gt 0) {}
      $requestPath = "/"
      if ($requestLine -match '^GET\s+([^\s?]+)') { $requestPath = [Uri]::UnescapeDataString($Matches[1]) }
      $relative = $requestPath.TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }
      $requested = [System.IO.Path]::GetFullPath((Join-Path $root $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)))
      $rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
      if (-not $requested.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $requested -PathType Leaf)) {
        $body = [Text.Encoding]::UTF8.GetBytes("Not Found")
        $header = "HTTP/1.1 404 Not Found`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      } else {
        $body = [System.IO.File]::ReadAllBytes($requested)
        $header = "HTTP/1.1 200 OK`r`nContent-Type: $(Get-ContentType $requested)`r`nContent-Length: $($body.Length)`r`nCross-Origin-Opener-Policy: same-origin`r`nCross-Origin-Embedder-Policy: require-corp`r`nCross-Origin-Resource-Policy: same-origin`r`nConnection: close`r`n`r`n"
      }
      $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
