$ErrorActionPreference = "Stop"

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CsvPath = Join-Path $BaseDir ".state\latest_report_chart.csv"
$OutputPath = Join-Path $BaseDir ".state\latest_report_chart.png"

if (-not (Test-Path $CsvPath)) {
  throw "latest_report_chart.csv not found"
}

Add-Type -AssemblyName System.Windows.Forms.DataVisualization
$seriesData = @(Import-Csv $CsvPath)

if ($seriesData.Count -eq 0) {
  throw "scoreSeries is empty"
}

$take = [Math]::Min(252, $seriesData.Count)
$data = $seriesData[($seriesData.Count - $take)..($seriesData.Count - 1)]

$chart = New-Object System.Windows.Forms.DataVisualization.Charting.Chart
$chart.Width = 1400
$chart.Height = 780
$chart.BackColor = [System.Drawing.Color]::FromArgb(7, 19, 28)
$chart.Palette = [System.Windows.Forms.DataVisualization.Charting.ChartColorPalette]::None

$area = New-Object System.Windows.Forms.DataVisualization.Charting.ChartArea "Main"
$area.BackColor = [System.Drawing.Color]::FromArgb(13, 24, 36)
$area.AxisX.MajorGrid.LineColor = [System.Drawing.Color]::FromArgb(32, 50, 66)
$area.AxisY.MajorGrid.LineColor = [System.Drawing.Color]::FromArgb(32, 50, 66)
$area.AxisY2.MajorGrid.Enabled = $false
$area.AxisX.LabelStyle.ForeColor = [System.Drawing.Color]::FromArgb(159, 179, 200)
$area.AxisY.LabelStyle.ForeColor = [System.Drawing.Color]::FromArgb(72, 213, 255)
$area.AxisY2.LabelStyle.ForeColor = [System.Drawing.Color]::FromArgb(255, 180, 84)
$area.AxisX.LineColor = [System.Drawing.Color]::FromArgb(60, 85, 105)
$area.AxisY.LineColor = [System.Drawing.Color]::FromArgb(60, 85, 105)
$area.AxisY2.LineColor = [System.Drawing.Color]::FromArgb(60, 85, 105)
$area.AxisX.Interval = [Math]::Max([Math]::Floor($take / 8), 1)
$area.AxisY.Minimum = 20
$area.AxisY.Maximum = 80
$area.AxisY2.Enabled = [System.Windows.Forms.DataVisualization.Charting.AxisEnabled]::True
$area.AxisY2.IsStartedFromZero = $false
$chart.ChartAreas.Add($area)

$title = New-Object System.Windows.Forms.DataVisualization.Charting.Title
$title.Text = "CRCL 过去12个月时间序列"
$title.ForeColor = [System.Drawing.Color]::FromArgb(235, 242, 248)
$title.Font = New-Object System.Drawing.Font("Segoe UI", 18, [System.Drawing.FontStyle]::Bold)
$chart.Titles.Add($title)

$legend = New-Object System.Windows.Forms.DataVisualization.Charting.Legend
$legend.Docking = [System.Windows.Forms.DataVisualization.Charting.Docking]::Top
$legend.BackColor = [System.Drawing.Color]::Transparent
$legend.ForeColor = [System.Drawing.Color]::FromArgb(235, 242, 248)
$chart.Legends.Add($legend)

$driver = New-Object System.Windows.Forms.DataVisualization.Charting.Series "Driver Score"
$driver.ChartType = [System.Windows.Forms.DataVisualization.Charting.SeriesChartType]::Line
$driver.BorderWidth = 3
$driver.Color = [System.Drawing.Color]::FromArgb(72, 213, 255)
$driver.XValueType = [System.Windows.Forms.DataVisualization.Charting.ChartValueType]::Double

$price = New-Object System.Windows.Forms.DataVisualization.Charting.Series "CRCL Price"
$price.ChartType = [System.Windows.Forms.DataVisualization.Charting.SeriesChartType]::Line
$price.BorderWidth = 3
$price.Color = [System.Drawing.Color]::FromArgb(255, 180, 84)
$price.YAxisType = [System.Windows.Forms.DataVisualization.Charting.AxisType]::Secondary
$price.XValueType = [System.Windows.Forms.DataVisualization.Charting.ChartValueType]::Double

$pulse = New-Object System.Windows.Forms.DataVisualization.Charting.Series "Theme Pulse"
$pulse.ChartType = [System.Windows.Forms.DataVisualization.Charting.SeriesChartType]::Column
$pulse.Color = [System.Drawing.Color]::FromArgb(90, 125, 255, 141)
$pulse.XValueType = [System.Windows.Forms.DataVisualization.Charting.ChartValueType]::Double

$index = 1
foreach ($point in $data) {
  $label = [string]$point.date
  $themeScore = if ($null -eq $point.theme_news_score) { 0 } else { [double]$point.theme_news_score }
  $driverPointIndex = $driver.Points.AddXY($index, [double]$point.driver_score)
  $pricePointIndex = $price.Points.AddXY($index, [double]$point.crcl_close)
  $pulsePointIndex = $pulse.Points.AddXY($index, $themeScore)
  $driver.Points[$driverPointIndex].AxisLabel = $label
  $price.Points[$pricePointIndex].AxisLabel = $label
  $pulse.Points[$pulsePointIndex].AxisLabel = $label
  if ($themeScore -lt 0) {
    $pulse.Points[$pulsePointIndex].Color = [System.Drawing.Color]::FromArgb(110, 255, 138, 130)
  }
  $index += 1
}

$chart.Series.Add($pulse)
$chart.Series.Add($driver)
$chart.Series.Add($price)
$chart.SaveImage($OutputPath, [System.Windows.Forms.DataVisualization.Charting.ChartImageFormat]::Png)
Write-Output $OutputPath
