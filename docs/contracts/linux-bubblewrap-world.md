# Opt-in Linux child-process execution world

`bubblewrapExecutionWorld` implements the existing filesystem/process ports. It adds no new runtime,
event store, daemon or authorization system. The trusted operator supplies a dedicated workspace,
explicit public runtime directories, and verified patched bubblewrap provenance with the actual
binary SHA-256. The hash is checked before every launch. Unsupported platforms, missing namespaces,
setup failure, changed binary, forbidden mounts/environment and disposed worlds fail closed.

The provider uses new user, PID, network, IPC and UTS namespaces, disables nested user namespaces,
drops capabilities, establishes a new session, clears the environment, mounts selected executables
and libraries read-only, and binds only its workspace read/write. Temporary scratch and minimal
`/dev`/`/proc` are private to the sandbox. `/home`, host `/etc`, host sockets and the host root are
absent. Network egress is denied by the separate network namespace. Both filesystem effects and
process launches go through this namespace; host-side realpath checks improve refusal messages but
are not the enforcement mechanism. Optional Bun binding exposes only the executable, allowing
`tool.run_code`-style nested children to remain contained.

Wall time and combined output are bounded; timeout, abort, disposal and parent termination kill the
namespace's child tree. These are not aggregate CPU, memory, process-count or disk quotas. Those need
delegated cgroups or another enforceable backend before untrusted multi-tenant admission. Runtime
directories and the initial workspace must be audited by the operator: a pre-existing hard link to
sensitive host data is already data inside the workspace. The provider does not contain the host
application, authenticate callers, make arbitrary external effects exactly once, or establish a
production deployment. Independent security review remains required.

Binding a home or credential directory as the workspace explicitly exposes its contents at
`/workspace`; the provider does not classify secrets. Workspace selection needs its own authority
policy. The host-home paths are absent from the namespace, which is a narrower guarantee than
claiming every operator-selected file is safe to disclose.

## Binary provenance and test evidence

Do not treat the installed Ubuntu `0.11.1-1ubuntu0.3` package as containing the CVE-2026-87766
fix. [USN-8779-1](https://ubuntu.com/security/notices/USN-8779-1) introduced the Ubuntu fix in
`0.11.1-1ubuntu0.2`; [USN-8779-2](https://ubuntu.com/security/notices/USN-8779-2) records a
regression in that fix and publishes `0.11.1-1ubuntu0.3`. The upstream
[CVE-2026-87766 advisory](https://github.com/containers/bubblewrap/security/advisories/GHSA-pxhw-h44j-8pfx)
lists versions before 0.12.0 as affected and identifies upstream 0.12.0 as patched. An upstream
`--version` string or a distro package version is not, by itself, proof that the tested binary has
the fix. The upstream
[0.12.0 release](https://github.com/containers/bubblewrap/releases/tag/v0.12.0) describes the
security update. No donor code is copied.

The earlier OS fixture auto-hashed `/usr/bin/bwrap`, then hard-coded provenance saying that binary
was patched. Its recorded ten passing behavior checks and 29 assertions are historical behavior
checks only; they are **not patched-binary security evidence**. The tests now require an explicit
operator-supplied `COGNATE_BWRAP_TEST_ATTESTATION` path to a host-owned JSON file whenever
`COGNATE_BWRAP_TESTS=1`. It contains an `executablePath` and reviewed `provenance` fields:
`operatorVerified: true`, `binarySha256`, `version`, `source`, and
`patchedCve202687766: true`. The hash is checked against the selected executable on every launch.
The test harness does not infer trust from an installed version or silently mark missing OS
evidence as a pass. The JSON is a host/operator declaration, not a signature or an independent
verification service; only configure it after reviewing the actual binary and its provenance.

The default non-OS run exercises three invalid-configuration guards; seven privileged OS tests are
skipped unless the explicit gate and valid operator JSON are both supplied. Unit-only placeholder
provenance is confined to the three tests that reject configuration before resolving or launching
an executable. It is never used by an OS test.

Explicit OS gate:

```sh
COGNATE_BWRAP_TESTS=1 bun test --timeout 15000 packages/execution/test/bubblewrap.test.ts
```

Set `COGNATE_BWRAP_TEST_ATTESTATION` to the path of a host-owned JSON file before running the OS
gate. For example, with the file stored at `/path/to/host-owned/bubblewrap-attestation.json`:

```sh
COGNATE_BWRAP_TESTS=1 \
COGNATE_BWRAP_TEST_ATTESTATION=/path/to/host-owned/bubblewrap-attestation.json \
bun test --timeout 15000 packages/execution/test/bubblewrap.test.ts
```

The file must contain an object with this shape, using reviewed values for the actual executable
(never a copied example or an automatically discovered package version):

```json
{
  "executablePath": "<reviewed executable path>",
  "provenance": {
    "operatorVerified": true,
    "binarySha256": "<reviewed 64-character lowercase SHA-256>",
    "version": "<reviewed binary/package version>",
    "source": "<reviewed provenance source>",
    "patchedCve202687766": true
  }
}
```

The previous distro-binary result does not qualify as patched-binary evidence. A replacement run
on 2026-10-15 used official upstream signed tag `v0.12.0`, tag object
`014a04330642e5c870418beb621532cb896e0002`, commit
`2a76602a8c71f36c1527cf9fc3417d9149822e0c`. GitHub's tag verification reports a valid signature;
local GPG verification was not completed because its default home was read-only. The source was
built with Meson/Ninja in a task-owned directory without replacing the system package. Its
`bubblewrap 0.12.0` executable SHA-256 was
`44f8437bfc9a54233d765590038b497fb7a3726e797b611da29e2bc8f4d6cee1`.

With its reviewed attestation file, all **ten tests pass, zero failures, 29 assertions in 2.60
seconds** on WSL2 Linux/Bun 1.4.0. Full `just verify` also passes **81/81 gates** with that OS gate
enabled. These are bounded filesystem/network/process behavior checks, not a complete security
review or production trust boundary. The attestation remains an explicit operator responsibility;
the SDK does not download, vendor, or automatically trust a system binary.
