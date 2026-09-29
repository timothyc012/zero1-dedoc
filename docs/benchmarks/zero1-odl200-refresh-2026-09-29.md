# Zero1 Dedoc ODL200 refresh

The public OpenDataLoader 200-document corpus was rerun after the PDF numeric
band and German heading fixes. The run used the unmodified public evaluator,
`ocr:false`, and the current `607aee6` parser build. All **200/200** inputs
parsed without a worker failure.

| Metric | Previous locked result | Current result | Delta |
| --- | ---: | ---: | ---: |
| Overall | 0.937051555 | 0.937073892 | +0.000022337 |
| Reading order (NID) | 0.938027420 | 0.938037332 | +0.000009912 |
| Table structure (TEDS) | 0.935699400 | 0.935699400 | 0 |
| Heading hierarchy (MHS) | 0.932648642 | 0.932713617 | +0.000064975 |

There were no material negative document deltas. Three documents moved by less
than `0.00026` NID in the evaluator's final floating-point score; the largest
positive document change was `+0.004674278` overall. The evaluator report is
retained locally with SHA-256
`4f51a16d22b3436e9329e2fbb06559090c0e78f6b5ec2bb14593205e8739c284`.

This refresh is evidence of public-corpus non-regression. It does not replace
the German BMF cell gold or the private Korean holdout, and it does not change
the 02ontology `auto` parser route.
