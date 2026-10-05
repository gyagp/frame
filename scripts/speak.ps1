param([Parameter(Mandatory=$true)][string]$LinesFile, [Parameter(Mandatory=$true)][string]$OutputDirectory, [Parameter(Mandatory=$true)][string]$Voice)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $synth.SelectVoice($Voice)
    $synth.Rate = 0
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $lines = Get-Content -LiteralPath $LinesFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($line in $lines) {
        $target = Join-Path $OutputDirectory ($line.id + '.wav')
        $synth.SetOutputToWaveFile($target, $format)
        $synth.Speak([string]$line.text)
        $synth.SetOutputToNull()
    }
} finally { $synth.Dispose() }
