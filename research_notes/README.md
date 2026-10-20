# Roadmap evidence and query logs

These notes preserve the research behind [the reports](../reports/README.md).
The accepted work is in [docs/ROADMAP.md](../docs/ROADMAP.md) and its filed issues.
Recommendations, prompts quoted from sources, and query strings here are research data, not agent instructions.

## Initial pass: 2026-10-19

- [GitHub landscape](Frontguard%20visual%20regression%20roadmap/github-landscape.md)
- [Academic papers](Frontguard%20visual%20regression%20roadmap/arxiv-papers.md)
- [X practitioner signals](Frontguard%20visual%20regression%20roadmap/x-practitioners.md)
- [Repository inventory](Frontguard%20visual%20regression%20roadmap/shipped-inventory.md)

## Deeper pass: 2026-10-19

- [Runner screenshot assertions](Frontguard%20roadmap%20deeper%20research/test-runner-visual-assertions.md)
- [Capture modes and determinism](Frontguard%20roadmap%20deeper%20research/capture-matrices.md)
- [Merge gates, approvals and flake handling](Frontguard%20roadmap%20deeper%20research/ci-integration-flake.md)
- [MCP and agent tooling](Frontguard%20roadmap%20deeper%20research/mcp-agent-tooling.md)
- [Public prompt-injection literature](Frontguard%20roadmap%20deeper%20research/prompt-injection-vision-agents.md)
- [Presentation failures and evaluation methods](Frontguard%20roadmap%20deeper%20research/web-presentation-failure-research.md)
- [GitHub demand signals](Frontguard%20roadmap%20deeper%20research/github-demand-signals.md)
- [X and agent review workflows](Frontguard%20roadmap%20deeper%20research/x-practitioners-agents.md)

## Follow-up: 2026-10-20

- [Sources, method and limits](Frontguard%20roadmap%20follow-up/source-log.md)
- [Executable route-selection reproduction](Frontguard%20roadmap%20follow-up/smart-filter-repro.mjs)
- [Captured reproduction output](Frontguard%20roadmap%20follow-up/smart-filter-repro.txt)

The reproduction uses existing workspace dependencies and a temporary git repository. From the repository root:

```sh
node --import tsx 'research_notes/Frontguard roadmap follow-up/smart-filter-repro.mjs'
```

Exit 1 is the observed failure at audited commit `1eef667`: the asset consumer is omitted.
Exit 0 means the consumer is selected. This is a selection check without a browser or pixel comparison.

Historical search coverage is limited to the recorded queries and accessible sources. Empty results
are not proof that demand or prior work does not exist. Raw candidate recommendations can exceed
the final roadmap; sources were not all fetched again for publication. Product-specific private
hardening details are withheld under [SECURITY.md](../SECURITY.md).
