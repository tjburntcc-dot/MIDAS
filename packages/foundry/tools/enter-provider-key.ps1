[CmdletBinding()]
param([switch]$CheckOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-HiddenKeyToBytes {
    param([Parameter(Mandatory = $true)][Security.SecureString]$Secret)
    $pointer = [IntPtr]::Zero
    $bytes = $null
    try {
        if ($Secret.Length -lt 20 -or $Secret.Length -gt 4096) {
            throw 'The entered value does not have an expected API-key length.'
        }
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
        $bytes = New-Object byte[] $Secret.Length
        for ($index = 0; $index -lt $Secret.Length; $index++) {
            $code = [Runtime.InteropServices.Marshal]::ReadInt16($pointer, $index * 2)
            if ($code -lt 33 -or $code -gt 126) {
                throw 'The entered value contains whitespace or non-ASCII characters.'
            }
            $bytes[$index] = [byte]$code
        }
        if ($bytes[0] -ne 115 -or $bytes[1] -ne 107 -or $bytes[2] -ne 45) {
            throw 'The entered value does not have the expected API-key prefix.'
        }
        # No plaintext managed string, pipeline output, temporary file or backup.
        return ,$bytes
    }
    catch {
        if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
        throw
    }
    finally {
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }
}

function Write-ExistingCredentialBytes {
    param([string]$Path, [byte[]]$Bytes)
    $stream = $null
    try {
        # Open the existing file in place. Do not replace its filesystem entry or ACL.
        $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $stream.Write($Bytes, 0, $Bytes.Length)
        $stream.SetLength($Bytes.Length)
        $stream.Flush($true)
    }
    finally { if ($null -ne $stream) { $stream.Dispose() } }
}

$credentialPath = 'C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-028\var\foundry-smoke-028\auth\provider\openai.key'
$providerDirectory = Split-Path -Parent $credentialPath
$secretInput = $null
$keyBytes = $null
try {
    # Refuse redirected/reparse paths and unexpected ACLs before asking for a secret.
    $cursor = $credentialPath
    while ($cursor) {
        $entry = Get-Item -LiteralPath $cursor -Force
        if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'A reparse point exists in the credential path.'
        }
        $cursor = Split-Path -Parent $cursor
    }
    $fileAcl = Get-Acl -LiteralPath $credentialPath
    $directoryAcl = Get-Acl -LiteralPath $providerDirectory
    if (-not $directoryAcl.AreAccessRulesProtected) { throw 'The credential directory is not protected.' }
    $ownerSid = $fileAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value
    $runnerSid = (New-Object Security.Principal.NTAccount('Mason_Hemmer\CodexSandboxOffline')).Translate([Security.Principal.SecurityIdentifier]).Value
    $allowed = @($ownerSid, 'S-1-5-18', 'S-1-5-32-544', $runnerSid)
    foreach ($acl in @($fileAcl, $directoryAcl)) {
        foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
            if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
                if ($allowed -notcontains $rule.IdentityReference.Value) { throw 'Unexpected credential access principal.' }
                if ($rule.IdentityReference.Value -eq $runnerSid -and
                    ($rule.FileSystemRights -band ([Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership)) -ne 0) {
                    throw 'The application runner has unexpected credential write permissions.'
                }
            }
        }
    }
    $fileSddl = $fileAcl.Sddl
    $directorySddl = $directoryAcl.Sddl
    if ($CheckOnly) {
        Write-Host 'PASS: expected existing file and restricted directory permissions. No credential read or write; no network activity.'
        return
    }
    if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $ownerSid) {
        throw 'Open this prompt as the normal Windows account that owns the credential file.'
    }
    Write-Host 'MIDAS Mission 028 credential replacement'
    Write-Host 'Use a key created in project proj_H01ORqdOPQM6vdGwQYsqFL5r.'
    Write-Host 'Input is hidden. Nothing is sent to OpenAI. Close the window or press Ctrl+C to cancel before submitting.'
    $secretInput = Read-Host 'Paste the NEW API key, then press Enter' -AsSecureString
    $keyBytes = Convert-HiddenKeyToBytes -Secret $secretInput
    if ((Get-Acl -LiteralPath $credentialPath).Sddl -ne $fileSddl -or
        (Get-Acl -LiteralPath $providerDirectory).Sddl -ne $directorySddl) {
        throw 'Credential permissions changed while waiting for input.'
    }
    Write-ExistingCredentialBytes -Path $credentialPath -Bytes $keyBytes
    if ((Get-Acl -LiteralPath $credentialPath).Sddl -ne $fileSddl -or
        (Get-Acl -LiteralPath $providerDirectory).Sddl -ne $directorySddl) {
        throw 'Credential permissions did not remain identical.'
    }
    Write-Host 'SUCCESS: new credential saved; file and directory permissions unchanged. No provider request made.'
    Write-Host 'Clear the copied key from your clipboard if applicable, then tell Codex the replacement is done.'
}
catch {
    # Deliberately suppress exception text and invocation details.
    Write-Host 'STOPPED: replacement did not complete successfully. No provider request was made. Do not paste the key into chat.'
    Write-Host 'Check that you are using the owner Windows account and the expected protected file. Rerun the hidden prompt if needed.'
    if ($CheckOnly) { exit 1 }
}
finally {
    if ($null -ne $keyBytes) { [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
    if ($null -ne $secretInput) { $secretInput.Dispose() }
}
