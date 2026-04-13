# Drift Leaderboard — 100 Top Repos Audited

**Date:** 2026-04-13
**crag version:** 0.5.12
**Pipeline:** clone → analyze → audit per repo

## Summary

| Metric | Value |
|---|---|
| Repos audited | **100** |
| Clone/analyze failures | **0** |
| Repos with genuine drift | **15 (15%)** |
| AI config adoption | **45 (45%)** |
| Repos with zero AI config | **55 (55%)** |
| Total gates inferred | **3,620** |
| Mean gates per repo | **36.2** |

## Leaderboard

| # | Repo | Stars | Stack | Gates | Real Drift | AI Configs | Score |
|---|---|---|---|---|---|---|---|
| 1 | grafana/grafana | 73K | node, react, typescript... | 67 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 2 | astral-sh/ruff | 47K | rust, python, docker | 53 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 3 | calcom/cal.com | 41K | node, typescript, docker... | 53 | 0 | .cursor/rules, CLAUDE.md, AGENTS.md | 100 |
| 4 | astral-sh/uv | 83K | rust, python, docker | 52 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 5 | hashicorp/consul | 30K | go, docker, node | 50 | 0 | — | 100 |
| 6 | hashicorp/vault | 35K | go, docker, node... | 50 | 0 | .github/copilot-instructions.md | 100 |
| 7 | mermaid-js/mermaid | 87K | node, typescript, docker | 48 | 0 | — | 100 |
| 8 | oven-sh/bun | 89K | node, typescript, bun... | 48 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 9 | biomejs/biome | 24K | node, rust, react... | 47 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 10 | prometheus/prometheus | 64K | go, docker, node... | 47 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 11 | webpack/webpack | 66K | node, typescript | 46 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 12 | facebook/docusaurus | 65K | node, typescript | 44 | 0 | AGENTS.md | 100 |
| 13 | nestjs/nest | 75K | node, express, typescript... | 44 | 0 | — | 100 |
| 14 | tauri-apps/tauri | 105K | node, rust, typescript | 44 | 0 | — | 100 |
| 15 | vuejs/core | 53K | node, typescript | 44 | 0 | — | 100 |
| 16 | junegunn/fzf | 79K | go, ruby, docker | 43 | 0 | — | 100 |
| 17 | nuxt/nuxt | 60K | node, typescript, vue | 43 | 0 | — | 100 |
| 18 | Shopify/hydrogen | 1.9K | node, react, typescript | 43 | 0 | CLAUDE.md | 100 |
| 19 | etcd-io/etcd | 52K | go, docker | 42 | 0 | — | 100 |
| 20 | pmndrs/zustand | 58K | node, typescript | 42 | 0 | — | 100 |
| 21 | supabase/supabase | 101K | node, typescript, react... | 42 | 0 | .cursor/rules, .github/copilot-instructions.md | 100 |
| 22 | traefik/traefik | 63K | go, docker | 42 | 0 | — | 100 |
| 23 | vercel/swr | 32K | node, typescript | 42 | 0 | — | 100 |
| 24 | apache/airflow | 45K | python, docker | 41 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 25 | containerd/containerd | 21K | go | 41 | 0 | — | 100 |
| 26 | minio/minio | 61K | go, docker | 41 | 0 | — | 100 |
| 27 | vitejs/vite | 80K | node, typescript | 41 | 0 | .github/copilot-instructions.md | 100 |
| 28 | docker/compose | 37K | go, docker | 40 | 0 | CLAUDE.md | 100 |
| 29 | evanw/esbuild | 40K | go, node, typescript | 40 | 0 | — | 100 |
| 30 | sveltejs/svelte | 86K | node, typescript | 40 | 0 | AGENTS.md | 100 |
| 31 | TanStack/query | 49K | node, typescript | 40 | 0 | — | 100 |
| 32 | servo/servo | 36K | rust, python | 39 | 0 | — | 100 |
| 33 | withastro/astro | 58K | node, typescript | 39 | 0 | AGENTS.md | 100 |
| 34 | yarnpkg/berry | 8.0K | node, typescript, react | 39 | 0 | — | 100 |
| 35 | angular/angular | 100K | node, typescript | 38 | 0 | AGENTS.md | 100 |
| 36 | redwoodjs/redwood | 18K | node, typescript, fastify... | 38 | 0 | — | 100 |
| 37 | shadcn-ui/ui | 112K | node, typescript, next.js | 38 | 0 | .cursor/rules | 100 |
| 38 | trpc/trpc | 40K | node, express, typescript... | 38 | 0 | .cursor/rules | 100 |
| 39 | zed-industries/zed | 79K | rust | 38 | 0 | CLAUDE.md, AGENTS.md, GEMINI.md, .rules | 100 |
| 40 | Effect-TS/effect | 14K | node, typescript | 37 | 0 | AGENTS.md | 100 |
| 41 | openai/openai-node | 11K | node, typescript | 37 | 0 | — | 100 |
| 42 | pydantic/pydantic | 27K | python | 37 | 0 | — | 100 |
| 43 | remix-run/remix | 33K | node, typescript | 37 | 0 | AGENTS.md | 100 |
| 44 | chartjs/Chart.js | 67K | node, typescript, php | 36 | 0 | — | 100 |
| 45 | denoland/deno | 106K | rust | 36 | 0 | CLAUDE.md, .github/copilot-instructions.md | 100 |
| 46 | huggingface/transformers | 159K | python | 36 | 2 | CLAUDE.md, AGENTS.md, .github/copilot-instructions.md | 100 |
| 47 | vitejs/vite-plugin-react | 1.1K | node, typescript | 36 | 0 | AGENTS.md | 100 |
| 48 | pandas-dev/pandas | 48K | python, c/meson | 35 | 0 | AGENTS.md | 100 |
| 49 | pnpm/pnpm | 35K | node, typescript | 35 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 50 | psf/black | 41K | python, docker | 35 | 0 | — | 100 |
| 51 | nushell/nushell | 39K | rust | 34 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 52 | alacritty/alacritty | 63K | rust | 33 | 0 | — | 100 |
| 53 | date-fns/date-fns | 37K | node, typescript | 33 | 0 | — | 100 |
| 54 | fastify/fastify | 36K | node, typescript | 33 | 0 | — | 100 |
| 55 | hashicorp/terraform | 48K | go, docker | 33 | 0 | — | 100 |
| 56 | solidjs/solid | 35K | node, typescript, solid | 33 | 0 | — | 100 |
| 57 | leptos-rs/leptos | 21K | rust | 32 | 0 | — | 100 |
| 58 | neovim/neovim | 99K | zig, lua, c++/cmake | 32 | 0 | AGENTS.md | 100 |
| 59 | BurntSushi/ripgrep | 62K | rust | 31 | 0 | — | 100 |
| 60 | rails/rails | 58K | node, ruby, rails | 31 | 0 | AGENTS.md | 100 |
| 61 | cli/cli | 44K | go | 30 | 0 | AGENTS.md | 100 |
| 62 | drizzle-team/drizzle-orm | 34K | node, typescript | 30 | 0 | — | 100 |
| 63 | pallets/flask | 71K | python | 30 | 0 | — | 100 |
| 64 | pallets/werkzeug | 6.9K | python | 30 | 0 | — | 100 |
| 65 | micronaut-projects/micronaut-core | 6.4K | java/gradle | 29 | 0 | .clinerules | 100 |
| 66 | scikit-learn/scikit-learn | 66K | python, c/meson | 29 | 0 | AGENTS.md | 100 |
| 67 | tiangolo/fastapi | 97K | python | 29 | 0 | — | 100 |
| 68 | helix-editor/helix | 44K | rust | 28 | 0 | — | 100 |
| 69 | phoenixframework/phoenix | 23K | node, elixir, phoenix | 28 | 0 | — | 100 |
| 70 | ajeetdsouza/zoxide | 36K | rust | 27 | 0 | — | 100 |
| 71 | caddyserver/caddy | 72K | go | 27 | 0 | — | 100 |
| 72 | sindresorhus/got | 15K | node, typescript | 27 | 0 | — | 100 |
| 73 | elixir-lang/elixir | 26K | elixir | 26 | 0 | — | 100 |
| 74 | encode/starlette | 12K | python | 26 | 0 | — | 100 |
| 75 | psf/requests | 54K | python | 26 | 0 | — | 100 |
| 76 | apache/kafka | 32K | java/gradle | 24 | 0 | — | 100 |
| 77 | charmbracelet/bubbletea | 42K | go | 24 | 0 | — | 100 |
| 78 | expressjs/express | 69K | node | 23 | 0 | — | 100 |
| 79 | laravel/laravel | 84K | node, php, laravel | 22 | 0 | — | 100 |
| 80 | livebook-dev/livebook | 5.8K | elixir, phoenix, docker | 22 | 0 | — | 100 |
| 81 | nicklockwood/SwiftFormat | 8.8K | swift, docker | 21 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 82 | ziglang/zig | 43K | zig, c++/cmake | 21 | 0 | — | 100 |
| 83 | ansible/ansible | 68K | python | 19 | 0 | CLAUDE.md, AGENTS.md | 100 |
| 84 | apple/swift-package-manager | 10K | swift, c++/cmake | 16 | 0 | — | 100 |
| 85 | lucia-auth/lucia | 10K | node | 15 | 0 | — | 100 |
| 86 | vapor/vapor | 26K | swift | 14 | 0 | AGENTS.md | 100 |
| 87 | excalidraw/excalidraw | 121K | node, typescript, docker | 46 | 1 | CLAUDE.md, .github/copilot-instructions.md | 95 |
| 88 | vercel/ai | 23K | node, typescript, hono | 39 | 1 | CLAUDE.md, AGENTS.md | 95 |
| 89 | tokio-rs/tokio | 32K | rust | 31 | 2 | — | 90 |
| 90 | loco-rs/loco | 8.8K | rust | 31 | 1 | — | 85 |
| 91 | python/mypy | 20K | python | 29 | 1 | — | 85 |
| 92 | rollup/rollup | 26K | node, typescript | 50 | 2 | AGENTS.md, .github/copilot-instructions.md | 80 |
| 93 | django/django | 87K | node, python | 38 | 2 | .github/copilot-instructions.md | 80 |
| 94 | curl/curl | 41K | c++/cmake, docker | 35 | 3 | — | 75 |
| 95 | strapi/strapi | 72K | node, typescript | 45 | 2 | — | 70 |
| 96 | facebook/react | 244K | node, typescript | 44 | 3 | CLAUDE.md | 65 |
| 97 | n8n-io/n8n | 184K | node, typescript, express | 42 | 3 | CLAUDE.md, AGENTS.md | 65 |
| 98 | astral-sh/ty | 18K | python, docker | 37 | 3 | — | 55 |
| 99 | vercel/turborepo | 30K | node, typescript, rust | 51 | 4 | AGENTS.md | 50 |
| 100 | langchain-ai/langchain | 133K | python | 30 | 4 | CLAUDE.md, AGENTS.md | 50 |

## Key Findings

1. **45% of repos now have AI config files** — CLAUDE.md, AGENTS.md, .cursorrules, or copilot-instructions. Adoption is real.
2. **55% still have zero AI config** — AI agents working on these repos get zero project-specific guidance.
3. **15% have genuine governance drift** — quality gates referencing commands that don’t exist, or CI running checks not captured in governance.
4. **3,620 total gates inferred** across 100 repos, averaging 36.2 per repo.
5. **Highest gate counts:** grafana/grafana (67), astral-sh/ruff (53), calcom/cal.com (53), astral-sh/uv (52), vercel/turborepo (51)
6. **Most drift:** langchain-ai/langchain (8 issues), vercel/turborepo (7 issues), huggingface/transformers (6 issues), vercel/ai (6 issues), rollup/rollup (6 issues)
7. **AI config breakdown:** 45 of 100 repos have at least one AI config file.
   Most common: AGENTS.md (33), CLAUDE.md (23), .github/copilot-instructions.md (8), .cursor/rules (4), GEMINI.md (1)

---

Generated by [crag](https://github.com/WhitehatD/crag) — one governance.md, every AI tool.
