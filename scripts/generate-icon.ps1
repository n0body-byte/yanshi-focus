Add-Type -AssemblyName System.Drawing

$buildDirectory = Join-Path $PSScriptRoot "..\build"
$iconPath = Join-Path $buildDirectory "icon.ico"
New-Item -ItemType Directory -Force -Path $buildDirectory | Out-Null

$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(23, 60, 52))

$tomatoBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(221, 107, 89))
$leafBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(139, 180, 161))
$clockPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 253, 248)), 11
$clockPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$clockPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$graphics.FillEllipse($tomatoBrush, 52, 75, 152, 146)
$graphics.FillEllipse($leafBrush, 113, 38, 38, 72)
$graphics.FillEllipse($leafBrush, 76, 49, 75, 34)
$graphics.DrawEllipse($clockPen, 87, 107, 82, 82)
$graphics.DrawLine($clockPen, 128, 128, 128, 153)
$graphics.DrawLine($clockPen, 128, 153, 148, 166)

$handle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()

$clockPen.Dispose()
$tomatoBrush.Dispose()
$leafBrush.Dispose()
$icon.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Icon generated: $iconPath"
