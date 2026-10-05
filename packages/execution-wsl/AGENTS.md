# packages/execution-wsl

- Never run anything locally when WSL is unavailable: a missing `wsl.exe`/distro is a `WorldUnavailableError`.
- Do not feed a command's own stdin through the shell session; commands use their own process.
- Do not reintroduce per-operation `wsl.exe` launches for file operations (they caused stalls).
- Keep errors secret-free; roots stay POSIX paths inside the distro.
