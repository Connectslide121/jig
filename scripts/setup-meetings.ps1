param(
  [Parameter(Mandatory=$true)][string]$SubscriptionId,
  [string]$ResourceGroup = 'rg-jig-meetings-swc',
  [string]$ResourceName = 'jig-meetings-sprinta',
  [string]$Location = 'swedencentral'
)
$ErrorActionPreference = 'Stop'
function AzJson([string[]]$Arguments) {
  $result = & az @Arguments --only-show-errors -o json
  if ($LASTEXITCODE -ne 0) { throw "Azure command failed: $($Arguments[0..1] -join ' ')" }
  if ($result) { return ($result | ConvertFrom-Json) }
}
$root = Split-Path -Parent $PSScriptRoot
$local = Join-Path $root '.azure-local'
New-Item -ItemType Directory -Path $local -Force | Out-Null
$account = AzJson @('account','show','--subscription',$SubscriptionId)
$null = AzJson @('group','create','--subscription',$SubscriptionId,'--name',$ResourceGroup,'--location',$Location,'--tags','app=jig','feature=meetings')
$resourceId = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Communication/communicationServices/$ResourceName"
$resourceBody = Join-Path $local 'meeting-resource.json'
@{ location='global'; properties=@{ dataLocation='Europe' }; tags=@{ app='jig'; feature='meetings' } } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resourceBody -Encoding utf8
$resource = AzJson @('rest','--method','put','--url',"https://management.azure.com${resourceId}?api-version=2023-03-31",'--body',"@$resourceBody")
$existing = @(AzJson @('ad','app','list','--display-name','jig-meetings')) | Where-Object { $_.displayName -eq 'jig-meetings' }
if ($existing.Count -gt 1) { throw 'More than one jig-meetings app registration exists; choose one explicitly.' }
$calling = AzJson @('ad','sp','show','--id','1fd5118e-2576-4263-8130-9503064c837a')
$graph = AzJson @('ad','sp','show','--id','00000003-0000-0000-c000-000000000000')
$permissions = @(
  @{ resourceAppId=$calling.appId; resourceAccess=@($calling.oauth2PermissionScopes | Where-Object { $_.value -in @('Teams.ManageCalls','Teams.ManageChats') } | ForEach-Object { @{ id=$_.id; type='Scope' } }) },
  @{ resourceAppId=$graph.appId; resourceAccess=@($graph.oauth2PermissionScopes | Where-Object { $_.value -eq 'Calendars.ReadBasic' } | ForEach-Object { @{ id=$_.id; type='Scope' } }) }
)
$appBody = Join-Path $local 'meeting-registration.json'
@{ displayName='jig-meetings'; signInAudience='AzureADMyOrg'; publicClient=@{ redirectUris=@('http://localhost') }; isFallbackPublicClient=$true; requiredResourceAccess=$permissions } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $appBody -Encoding utf8
if ($existing.Count -eq 1) {
  $registration = $existing[0]
  $null = AzJson @('rest','--method','patch','--url',"https://graph.microsoft.com/v1.0/applications/$($registration.id)",'--body',"@$appBody")
} else {
  $registration = AzJson @('rest','--method','post','--url','https://graph.microsoft.com/v1.0/applications','--body',"@$appBody")
}
$servicePrincipals = @(AzJson @('ad','sp','list','--filter',"appId eq '$($registration.appId)'"))
if (!$servicePrincipals.Count) { $jigPrincipal = AzJson @('ad','sp','create','--id',$registration.appId) } else { $jigPrincipal = $servicePrincipals[0] }
# Consent only for the signed-in user, never for every user in the organisation.
$user = AzJson @('ad','signed-in-user','show')
foreach ($target in @(@{ principal=$calling; scope='Teams.ManageCalls Teams.ManageChats' }, @{ principal=$graph; scope='Calendars.ReadBasic' })) {
  try {
    $grantFilter = [uri]::EscapeDataString("clientId eq '$($jigPrincipal.id)' and principalId eq '$($user.id)' and resourceId eq '$($target.principal.id)'")
    $grants = AzJson @('rest','--method','get','--url',('https://graph.microsoft.com/v1.0/oauth2PermissionGrants?$filter=' + $grantFilter))
    $grantBody = Join-Path $local 'meeting-consent.json'
    if ($grants.value.Count) {
      $scope = (@(($grants.value[0].scope -split ' ') + ($target.scope -split ' ')) | Select-Object -Unique) -join ' '
      @{ scope=$scope } | ConvertTo-Json | Set-Content -LiteralPath $grantBody -Encoding utf8
      $null = AzJson @('rest','--method','patch','--url',"https://graph.microsoft.com/v1.0/oauth2PermissionGrants/$($grants.value[0].id)",'--body',"@$grantBody")
    } else {
      @{ clientId=$jigPrincipal.id; consentType='Principal'; principalId=$user.id; resourceId=$target.principal.id; scope=$target.scope } | ConvertTo-Json | Set-Content -LiteralPath $grantBody -Encoding utf8
      $null = AzJson @('rest','--method','post','--url','https://graph.microsoft.com/v1.0/oauth2PermissionGrants','--body',"@$grantBody")
    }
    Write-Host "Configured user-specific consent: $($target.scope)"
  } catch { Write-Warning "Could not configure user-specific consent for $($target.scope). Use Connect Microsoft; your tenant might require administrator approval." }
}
$endpoint = $resource.properties.hostName
if (!$endpoint) {
  $resource = AzJson @('resource','show','--ids',$resourceId,'--api-version','2023-03-31')
  $endpoint = $resource.properties.hostName
}
if (!$endpoint) { throw 'The calling resource did not return its host name.' }
$settings = @{ tenantId=$account.tenantId; clientId=$registration.appId; endpoint="https://$endpoint" }
$settings | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $local 'meetings.json') -Encoding utf8
@{ subscriptionId=$SubscriptionId; resourceGroup=$ResourceGroup; resourceId=$resourceId; clientId=$registration.appId; tenantId=$account.tenantId; endpoint=$settings.endpoint } | ConvertTo-Json
Write-Host 'No client secret was created and no resource access keys were retrieved. Open Meetings in Jig and Connect Microsoft to grant delegated consent.'
