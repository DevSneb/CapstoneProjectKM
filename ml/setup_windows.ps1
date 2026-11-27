# Run once on Windows after cloning/updating the ml/ folder.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$python = $null
foreach ($candidate in @(
  (Get-Command py -ErrorAction SilentlyContinue),
  (Get-Command python -ErrorAction SilentlyContinue)
)) {
  if ($candidate) { $python = $candidate.Source; break }
}

if (-not $python) {
  Write-Error "Python is required. Install Python 3.10+ and ensure py/python is on PATH."
}

if (Test-Path ".venv") {
  Remove-Item -Recurse -Force ".venv"
}

if ($python -like "*\py.exe") {
  & $python -3 -m venv .venv
} else {
  & $python -m venv .venv
}

$venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r requirements.txt

Write-Host "Training store models..."
& $venvPython "kadiwa_sales_core.py"
& $venvPython "verify_ml.py"

Write-Host ""
Write-Host "ML setup complete."
Write-Host "Set this in Backend/.env :"
Write-Host "ML_PYTHON_EXECUTABLE=$venvPython"
Write-Host "Then restart the Backend server."
