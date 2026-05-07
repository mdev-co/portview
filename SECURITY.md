# Security policy

## Supported versions

This project is a single active branch (`main`) plus short-lived feature branches. There are no maintenance releases. Only the latest commit on `main` is supported.

## Reporting a vulnerability

If you believe you have found a security issue, please report it privately rather than opening a public issue.

- Preferred channel: GitHub Security Advisories (Repository → Security → Advisories → New draft advisory).
- Please include reproduction steps, affected commit SHA, and the impact you observed.

You can expect:

- Acknowledgement within 7 days.
- A first assessment (accepted / needs more info / not in scope) within 14 days.
- A fix or mitigation timeline once the report is accepted.

## Out of scope

- Issues in third-party services or libraries (please report upstream).
- Findings that require physical access to the operator's hardware (RTL-SDR receiver, host machine).
- Denial of service via traffic flooding against the public demo deployment.

## Scope notes

- The public demo is read-only by design; there is no user authentication and no user data is collected.
- The ingest pipeline accepts AIS sentences from local UDP and external feeds; malformed input is treated as an expected condition, not a vulnerability, unless it crashes the worker or escapes the parser sandbox.
