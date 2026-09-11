$ErrorActionPreference = 'Stop'
$scriptPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../tools/enter-provider-key.ps1'))
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'Parse failure' }
# Extract only helper definitions; never execute the real credential prompt or path.
foreach ($name in @('Convert-HiddenKeyToBytes', 'Write-ExistingCredentialBytes')) {
    $definition = $ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]}, $true) | Where-Object Name -eq $name
    Invoke-Expression $definition.Extent.Text
}
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ('midas-synthetic-credential-test-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testDirectory) | Out-Null
$testFile = Join-Path $testDirectory 'synthetic-only.txt'
[IO.File]::WriteAllText($testFile, 'SYNTHETIC_OLD_CONTENT_LONGER_THAN_THE_NEW_INPUT_NO_REAL_CREDENTIAL')
$before = (Get-Acl -LiteralPath $testFile).Sddl
$synthetic = ConvertTo-SecureString 'sk-SYNTHETIC-NOT-A-CREDENTIAL' -AsPlainText -Force
$buffer = Convert-HiddenKeyToBytes -Secret $synthetic
try {
    Write-ExistingCredentialBytes -Path $testFile -Bytes $buffer
    if ([IO.File]::ReadAllText($testFile) -ne 'sk-SYNTHETIC-NOT-A-CREDENTIAL') { throw 'Write mismatch' }
    if ((Get-Acl -LiteralPath $testFile).Sddl -ne $before) { throw 'ACL mismatch' }
} finally { [Array]::Clear($buffer, 0, $buffer.Length); $synthetic.Dispose() }
foreach ($invalid in @('', 'short', 'not-a-key-with-a-long-length', 'sk-SYNTHETIC WITH SPACES')) {
    $secure = New-Object Security.SecureString
    foreach ($char in $invalid.ToCharArray()) { $secure.AppendChar($char) }
    $rejected = $false
    try { $unused = Convert-HiddenKeyToBytes -Secret $secure } catch { $rejected = $true } finally { $secure.Dispose() }
    if (-not $rejected) { throw 'Invalid input accepted' }
}
Remove-Item -LiteralPath $testFile
Remove-Item -LiteralPath $testDirectory
Write-Output 'PASS: Windows PowerShell syntax, secure-input conversion, invalid-input refusal, exact overwrite/truncation, and ACL preservation using synthetic data only.'
