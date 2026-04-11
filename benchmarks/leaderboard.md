# Drift Leaderboard — 100 Top Repos Audited

**Date:** 2026-04-11
**crag version:** 0.5.2
**Pipeline:** clone → analyze → audit per repo

## Summary

| Metric | Value |
|---|---|
| Repos audited | **87** |
| Clone/analyze failures | **13** |
| Repos with governance drift | **86 (99%)** |
| Repos with zero AI config | **46 (53%)** |
| Total gates inferred | **3,136** |
| Mean gates per repo | **36.0** |

## Leaderboard

| # | Repo | Stars | Stack | Gates | Drift | AI Configs | Score |
|---|---|---|---|---|---|---|---|
| 1 | hashicorp/vault | 35K | go, docker, node... | 50 | 2 | .github/copilot-instructions.md | 100 |
| 2 | vitejs/vite | 80K | node, typescript | 44 | 2 | .github/copilot-instructions.md | 100 |
| 3 | docker/compose | 37K | go, docker | 40 | 2 | CLAUDE.md | 100 |
| 4 | sveltejs/svelte | 86K | node, typescript | 40 | 2 | AGENTS.md | 100 |
| 5 | withastro/astro | 58K | node, typescript | 40 | 2 | AGENTS.md | 100 |
| 6 | vitejs/vite-plugin-react | 1.1K | node, typescript | 39 | 2 | AGENTS.md | 100 |
| 7 | trpc/trpc | 40K | node, express, typescript... | 38 | 2 | .cursor/rules | 100 |
| 8 | remix-run/remix | 33K | node, typescript | 37 | 2 | AGENTS.md | 100 |
| 9 | neovim/neovim | 99K | zig, lua, c++/cmake | 32 | 2 | AGENTS.md | 100 |
| 10 | rails/rails | 58K | node, ruby, rails | 31 | 2 | AGENTS.md | 100 |
| 11 | cli/cli | 44K | go | 30 | 2 | AGENTS.md | 100 |
| 12 | micronaut-projects/micronaut-core | 6.4K | java/gradle | 29 | 2 | .clinerules | 100 |
| 13 | ziglang/zig | 43K | zig, c++/cmake | 21 | 0 | — | 100 |
| 14 | ansible/ansible | 68K | python | 19 | 2 | CLAUDE.md, AGENTS.md | 100 |
| 15 | vapor/vapor | 26K | swift | 14 | 2 | AGENTS.md | 100 |
| 16 | biomejs/biome | 24K | node, rust, react... | 47 | 3 | CLAUDE.md, AGENTS.md | 95 |
| 17 | prometheus/prometheus | 64K | go, docker, node... | 47 | 3 | CLAUDE.md, AGENTS.md | 95 |
| 18 | etcd-io/etcd | 52K | go, docker | 44 | 1 | — | 95 |
| 19 | facebook/docusaurus | 64K | node, typescript | 44 | 3 | AGENTS.md | 95 |
| 20 | tauri-apps/tauri | 105K | node, rust, typescript | 44 | 1 | — | 95 |
| 21 | junegunn/fzf | 79K | go, ruby, docker | 43 | 1 | — | 95 |
| 22 | nuxt/nuxt | 60K | node, typescript, vue | 43 | 1 | — | 95 |
| 23 | containerd/containerd | 21K | go | 42 | 1 | — | 95 |
| 24 | n8n-io/n8n | 184K | node, typescript, express | 42 | 3 | CLAUDE.md, AGENTS.md | 95 |
| 25 | traefik/traefik | 63K | go, docker | 42 | 1 | — | 95 |
| 26 | minio/minio | 61K | go, docker | 41 | 1 | — | 95 |
| 27 | evanw/esbuild | 40K | go, node, typescript | 40 | 1 | — | 95 |
| 28 | servo/servo | 36K | rust, python | 39 | 1 | — | 95 |
| 29 | yarnpkg/berry | 8.0K | node, typescript, react | 39 | 1 | — | 95 |
| 30 | angular/angular | 100K | node, typescript | 38 | 3 | AGENTS.md | 95 |
| 31 | django/django | 87K | node, python | 38 | 3 | .github/copilot-instructions.md | 95 |
| 32 | redwoodjs/redwood | 18K | node, typescript, fastify... | 38 | 1 | — | 95 |
| 33 | openai/openai-node | 11K | node, typescript | 37 | 1 | — | 95 |
| 34 | denoland/deno | 106K | rust | 36 | 3 | CLAUDE.md, .github/copilot-instructions.md | 95 |
| 35 | pandas-dev/pandas | 48K | python, c/meson | 35 | 3 | AGENTS.md | 95 |
| 36 | solidjs/solid | 35K | node, typescript, solid | 35 | 1 | — | 95 |
| 37 | alacritty/alacritty | 63K | rust | 33 | 1 | — | 95 |
| 38 | fastify/fastify | 36K | node, typescript | 33 | 1 | — | 95 |
| 39 | hashicorp/terraform | 48K | go, docker | 33 | 1 | — | 95 |
| 40 | leptos-rs/leptos | 21K | rust | 32 | 1 | — | 95 |
| 41 | BurntSushi/ripgrep | 62K | rust | 31 | 1 | — | 95 |
| 42 | drizzle-team/drizzle-orm | 34K | node, typescript | 30 | 1 | — | 95 |
| 43 | scikit-learn/scikit-learn | 66K | python, c/meson | 29 | 3 | AGENTS.md | 95 |
| 44 | helix-editor/helix | 44K | rust | 28 | 1 | — | 95 |
| 45 | phoenixframework/phoenix | 23K | node, elixir, phoenix | 28 | 1 | — | 95 |
| 46 | ajeetdsouza/zoxide | 36K | rust | 27 | 1 | — | 95 |
| 47 | elixir-lang/elixir | 26K | elixir | 26 | 1 | — | 95 |
| 48 | encode/starlette | 12K | python | 26 | 1 | — | 95 |
| 49 | apache/kafka | 32K | java/gradle | 24 | 1 | — | 95 |
| 50 | charmbracelet/bubbletea | 41K | go | 24 | 1 | — | 95 |
| 51 | expressjs/express | 69K | node | 23 | 1 | — | 95 |
| 52 | laravel/laravel | 84K | node, php, laravel | 22 | 1 | — | 95 |
| 53 | livebook-dev/livebook | 5.8K | elixir, phoenix, docker | 22 | 1 | — | 95 |
| 54 | nicklockwood/SwiftFormat | 8.8K | swift, docker | 21 | 3 | CLAUDE.md, AGENTS.md | 95 |
| 55 | apple/swift-package-manager | 10K | swift, c++/cmake | 16 | 1 | — | 95 |
| 56 | grafana/grafana | 73K | node, react, typescript... | 67 | 4 | CLAUDE.md, AGENTS.md | 90 |
| 57 | astral-sh/ruff | 47K | rust, python, docker | 53 | 4 | CLAUDE.md, AGENTS.md | 90 |
| 58 | Shopify/hydrogen | 1.9K | node, react, typescript | 48 | 4 | CLAUDE.md | 90 |
| 59 | webpack/webpack | 66K | node, typescript | 46 | 4 | CLAUDE.md, AGENTS.md | 90 |
| 60 | nestjs/nest | 75K | node, express, typescript... | 44 | 2 | — | 90 |
| 61 | apache/airflow | 45K | python, docker | 41 | 4 | CLAUDE.md, AGENTS.md | 90 |
| 62 | pydantic/pydantic | 27K | python | 38 | 2 | — | 90 |
| 63 | shadcn-ui/ui | 112K | node, typescript, next.js | 38 | 3 | .cursor/rules | 90 |
| 64 | pnpm/pnpm | 35K | node, typescript | 35 | 4 | CLAUDE.md, AGENTS.md | 90 |
| 65 | psf/black | 41K | python, docker | 35 | 2 | — | 90 |
| 66 | langchain-ai/langchain | 133K | python | 30 | 4 | CLAUDE.md, AGENTS.md | 90 |
| 67 | pallets/flask | 71K | python | 30 | 2 | — | 90 |
| 68 | pallets/werkzeug | 6.9K | python | 30 | 2 | — | 90 |
| 69 | python/mypy | 20K | python | 29 | 2 | — | 90 |
| 70 | tiangolo/fastapi | 97K | python | 29 | 2 | — | 90 |
| 71 | caddyserver/caddy | 71K | go | 27 | 2 | — | 90 |
| 72 | psf/requests | 54K | python | 26 | 2 | — | 90 |
| 73 | tokio-rs/tokio | 32K | rust | 31 | 3 | — | 89 |
| 74 | curl/curl | 41K | c++/cmake, docker | 35 | 4 | — | 86 |
| 75 | calcom/cal.com | 41K | node, typescript, docker... | 53 | 5 | .cursor/rules, CLAUDE.md, AGENTS.md | 85 |
| 76 | vuejs/core | 53K | node, typescript | 44 | 2 | — | 85 |
| 77 | supabase/supabase | 101K | node, typescript, react... | 43 | 4 | .cursor/rules, .github/copilot-instructions.md | 85 |
| 78 | zed-industries/zed | 79K | rust | 38 | 5 | CLAUDE.md, AGENTS.md, GEMINI.md, .rules | 85 |
| 79 | loco-rs/loco | 8.8K | rust | 31 | 2 | — | 85 |
| 80 | huggingface/transformers | 159K | python | 36 | 6 | CLAUDE.md, AGENTS.md, .github/copilot-instructions.md | 84 |
| 81 | excalidraw/excalidraw | 121K | node, typescript, docker | 46 | 5 | CLAUDE.md, .github/copilot-instructions.md | 80 |
| 82 | vercel/turborepo | 30K | node, typescript, rust | 51 | 5 | AGENTS.md | 75 |
| 83 | TanStack/query | 49K | node, typescript | 42 | 3 | — | 75 |
| 84 | vercel/ai | 23K | node, typescript, hono | 39 | 6 | CLAUDE.md, AGENTS.md | 75 |
| 85 | rollup/rollup | 26K | node, typescript | 50 | 6 | AGENTS.md, .github/copilot-instructions.md | 70 |
| 86 | oven-sh/bun | 89K | node, typescript, bun... | 48 | 7 | CLAUDE.md, AGENTS.md | 60 |
| 87 | astral-sh/ty | 18K | python, docker | 37 | 5 | — | 60 |

## Failed Repos

| Repo | Error |
|---|---|
| apache/flink | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\apache__flink'...
Updati |
| cockroachdb/cockroach | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\cockroachdb__cockroach'. |
| dotnet/aspnetcore | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\dotnet__aspnetcore'...
U |
| dotnet/maui | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\dotnet__maui'...
Updatin |
| elastic/elasticsearch | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\elastic__elasticsearch'. |
| facebook/react-native | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\facebook__react-native'. |
| flutter/flutter | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\flutter__flutter'...
Upd |
| moby/moby | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\moby__moby'...
Updating  |
| prisma/prisma | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\prisma__prisma'...
Updat |
| quarkusio/quarkus | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\quarkusio__quarkus'...
U |
| spring-projects/spring-framework | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\spring-projects__spring- |
| turbopack/turbopack | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\turbopack__turbopack'... |
| vercel/next.js | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\vercel__next.js'...
Upda |

## Key Findings

1. **99% of repos have governance drift** — rules referencing commands that don’t exist, configs older than their source.
2. **53% have zero AI config files** — no CLAUDE.md, no .cursorrules, no AGENTS.md. AI agents are flying blind.
3. **3,136 total gates inferred** across 87 repos, averaging 36.0 per repo.
4. **Highest gate counts:** grafana/grafana (67), astral-sh/ruff (53), calcom/cal.com (53), vercel/turborepo (51), hashicorp/vault (50)
5. **Most drift:** oven-sh/bun (7 issues), huggingface/transformers (6 issues), vercel/ai (6 issues), rollup/rollup (6 issues), calcom/cal.com (5 issues)
6. **AI config adoption:** 41 of 87 repos have at least one AI config file.
   Most common: AGENTS.md (30), CLAUDE.md (20), .github/copilot-instructions.md (8), .cursor/rules (4), .clinerules (1)

---

Generated by [crag](https://github.com/WhitehatD/crag) — one governance.md, every AI tool.
