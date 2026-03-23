# lapic-bench

Benchmark fixture layout for the lapic optimizer engine.

## Directory Structure

```
tools/lapic-bench/
├── registry/              # Governed corpus metadata (version-controlled)
│   ├── corpus.json        # Master corpus registry
│   └── suites/            # Suite definitions by profile class
│       ├── public/        # Reproducible, publication-eligible
│       ├── internal/      # CI/gating, restricted distribution
│       └── exploratory/   # Local/research-only
├── fixtures/              # Immutable benchmark inputs
│   ├── gi/                # Genshin Impact
│   ├── sr/                # Star Rail
│   ├── zzz/               # Zenless Zone Zero
│   ├── synthetic/         # Synthetic test cases
│   ├── adversarial/       # Stress/edge-case fixtures
│   └── generators/        # Fixture generation scripts
├── reports/               # Report definitions & baselines
│   ├── definitions/       # Report structure definitions
│   ├── baselines/         # Baseline benchmark results
│   └── published/         # Published reports
├── retained/              # Reproduction artifacts
│   ├── reports/           # Retained benchmark reports
│   ├── replay-closures/   # Replay closure artifacts
│   └── checkpoints/       # Runtime checkpoints
└── local/                 # Developer-only, unmanaged (.gitignore)
    ├── scratch/           # Temporary workspace
    └── imported/          # Imported external data
```

## Governance

See `docs/architecture/lapic/benchmark-fixture-layout.md` and
`docs/architecture/lapic/benchmark-governance-and-browser-noise.md`
for detailed governance rules and noise mitigation policies.

### Key Rules

- **Fixtures are immutable** once committed to a corpus version
- **Registry entries map deterministically** to fixtures
- **Silent drift is forbidden** — all changes must bump corpus version
- **Normative publication statistic**: median wall-clock time
- **Mean-only publication is forbidden**
- **Noise margin**: max(5%, 2 × baselineMADRatio), fallback 7%
