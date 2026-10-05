---
name: technical-demo-film
description: Make precise developer-facing demonstration films from code, interactive demos and benchmark reports. Use for software, GPU and engineering films where reproducible evidence matters.
---

Read the actual implementation and its source figures. Map one central mechanism
to a visual explanation, show the source demo, then interpret the evidence. Use
code-rendered text and numbers; generated keyframes are only illustrative context.

Distinguish conceptual animation, recorded-result replay and live execution on
screen. Capture actual user-provided UI where possible. Do not present a visual bar
animation as a fresh measurement. Preserve source snapshots and hashes.

Each performance claim needs device, workload/shape, precision, baseline, timing
boundary and measurement date. End-to-end token throughput is not GEMM TFLOP/s.
Different baselines do not establish which API is faster. Do not hide slowdowns.
Historical preview availability must be described as a source snapshot, not a
statement about the current product release.

For subgroup-matrix: C′ = A×B+C, with A[M,K], B[K,N], C[M,N]. A subgroup cooperates
on distributed fragments; a logical example shape is not a supported hardware
tile. Capability enumeration must precede a claim of backend support.

First project evidence: `projects/subgroup-matrix/assets/demo.html` and `report.html`.
Its RX 9070 XT D3D12 FP16 FMA comparison is separate from Vulkan INT8 DP4A results.
Do not run driver installers, change GPU configuration or rerun the benchmark merely
to make a film unless that work was actually requested.
