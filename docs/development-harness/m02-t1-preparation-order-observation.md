# M02 T1 preparation and root-composition observations

Advisory only; no routing, model, prompt, permission or quality-gate policy changes are made here.

The one authorized r3 T1 attempt stopped UNKNOWN before native dispatch. Its unit tests had passed, but staged evidence was written to a case directory created only later by the launcher. The r4 regression therefore exercises `runT1` with an actual disposable filesystem and the actual exclusive receipt writer, including a failing receipt path that must leave the launcher unreachable. Pure helper checks and injected no-op writers do not prove preparation order.

Moving an operational root requires examining every enforcing component. R4 needed both a scoped-entry variant and a canonical backend variant; changing the manifest alone would leave the lazy backend rejecting its workspace. Independent review compared the entire new compiled backend with the accepted backend and found only the intentional root block delta. A test-root variant then exercised real SDK bootstrap/profile binding and SQLite initialization. That observation does not claim execution of exact fixed p2 paths or OS containment.

Retain bounded preparation error classes and keep post-journal setup inside UNKNOWN/close handling. Preserve failed attempt denominators, roots, journal clocks and historical review findings. Exact review should cover both implementation and claimed test scope; effective host role/model/context/sandbox proof remains unverified where no authenticated receipt exists. A previous scorecard append rejected missing context proof, and that condition must not be worked around by fabricating metadata. These observations propose future care within the existing workflow; they do not amend the approved gates.
