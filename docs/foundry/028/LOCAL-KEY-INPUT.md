# Enter the replacement credential locally

No provider request is made by this script. The existing key is not read. The hidden input is written directly into the existing approved file, preserving its filesystem entry and verifying identical file/directory permissions. There is no key argument, plaintext temporary file, backup or key-bearing report. Transient conversion buffers are cleared after use.

1. Create the new API key in the confirmed MIDAS project `proj_H01ORqdOPQM6vdGwQYsqFL5r`.
2. Press **Win+R**, paste the following command (it contains no key), and press Enter. Use your normal Windows account, not an administrator or another account.

```text
powershell.exe -NoLogo -NoProfile -NoExit -ExecutionPolicy RemoteSigned -File "C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-028\packages\foundry\tools\enter-provider-key.ps1"
```

3. Wait for **Paste the NEW API key, then press Enter**. Paste or type the key ONLY into that hidden prompt, then press Enter. The input is concealed; do not put the key at a normal `PS>` command prompt, into Win+R, or into chat.
4. Confirm the window says **SUCCESS: new credential saved; file and directory permissions unchanged. No provider request made.** If it says STOPPED, do not assume replacement succeeded. The script can be reopened to enter the key again.
5. Clear the key from your clipboard/clipboard history if you copied it, and close the window.
6. Tell Codex: **Replacement done. I created the key in proj_H01ORqdOPQM6vdGwQYsqFL5r and the prompt reported SUCCESS.** Do not include the key.

The execution-policy option applies to this PowerShell process, not a permanent machine setting. The script runs locally and makes no network calls. The credential remains at:

`C:\Users\14844\Downloads\MIDAS\var\foundry-worktree-028\var\foundry-smoke-028\auth\provider\openai.key`

After that explicit confirmation, Codex will record the real same-project credential correction through the existing signed access-recovery mechanism, then resume sequential Astra smoke under the existing Mission 028 authorization. The exhausted Sol count is not repeated. No provider request is permitted before confirmation.

Verified with Windows PowerShell: read-only permission/path preflight; synthetic-only tests of secure input conversion, invalid-input refusal, overwrite/truncation and identical ACLs. The real hidden prompt has not been run by the agent, and the credential has not been changed by preparation. Tooling is outside the pinned experiment runtime, so it does not alter the grant or accounting.
