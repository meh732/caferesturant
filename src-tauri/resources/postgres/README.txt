Arka POS Windows Server Edition - Bundled PostgreSQL Directory
==============================================================

When running `npm run build:win:server` on Windows, the script
`scripts/prepare-win-postgres.mjs` automatically downloads and
extracts the official EnterpriseDB PostgreSQL 16 Windows x64
portable server binaries (bin/, lib/, share/) into this folder
so they are embedded directly inside the ArkaPOS-Server setup .exe.

You can also manually place PostgreSQL portable `bin/`, `lib/`,
and `share/` folders here if building completely offline.
