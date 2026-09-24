param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 4173
$arguments = @((Join-Path $root "local_server.py"), "--root", $root, "--port", $port)
if (-not $NoBrowser) { $arguments += "--open" }
python @arguments
