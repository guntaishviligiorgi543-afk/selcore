param([ValidateSet('guest', 'overview', 'footer')][string]$View = 'guest')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$layoutRoot = Join-Path $PSScriptRoot '../docs/layout-restoration'
$pages = @('index', 'allproducts', 'product', 'cart', 'checkout', 'contact', 'user')
$sources = @('baseline', 'before', 'after')
foreach ($width in @(1440, 1024, 768, 390, 320)) {
  $tileWidth = 400
  $tileHeight = if ($width -lt 500 -or $View -eq 'overview') { 660 } else { 320 }
  $sheet = New-Object System.Drawing.Bitmap (3 * $tileWidth), (7 * $tileHeight)
  $graphics = [System.Drawing.Graphics]::FromImage($sheet)
  $graphics.Clear([System.Drawing.Color]::FromArgb(245, 245, 245))
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $font = New-Object System.Drawing.Font 'Arial', 12
  for ($row = 0; $row -lt $pages.Count; $row++) {
    for ($column = 0; $column -lt $sources.Count; $column++) {
      $suffix = if ($View -eq 'guest') { '' } else { "-$View" }
      $name = "$($pages[$row])-$width-guest$suffix.png"
      $file = Join-Path $layoutRoot "$($sources[$column])/$name"
      $x = $column * $tileWidth
      $y = $row * $tileHeight
      $graphics.DrawString("$($pages[$row]) | $width px | $($sources[$column])", $font, [System.Drawing.Brushes]::Black, $x + 10, $y + 5)
      if (Test-Path -LiteralPath $file) {
        $sourceImage = [System.Drawing.Image]::FromFile($file)
        $scale = [Math]::Min(($tileWidth - 20) / $sourceImage.Width, ($tileHeight - 35) / $sourceImage.Height)
        $targetWidth = [int]($sourceImage.Width * $scale)
        $targetHeight = [int]($sourceImage.Height * $scale)
        $graphics.DrawImage($sourceImage, $x + 10, $y + 28, $targetWidth, $targetHeight)
        $sourceImage.Dispose()
      }
    }
  }
  $outputSuffix = if ($View -eq 'guest') { '' } else { "-$View" }
  $sheet.Save((Join-Path $layoutRoot "comparison-$width$outputSuffix.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $font.Dispose()
  $graphics.Dispose()
  $sheet.Dispose()
}
Write-Output 'Saved all five comparison contact sheets.'
