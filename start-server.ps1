$ErrorActionPreference = "Stop"

$commands = @(
  @{ Name = "python"; Args = @("-m", "http.server", "8080") },
  @{ Name = "py"; Args = @("-m", "http.server", "8080") }
)

foreach ($command in $commands) {
  if (Get-Command $command.Name -ErrorAction SilentlyContinue) {
    Write-Host "Starting local server on http://localhost:8080 using $($command.Name)..."
    & $command.Name @($command.Args)
    exit $LASTEXITCODE
  }
}

Write-Error "Neither 'python' nor 'py' was found in PATH."
