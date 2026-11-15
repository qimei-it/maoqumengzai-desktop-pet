# Bundled skill sources

These built-in skills are vendored from the upstream repositories below at the pinned commits.

- https://github.com/k-dense-ai/scientific-agent-skills @ `2d2065fb4520fa3f3f2bcf61cff26ec8b7eba4b5` (MIT)
- https://github.com/Yuan1z0825/nature-skills @ `7bff1d0539c0dfad6c30178bb93ce6dd8a5cebf8` (Apache-2.0)
- https://github.com/blader/humanizer @ `b48c832f0f809c1b5658edbb838c2521b72f2413` (MIT)

## Excluded pending license confirmation

- `https://github.com/HKUSTDial/Supervisor-Skills` is CC BY-NC-SA 4.0 (non-commercial, share-alike).
- `https://github.com/Imbad0202/academic-research-skills-codex` is CC BY-NC 4.0 (non-commercial).
- `https://github.com/future-house/paper-qa` does not contain a `SKILL.md`; it is a Python package, not an Agent Skill.

## Vendored content

Only text and code files up to 512 KB (SKILL.md up to 2 MB) are copied; binary templates, images, fonts and media are excluded. Each skill stays read-only in the app and can be enabled or disabled by the user.

## General tools and office skills (2026-11-15)

- https://github.com/anthropics/skills @ `1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064` (Apache-2.0, shared license at `licenses/anthropic-Apache-2.0.txt`; unlicensed `doc-coauthoring` excluded)
- https://github.com/getsentry/skills @ `a582c51ee29d0f35e6ac321340796f77d43da733` (Apache-2.0)
- https://github.com/vercel-labs/skills @ `b716f9dc2ba36b6aa8f0080615e5a3a6caeac63b` (MIT)
- https://github.com/yejinlei/web-search-skill @ `00b2ab6b694f9f0100d4679e9765034fe108a7ac` (MIT)
- https://github.com/citrolabs/ego-lite @ `bacaece43900e8ca68eea3b6f1663835ea38df9e` (MIT)

Anthropic skills are Apache-2.0; the shared license is at `licenses/anthropic-Apache-2.0.txt`. Only text and code files are vendored.

## Not bundled

- `https://github.com/dlazy-ai/ecommerce-skills` was evaluated but removed because 22 of its 26 skills require the external `dlazy` CLI and credits.
- The HuaAngel and Zhihu pages are recommendation lists that point to third-party/ClawHub skills without source repositories or licenses.

## Amazon, TikTok and Ozon skills (2026-11-15)

- https://github.com/zhenyangze/tiktok-skills @ `fd67ce5e0a0b3ea6855cf203ae3e0e1542466fc4` (MIT declared in README; no LICENSE file)
- https://github.com/liangdabiao/Amazon-Skills-Liang @ `3dde6a7535b7140a621e13b3bfd1e838a2c082a2` (MIT, `skills/LICENSE`)
- https://github.com/coral870921-source/Ozon-Profit-Skills @ `4f883a1facf47496c2e7b8907fd8d11f8110100c` (MIT)
- https://github.com/liangdabiao/amazon-sorftime-research-MCP-skill @ `cfdf288f868e2ed23bb1bbe73c37e4581bf88b87` (MIT declared in README; no LICENSE file)

Not bundled because no license grant was found: `infometa/workbuddyskills` (ozon-1688-uploader) and `liangdabiao/amazon-listing-alexa-optimizer`.
