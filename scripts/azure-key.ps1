param([Parameter(Mandatory=$true)][string]$Subscription, [Parameter(Mandatory=$true)][string]$ResourceGroup, [Parameter(Mandatory=$true)][string]$ResourceName)
$ErrorActionPreference = 'Stop'
# This stdout is captured only by the server process, never forwarded to the UI/log.
$key = & az cognitiveservices account keys list --subscription $Subscription --resource-group $ResourceGroup --name $ResourceName --query key1 --only-show-errors -o tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($key)) { throw 'Azure Speech key lookup failed. Check az login and resource access.' }
[Console]::Out.Write($key.Trim())
