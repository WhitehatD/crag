# Drift Leaderboard — 100 Top Repos Audited

**Date:** 2026-04-15
**crag version:** 0.5.20
**Pipeline:** clone → analyze → audit per repo

## Summary

| Metric | Value |
|---|---|
| Repos audited | **99** |
| Clone/analyze failures | **1** |
| Repos with genuine drift | **13 (13%)** |
| AI config adoption | **45 (45%)** |
| Repos with zero AI config | **54 (55%)** |
| Total gates inferred | **3,540** |
| Mean gates per repo | **35.8** |

## Leaderboard

| # | Repo | Stars | Stack | Gates | Real Drift | AI Configs | Score |
|---|---|---|---|---|---|---|---|
| 1 | ansible/ansible | 68K | python | 19 | 0 | CLAUDE.md, AGENTS.md | 94 |
| 2 | biomejs/biome | 24K | node, rust, react... | 45 | 0 | CLAUDE.md, AGENTS.md | 91 |
| 3 | prometheus/prometheus | 64K | go, docker, node... | 45 | 0 | CLAUDE.md, AGENTS.md | 91 |
| 4 | supabase/supabase | 101K | node, typescript, react... | 42 | 0 | .cursor/rules, .github/copilot-instructions.md | 91 |
| 5 | denoland/deno | 106K | rust | 36 | 0 | CLAUDE.md, .github/copilot-instructions.md | 91 |
| 6 | nushell/nushell | 39K | rust | 34 | 0 | CLAUDE.md, AGENTS.md | 91 |
| 7 | nicklockwood/SwiftFormat | 8.8K | swift, docker | 21 | 0 | CLAUDE.md, AGENTS.md | 91 |
| 8 | grafana/grafana | 73K | node, react, typescript... | 65 | 0 | CLAUDE.md, AGENTS.md | 88 |
| 9 | astral-sh/ruff | 47K | rust, python, docker | 53 | 0 | CLAUDE.md, AGENTS.md | 88 |
| 10 | astral-sh/uv | 83K | rust, python, docker | 52 | 0 | CLAUDE.md, AGENTS.md | 88 |
| 11 | oven-sh/bun | 89K | node, typescript, bun... | 46 | 0 | CLAUDE.md, AGENTS.md | 88 |
| 12 | webpack/webpack | 66K | node, typescript | 45 | 0 | CLAUDE.md, AGENTS.md | 88 |
| 13 | apache/airflow | 45K | python, docker | 41 | 0 | CLAUDE.md, AGENTS.md | 88 |
| 14 | pnpm/pnpm | 35K | node, typescript | 35 | 0 | CLAUDE.md, AGENTS.md | 88 |
| 15 | calcom/cal.com | 41K | node, typescript, docker... | 52 | 0 | .cursor/rules, CLAUDE.md, AGENTS.md | 85 |
| 16 | zed-industries/zed | 79K | rust | 38 | 0 | CLAUDE.md, AGENTS.md, GEMINI.md, .rules | 85 |
| 17 | hashicorp/vault | 35K | go, docker, node... | 48 | 0 | .github/copilot-instructions.md | 79 |
| 18 | facebook/react | 245K | node, typescript | 43 | 0 | CLAUDE.md | 79 |
| 19 | vitejs/vite | 80K | node, typescript | 41 | 0 | .github/copilot-instructions.md | 79 |
| 20 | docker/compose | 37K | go, docker | 40 | 0 | CLAUDE.md | 79 |
| 21 | sveltejs/svelte | 86K | node, typescript | 40 | 0 | AGENTS.md | 79 |
| 22 | withastro/astro | 58K | node, typescript | 39 | 0 | AGENTS.md | 79 |
| 23 | shadcn-ui/ui | 112K | node, typescript, next.js | 38 | 0 | .cursor/rules | 79 |
| 24 | Effect-TS/effect | 14K | node, typescript | 37 | 0 | AGENTS.md | 79 |
| 25 | remix-run/remix | 33K | node, typescript | 37 | 0 | AGENTS.md | 79 |
| 26 | trpc/trpc | 40K | node, express, typescript... | 37 | 0 | .cursor/rules | 79 |
| 27 | vitejs/vite-plugin-react | 1.1K | node, typescript | 36 | 0 | AGENTS.md | 79 |
| 28 | neovim/neovim | 99K | zig, lua, c++/cmake | 32 | 0 | AGENTS.md | 79 |
| 29 | cli/cli | 44K | go | 30 | 0 | AGENTS.md | 79 |
| 30 | micronaut-projects/micronaut-core | 6.4K | java/gradle | 29 | 0 | .clinerules | 79 |
| 31 | rails/rails | 58K | node, ruby, rails | 29 | 0 | AGENTS.md | 79 |
| 32 | vapor/vapor | 26K | swift | 14 | 0 | AGENTS.md | 79 |
| 33 | excalidraw/excalidraw | 121K | node, typescript, docker | 46 | 1 | CLAUDE.md, .github/copilot-instructions.md | 78 |
| 34 | huggingface/transformers | 159K | python | 36 | 2 | CLAUDE.md, AGENTS.md, .github/copilot-instructions.md | 78 |
| 35 | facebook/docusaurus | 65K | node, typescript | 44 | 0 | AGENTS.md | 76 |
| 36 | angular/angular | 100K | node, typescript | 38 | 0 | AGENTS.md | 76 |
| 37 | pandas-dev/pandas | 49K | python, c/meson | 35 | 0 | AGENTS.md | 76 |
| 38 | scikit-learn/scikit-learn | 66K | python, c/meson | 29 | 0 | AGENTS.md | 76 |
| 39 | vercel/ai | 24K | node, typescript, hono | 39 | 1 | CLAUDE.md, AGENTS.md | 75 |
| 40 | Shopify/hydrogen | 1.9K | node, react, typescript | 43 | 0 | CLAUDE.md | 73 |
| 41 | rollup/rollup | 26K | node, typescript | 50 | 2 | AGENTS.md, .github/copilot-instructions.md | 68 |
| 42 | n8n-io/n8n | 184K | node, typescript, express | 42 | 3 | CLAUDE.md, AGENTS.md | 61 |
| 43 | vuejs/core | 53K | node, typescript | 44 | 0 | — | 57 |
| 44 | junegunn/fzf | 79K | go, ruby, docker | 43 | 0 | — | 57 |
| 45 | nuxt/nuxt | 60K | node, typescript, vue | 43 | 0 | — | 57 |
| 46 | etcd-io/etcd | 52K | go, docker | 42 | 0 | — | 57 |
| 47 | pmndrs/zustand | 58K | node, typescript | 42 | 0 | — | 57 |
| 48 | tauri-apps/tauri | 105K | node, rust, typescript | 42 | 0 | — | 57 |
| 49 | traefik/traefik | 63K | go, docker | 42 | 0 | — | 57 |
| 50 | containerd/containerd | 21K | go | 41 | 0 | — | 57 |
| 51 | minio/minio | 61K | go, docker | 41 | 0 | — | 57 |
| 52 | TanStack/query | 49K | node, typescript | 39 | 0 | — | 57 |
| 53 | yarnpkg/berry | 8.1K | node, typescript, react | 39 | 0 | — | 57 |
| 54 | evanw/esbuild | 40K | go, node, typescript | 38 | 0 | — | 57 |
| 55 | redwoodjs/redwood | 18K | node, typescript, fastify... | 38 | 0 | — | 57 |
| 56 | openai/openai-node | 11K | node, typescript | 37 | 0 | — | 57 |
| 57 | chartjs/Chart.js | 67K | node, typescript, php | 34 | 0 | — | 57 |
| 58 | alacritty/alacritty | 63K | rust | 33 | 0 | — | 57 |
| 59 | date-fns/date-fns | 37K | node, typescript | 33 | 0 | — | 57 |
| 60 | fastify/fastify | 36K | node, typescript | 33 | 0 | — | 57 |
| 61 | hashicorp/terraform | 48K | go, docker | 33 | 0 | — | 57 |
| 62 | solidjs/solid | 35K | node, typescript, solid | 33 | 0 | — | 57 |
| 63 | leptos-rs/leptos | 21K | rust | 32 | 0 | — | 57 |
| 64 | BurntSushi/ripgrep | 62K | rust | 31 | 0 | — | 57 |
| 65 | drizzle-team/drizzle-orm | 34K | node, typescript | 30 | 0 | — | 57 |
| 66 | helix-editor/helix | 44K | rust | 28 | 0 | — | 57 |
| 67 | ajeetdsouza/zoxide | 36K | rust | 27 | 0 | — | 57 |
| 68 | sindresorhus/got | 15K | node, typescript | 27 | 0 | — | 57 |
| 69 | elixir-lang/elixir | 26K | elixir | 26 | 0 | — | 57 |
| 70 | encode/starlette | 12K | python | 26 | 0 | — | 57 |
| 71 | phoenixframework/phoenix | 23K | node, elixir, phoenix | 26 | 0 | — | 57 |
| 72 | apache/kafka | 32K | java/gradle | 24 | 0 | — | 57 |
| 73 | charmbracelet/bubbletea | 42K | go | 24 | 0 | — | 57 |
| 74 | expressjs/express | 69K | node | 23 | 0 | — | 57 |
| 75 | livebook-dev/livebook | 5.8K | elixir, phoenix, docker | 22 | 0 | — | 57 |
| 76 | ziglang/zig | 43K | zig, c++/cmake | 21 | 0 | — | 57 |
| 77 | laravel/laravel | 84K | node, php, laravel | 20 | 0 | — | 57 |
| 78 | apple/swift-package-manager | 10K | swift, c++/cmake | 16 | 0 | — | 57 |
| 79 | lucia-auth/lucia | 10K | node | 15 | 0 | — | 57 |
| 80 | django/django | 87K | node, python | 33 | 2 | .github/copilot-instructions.md | 56 |
| 81 | hashicorp/consul | 30K | go, docker, node | 48 | 0 | — | 54 |
| 82 | mermaid-js/mermaid | 87K | node, typescript, docker | 48 | 0 | — | 54 |
| 83 | nestjs/nest | 75K | node, express, typescript... | 44 | 0 | — | 54 |
| 84 | vercel/swr | 32K | node, typescript | 42 | 0 | — | 54 |
| 85 | pydantic/pydantic | 27K | python | 37 | 0 | — | 54 |
| 86 | psf/black | 41K | python, docker | 35 | 0 | — | 54 |
| 87 | pallets/flask | 71K | python | 30 | 0 | — | 54 |
| 88 | pallets/werkzeug | 6.9K | python | 30 | 0 | — | 54 |
| 89 | caddyserver/caddy | 72K | go | 27 | 0 | — | 54 |
| 90 | psf/requests | 54K | python | 26 | 0 | — | 54 |
| 91 | tiangolo/fastapi | 97K | python | 26 | 0 | — | 54 |
| 92 | strapi/strapi | 72K | node, typescript | 43 | 0 | — | 51 |
| 93 | langchain-ai/langchain | 134K | python | 30 | 4 | CLAUDE.md, AGENTS.md | 48 |
| 94 | loco-rs/loco | 8.8K | rust | 31 | 1 | — | 47 |
| 95 | tokio-rs/tokio | 32K | rust | 31 | 2 | — | 47 |
| 96 | vercel/turborepo | 30K | node, typescript, rust | 49 | 3 | AGENTS.md | 46 |
| 97 | python/mypy | 20K | python | 29 | 1 | — | 44 |
| 98 | curl/curl | 41K | c++/cmake, docker | 35 | 3 | — | 37 |
| 99 | astral-sh/ty | 18K | python, docker | 37 | 3 | — | 24 |

## Failed Repos

| Repo | Error |
|---|---|
| servo/servo | clone failed: Cloning into 'D:\playground\crag\benchmarks\leaderboard-repos\servo__servo'...
Updatin |

## Key Findings

1. **45% of repos now have AI config files** — CLAUDE.md, AGENTS.md, .cursorrules, or copilot-instructions. Adoption is real.
2. **55% still have zero AI config** — AI agents working on these repos get zero project-specific guidance.
3. **13% have genuine governance drift** — quality gates referencing commands that don’t exist, or CI running checks not captured in governance.
4. **3,540 total gates inferred** across 99 repos, averaging 35.8 per repo.
5. **Highest gate counts:** grafana/grafana (65), astral-sh/ruff (53), astral-sh/uv (52), calcom/cal.com (52), rollup/rollup (50)
6. **Most drift:** langchain-ai/langchain (8 issues), huggingface/transformers (6 issues), vercel/ai (6 issues), rollup/rollup (6 issues), n8n-io/n8n (6 issues)
7. **AI config breakdown:** 45 of 99 repos have at least one AI config file.
   Most common: AGENTS.md (33), CLAUDE.md (23), .github/copilot-instructions.md (8), .cursor/rules (4), GEMINI.md (1)

---

Generated by [crag](https://github.com/WhitehatD/crag) — one governance.md, every AI tool.
