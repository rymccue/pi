---
description: Security review focused on exploitability and practical fixes
argument-hint: "[scope/threat model]"
---

Security-review this scope: $ARGUMENTS

Focus on:
- authn/authz bypass
- injection and command execution
- SSRF/path traversal/deserialization
- secret handling and logging
- data exposure and tenant isolation
- unsafe filesystem or shell behavior

Return:
- severity-ranked findings
- exploit scenario
- affected paths/lines
- concrete mitigation
- tests or checks to add

Do not edit files unless I explicitly ask.
