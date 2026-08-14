# Architecture decision records

Each record states the constraint that forced a decision and the consequences
GreenCI accepted. Records for rejected features exist so the reasoning survives
the decision.

| ADR                                           | Decision                                                  |
| --------------------------------------------- | --------------------------------------------------------- |
| [0001](0001-no-external-server.md)            | No GreenCI server, database, or account                   |
| [0002](0002-robust-baseline.md)               | Compare against a robust baseline, never the previous run |
| [0003](0003-carbon-uncertainty.md)            | Report carbon as an interval, never as a single number    |
| [0004](0004-embedded-mode-default.md)         | Run as the final job in the analyzed workflow             |
| [0005](0005-no-composite-efficiency-score.md) | No composite CI efficiency score (rejected)               |
| [0006](0006-counterfactual-what-if.md)        | Counterfactual what-if analysis                           |
| [0007](0007-no-savings-projection.md)         | No monthly savings projection in v1.0.0 (deferred)        |
