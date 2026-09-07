# Decisions

## Keep the terminal consumer in its own repository

### Decision

Maintain the interactive command-line consumer as `@mikode13/harness-cli`, a separate
application repository that depends on `@mikode13/harness`.

### Context

The harness package defines provider-agnostic agent contracts and orchestration. Terminal
input, progress rendering, process lifecycle, and provider composition are consumer concerns;
keeping them separate prevents a specific CLI interaction model from becoming part of the
published library seam.

### Consequences

The CLI can evolve its command-line experience independently and can serve as a real consumer
of the public harness API. It must track released harness versions and own the SDK credentials,
provider configuration, and terminal-specific tests it needs.
