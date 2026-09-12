# Run only after separate owner authorization and Google account consent.
# Token is entered in a local hidden prompt, never a command argument or log.
param([Parameter(Mandatory=$true)][string]$AccountEmail,
      [Parameter(Mandatory=$true)][string]$ExpiresAt,
      [string]$Root = 'C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-030\var\operating-workbench-030')
$ErrorActionPreference = 'Stop'
if ($AccountEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'Invalid account email.' }
$expiry = [DateTimeOffset]::Parse($ExpiresAt).ToUniversalTime()
if ($expiry -le [DateTimeOffset]::UtcNow -or $expiry -gt [DateTimeOffset]::UtcNow.AddHours(2)) { throw 'Use the actual short-lived token expiry, within two hours.' }
$approvedRoot = [IO.Path]::GetFullPath('C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-030\var\operating-workbench-030')
if ([IO.Path]::GetFullPath($Root).TrimEnd('\') -ne $approvedRoot) { throw 'Unexpected credential destination.' }
$target = Join-Path $approvedRoot 'auth\gmail-oauth.json'
$directory = Split-Path $target
if (!(Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory | Out-Null }
if ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse-point credential directory is unsupported.' }
if ((Test-Path -LiteralPath $target) -and ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse-point credential file is unsupported.' }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true,$false)
$acl.SetOwner($sid)
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')))
# Set a restrictive ACL before entering or writing the new credential.
if (!(Test-Path -LiteralPath $target)) { [IO.File]::WriteAllText($target,'') }
Set-Acl -LiteralPath $target -AclObject $acl
$secret = Read-Host 'Paste the short-lived Gmail access token (hidden)' -AsSecureString
$pointer = [IntPtr]::Zero
try {
 $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
 $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
 if ([string]::IsNullOrWhiteSpace($token) -or $token -match '[\r\n]' -or $token.Length -gt 16384) { throw 'Invalid token format.' }
 $record = @{type='oauth2';accountEmail=$AccountEmail;accessToken=$token;expiresAt=$expiry.ToString('o');scopes=@('https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly')}
 [IO.File]::WriteAllText($target,($record | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
 Write-Output 'SUCCESS: protected Gmail credential staged. No network request was made.'
} finally {
 if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
 $token=$null;$record=$null;$secret.Dispose()
}
