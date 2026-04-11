# Drift Leaderboard — 100 Top Repos Audited

**Date:** 2026-04-11
**crag version:** 0.5.3
**Pipeline:** clone → analyze → audit per repo

## Summary

| Metric | Value |
|---|---|
| Repos audited | **87** |
| Clone/analyze failures | **13** |
| Repos with genuine drift | **14 (16%)** |
| AI config adoption | **41 (47%)** |
| Repos with zero AI config | **46 (53%)** |
| Total gates inferred | **3,136** |
| Mean gates per repo | **36.0** |

## Leaderboard

| # | Repo | Stars | Stack | Gates | Real Drift | AI Configs | Score |
|---|---|---|---|---|---|---|---|
| 1 | grafana/grafana | 73K | node, react, typescript... | 67 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 2 | astral-sh/ruff | 47K | rust, python, docker | 53 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 3 | calcom/cal.com | 41K | node, typescript, docker... | 53 | 0 | .cursor/rules, CLAUDE.md, AGENTS.md | 100 |
| 4 | hashicorp/vault | 35K | go, docker, node... | 50 | 0 | .github/copilot-instructions.md | 100 |
| 5 | Shopify/hydrogen | 1.9K | node, react, typescript | 48 | 0 | CLAUDE.md | 100 |
| 6 | biomejs/biome | 24K | node, rust, react... | 47 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 7 | prometheus/prometheus | 64K | go, docker, node... | 47 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 8 | webpack/webpack | 66K | node, typescript | 46 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 9 | vitejs/vite | 80K | node, typescript | 44 | 0 | .github/copilot-instructions.md | 100 |
| 10 | etcd-io/etcd | 52K | go, docker | 44 | 0 | — | 100 |
| 11 | facebook/docusaurus | 64K | node, typescript | 44 | 0 | AGENTS.md | 100 |
| 12 | tauri-apps/tauri | 105K | node, rust, typescript | 44 | 0 | — | 100 |
| 13 | nestjs/nest | 75K | node, express, typescript... | 44 | 0 | — | 100 |
| 14 | junegunn/fzf | 79K | go, ruby, docker | 43 | 0 | — | 100 |
| 15 | nuxt/nuxt | 60K | node, typescript, vue | 43 | 0 | — | 100 |
| 16 | containerd/containerd | 21K | go | 42 | 0 | — | 100 |
| 17 | n8n-io/n8n | 184K | node, typescript, express | 42 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 18 | traefik/traefik | 63K | go, docker | 42 | 0 | — | 100 |
| 19 | minio/minio | 61K | go, docker | 41 | 0 | — | 100 |
| 20 | apache/airflow | 45K | python, docker | 41 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 21 | docker/compose | 37K | go, docker | 40 | 0 | CLAUDE.md | 100 |
| 22 | sveltejs/svelte | 86K | node, typescript | 40 | 0 | AGENTS.md | 100 |
| 23 | withastro/astro | 58K | node, typescript | 40 | 0 | AGENTS.md | 100 |
| 24 | evanw/esbuild | 40K | go, node, typescript | 40 | 0 | — | 100 |
| 25 | vitejs/vite-plugin-react | 1.1K | node, typescript | 39 | 0 | AGENTS.md | 100 |
| 26 | servo/servo | 36K | rust, python | 39 | 0 | — | 100 |
| 27 | yarnpkg/berry | 8.0K | node, typescript, react | 39 | 0 | — | 100 |
| 28 | trpc/trpc | 40K | node, express, typescript... | 38 | 0 | .cursor/rules | 100 |
| 29 | angular/angular | 100K | node, typescript | 38 | 0 | AGENTS.md | 100 |
| 30 | django/django | 87K | node, python | 38 | 0 | .github/copilot-instructions.md | 100 |
| 31 | redwoodjs/redwood | 18K | node, typescript, fastify... | 38 | 0 | — | 100 |
| 32 | pydantic/pydantic | 27K | python | 38 | 0 | — | 100 |
| 33 | zed-industries/zed | 79K | rust | 38 | 0 | CLAUDE.md, AGENTS.md, GEMINI.md, .rules | 100 |
| 34 | remix-run/remix | 33K | node, typescript | 37 | 0 | AGENTS.md | 100 |
| 35 | openai/openai-node | 11K | node, typescript | 37 | 0 | — | 100 |
| 36 | denoland/deno | 106K | rust | 36 | 0 | CLAUDE.md, .github/copilot-instructions.md | 100 |
| 37 | huggingface/transformers | 159K | python | 36 | 2 | CLAUDE.md, AGENTS.md, .github/copilot-instructions.md | 100 |
| 38 | pandas-dev/pandas | 48K | python, c/meson | 35 | 0 | AGENTS.md | 100 |
| 39 | solidjs/solid | 35K | node, typescript, solid | 35 | 0 | — | 100 |
| 40 | pnpm/pnpm | 35K | node, typescript | 35 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 41 | psf/black | 41K | python, docker | 35 | 0 | — | 100 |
| 42 | alacritty/alacritty | 63K | rust | 33 | 0 | — | 100 |
| 43 | fastify/fastify | 36K | node, typescript | 33 | 0 | — | 100 |
| 44 | hashicorp/terraform | 48K | go, docker | 33 | 0 | — | 100 |
| 45 | neovim/neovim | 99K | zig, lua, c++/cmake | 32 | 0 | AGENTS.md | 100 |
| 46 | leptos-rs/leptos | 21K | rust | 32 | 0 | — | 100 |
| 47 | rails/rails | 58K | node, ruby, rails | 31 | 0 | AGENTS.md | 100 |
| 48 | BurntSushi/ripgrep | 62K | rust | 31 | 0 | — | 100 |
| 49 | cli/cli | 44K | go | 30 | 0 | AGENTS.md | 100 |
| 50 | drizzle-team/drizzle-orm | 34K | node, typescript | 30 | 0 | — | 100 |
| 51 | langchain-ai/langchain | 133K | python | 30 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 52 | pallets/flask | 71K | python | 30 | 0 | — | 100 |
| 53 | pallets/werkzeug | 6.9K | python | 30 | 0 | — | 100 |
| 54 | micronaut-projects/micronaut-core | 6.4K | java/gradle | 29 | 0 | .clinerules | 100 |
| 55 | scikit-learn/scikit-learn | 66K | python, c/meson | 29 | 0 | AGENTS.md | 100 |
| 56 | python/mypy | 20K | python | 29 | 0 | — | 100 |
| 57 | tiangolo/fastapi | 97K | python | 29 | 0 | — | 100 |
| 58 | helix-editor/helix | 44K | rust | 28 | 0 | — | 100 |
| 59 | phoenixframework/phoenix | 23K | node, elixir, phoenix | 28 | 0 | — | 100 |
| 60 | ajeetdsouza/zoxide | 36K | rust | 27 | 0 | — | 100 |
| 61 | caddyserver/caddy | 71K | go | 27 | 0 | — | 100 |
| 62 | elixir-lang/elixir | 26K | elixir | 26 | 0 | — | 100 |
| 63 | encode/starlette | 12K | python | 26 | 0 | — | 100 |
| 64 | psf/requests | 54K | python | 26 | 0 | — | 100 |
| 65 | apache/kafka | 32K | java/gradle | 24 | 0 | — | 100 |
| 66 | charmbracelet/bubbletea | 41K | go | 24 | 0 | — | 100 |
| 67 | expressjs/express | 69K | node | 23 | 0 | — | 100 |
| 68 | laravel/laravel | 84K | node, php, laravel | 22 | 0 | — | 100 |
| 69 | livebook-dev/livebook | 5.8K | elixir, phoenix, docker | 22 | 0 | — | 100 |
| 70 | ziglang/zig | 43K | zig, c++/cmake | 21 | 0 | — | 100 |
| 71 | nicklockwood/SwiftFormat | 8.8K | swift, docker | 21 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 72 | ansible/ansible | 68K | python | 19 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 73 | apple/swift-package-manager | 10K | swift, c++/cmake | 16 | 0 | — | 100 |
| 74 | vapor/vapor | 26K | swift | 14 | 0 | AGENTS.md | 100 |
| 75 | excalidraw/excalidraw | 121K | node, typescript, docker | 46 | 1 | CLAUDE.md, .github/copilot-instructions.md | 95 |
| 76 | supabase/supabase | 101K | node, typescript, react... | 43 | 1 | .cursor/rules, .github/copilot-instructions.md | 95 |
| 77 | vercel/ai | 23K | node, typescript, hono | 39 | 1 | CLAUDE.md, AGENTS.md | 95 |
| 78 | shadcn-ui/ui | 112K | node, typescript, next.js | 38 | 1 | .cursor/rules | 95 |
| 79 | tokio-rs/tokio | 32K | rust | 31 | 2 | — | 90 |
| 80 | vuejs/core | 53K | node, typescript | 44 | 1 | — | 85 |
| 81 | curl/curl | 41K | c++/cmake, docker | 35 | 3 | — | 85 |
| 82 | loco-rs/loco | 8.8K | rust | 31 | 1 | — | 85 |
| 83 | vercel/turborepo | 30K | node, typescript, rust | 51 | 2 | AGENTS.md | 80 |
| 84 | rollup/rollup | 26K | node, typescript | 50 | 2 | AGENTS.md, .github/copilot-instructions.md | 80 |
| 85 | TanStack/query | 49K | node, typescript | 42 | 2 | — | 70 |
| 86 | oven-sh/bun | 89K | node, typescript, bun... | 48 | 3 | CLAUDE.md, AGENTS.md | 65 |
| 87 | astral-sh/ty | 18K | python, docker | 37 | 3 | — | 55 |

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

1. **47% of repos now have AI config files** — CLAUDE.md, AGENTS.md, .cursorrules, or copilot-instructions. Adoption is real.
2. **53% still have zero AI config** — AI agents working on these repos get zero project-specific guidance.
3. **16% have genuine governance drift** — quality gates referencing commands that don’t exist, or CI running checks not captured in governance.
4. **3,136 total gates inferred** across 87 repos, averaging 36.0 per repo.
5. **Highest gate counts:** grafana/grafana (67), astral-sh/ruff (53), calcom/cal.com (53), vercel/turborepo (51), hashicorp/vault (50)
6. **Most drift:** curl/curl (3 issues), oven-sh/bun (3 issues), astral-sh/ty (3 issues), huggingface/transformers (2 issues), tokio-rs/tokio (2 issues)
7. **AI config breakdown:** 41 of 87 repos have at least one AI config file.
   Most common: AGENTS.md (30), CLAUDE.md (20), .github/copilot-instructions.md (8), .cursor/rules (4), GEMINI.md (1)

---

Generated by [crag](https://github.com/WhitehatD/crag) — one governance.md, every AI tool.
