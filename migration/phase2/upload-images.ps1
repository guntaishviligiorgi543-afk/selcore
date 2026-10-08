$ErrorActionPreference = 'Stop'
$projectRef = 'ffznkypurnocabqyxpps'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$linkedRef = (Get-Content -LiteralPath (Join-Path $projectRoot 'supabase/.temp/project-ref') -Raw).Trim()
if ($linkedRef -ne $projectRef) { throw 'Linked project is not Selcore; refusing upload.' }
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'image-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.project_id -ne $projectRef -or $manifest.images.Count -ne 24) { throw 'Unexpected upload manifest.' }
$results = [Collections.Generic.List[object]]::new()
try {
  foreach ($image in $manifest.images) {
    $sourcePath = [IO.Path]::GetFullPath((Join-Path $projectRoot $image.local_path))
    if (-not $sourcePath.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Source image escapes project.' }
    if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $image.sha256) { throw "Source hash changed for product $($image.product_id)" }
    $destination = 'ss:///product-images/' + $image.storage_path
    # CLI 2.120.0 parses C:\... as URL scheme c:, so pass a relative source.
    $uploadSource = $image.local_path
    # No debug output or credential retrieval; use the existing CLI login.
    Push-Location -LiteralPath $projectRoot
    try {
      & npx.cmd --yes supabase@2.120.0 storage cp $uploadSource $destination --linked --project-ref $projectRef --experimental --content-type image/png
    } finally {
      Pop-Location
    }
    if ($LASTEXITCODE -ne 0) { throw "Storage upload failed for product $($image.product_id), CLI exit code $LASTEXITCODE. Stopped; no database seed executed." }
    $results.Add([pscustomobject]@{ product_id = $image.product_id; storage_path = $image.storage_path; uploaded = $true })
    Write-Output "Uploaded product $($image.product_id) ($($results.Count)/24)"
  }
} finally {
  $results.ToArray() | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'upload-results.json') -Encoding UTF8
}
