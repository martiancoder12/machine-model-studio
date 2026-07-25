# I.8 · Undefined behaviour and reading real C *(capstone)*

> **Level:** L2→L3 — with the I.7 gate build, this module completes the L3 gate · **Prerequisites:** I.2 (overflow), I.4 (lifetime), I.5 (bounds), I.7 (the sanitizer toolchain)
> **You will be able to:**
> - explain why one program can legitimately behave differently at `-O0` and `-O2`, and name the promise the optimizer exploited;
> - find undefined behaviour in C you didn't write — by eye, using a repeatable reading method, and by tool, using sanitizer builds and targeted probes;
> - read, instrument, find a defect in, and extend a few-hundred-line C program: **the I.8 parser**, the artifact Book III.4 will fuzz.

## Cold Open

You want to guard an addition against overflow. You write the obvious check: if `x + 1` comes out *smaller* than `x`, the addition must have wrapped. Type it in and run it — `guard.c`:

```c
#include <stdio.h>
#include <stdlib.h>
#include <limits.h>

int main(int argc, char **argv)
{
    int x = (argc > 1) ? (int)strtol(argv[1], NULL, 10) : INT_MAX;

    if (x + 1 < x)
        printf("guard fired: %d + 1 overflowed, refusing\n", x);
    else
        printf("guard silent: %d + 1 = %d, proceeding\n", x, x + 1);

    return 0;
}
```

Build it twice, once without optimization and once with, and run both on the same input — `INT_MAX`, 2147483647:

```sh
cc -std=c11 -Wall -Wextra -O0 guard.c -o guard_O0
cc -std=c11 -Wall -Wextra -O2 guard.c -o guard_O2
./guard_O0 2147483647
./guard_O0 41
./guard_O2 2147483647
./guard_O2 41
```

Observed output (this machine, Apple clang 21, arm64):

```text
guard fired: 2147483647 + 1 overflowed, refusing
guard silent: 41 + 1 = 42, proceeding
guard silent: 2147483647 + 1 = -2147483648, proceeding
guard silent: 41 + 1 = 42, proceeding
```

Read those four lines again. At `-O0` your guard works: it catches the overflow and refuses. At `-O2` the *identical source* prints something absurd — the guard stays silent while the program announces, in the same breath, that 2147483647 + 1 is −2147483648. The check you wrote is simply gone from the optimized program. No warning was issued at either level; both builds compiled clean under `-Wall -Wextra`.

What just happened: signed integer overflow is *undefined behaviour*, and the compiler is entitled to assume it never happens. Under that assumption, `x + 1 < x` is always false — for any `x` where the program has defined behaviour, `x + 1` is greater than `x`. So the optimizer replaced your condition with `false` and deleted the guard. The `-O0` build, which executes your code more or less as written, performed the machine addition, watched it wrap, and fired. Neither build is buggy. Your mental model was: you believed `x + 1 < x` was a runtime test of what the machine did. It is actually a statement the optimizer is licensed to reason about — and reason away.

The program didn't change. A rule you didn't know was load-bearing just fired. That rule, and the method for finding where else it is firing, is this module.

## The UB catalogue that matters

The C standard defines the language by contract: if your program stays within the rules, the compiler guarantees its meaning. Outside the rules, the standard guarantees nothing — not a crash, not a wrap, not garbage, nothing. The program is *undefined*, and every downstream tool may do whatever is convenient. You have been stepping over these lines since I.2. Here is the short list that matters, each tied back to where you first met it:

| Undefined behaviour | Where you met it | The one-line rule |
|---|---|---|
| Signed integer overflow | I.2 — flagged there, owned here | `INT_MAX + 1` has no defined result; unsigned wraps, signed is UB |
| Out-of-bounds access | I.5 — arrays, strings, the overflow | Indexing or dereferencing outside an object's extent is UB, even for reads |
| Use-after-free, double-free | I.4 — the cold open you did by hand | After `free`, the pointer's target no longer exists; any use is UB |
| Uninitialized reads | I.3 — automatic storage | An `int r;` with no initializer holds an *indeterminate* value; reading it is UB |
| Strict-aliasing violations | I.6 — unions and type punning | Accessing an object through a pointer of an incompatible type is UB (with narrow exceptions, notably `char *`) |
| Invalid pointer arithmetic | I.3 — typed arithmetic | You may form pointers within an array and one past its end; anything further is UB, even if you never dereference it |

Most of these you have already watched fail in earlier labs. Strict aliasing is the one that hasn't had a demonstration yet, and it is the most counterintuitive: the compiler assumes two pointers of incompatible types never name the same storage, and optimizes accordingly. Watch — `alias.c`:

```c
#include <stdio.h>

static int write_through_both(int *i, float *f)
{
    *i = 1;
    *f = 2.0f;          /* if i and f name the same storage, what is *i now? */
    return *i;
}

int main(void)
{
    int x = 0;
    int r = write_through_both(&x, (float *)&x);  /* deliberate aliasing violation */
    printf("returned %d, x holds %d\n", r, x);
    return 0;
}
```

```sh
cc -std=c11 -Wall -Wextra -O0 alias.c -o alias_O0
cc -std=c11 -Wall -Wextra -O2 alias.c -o alias_O2
./alias_O0
./alias_O2
```

Observed output:

```text
returned 1073741824, x holds 1073741824
returned 1, x holds 1073741824
```

The `-O0` build reads back what the machine actually did: `*f = 2.0f` stored the bit pattern of the float 2.0 — 1073741824 read as an `int` — over `x`, and `return *i` saw it. The `-O2` build reasoned: `i` is an `int *` and `f` is a `float *`; incompatible types cannot alias, so the store through `f` cannot affect `*i`; therefore `return *i` is `return 1`. Both answers are "correct," because your program left the defined-language map and each build picked its own way home.

Notice what the catalogue is *not*. It is not a list of runtime errors the machine detects. Every entry is a place where the machine will happily do *something* — usually the locally plausible thing at `-O0` — while the language promises nothing. That gap between "the machine did something" and "the language promised nothing" is where this whole module lives.

## What the optimizer may assume

Here is the mental shift the cold open demands. Undefined behaviour is not an error the compiler reports. It is a **promise you make** — "this situation never arises in my program" — that the compiler exploits.

The exploitation is logical, not malicious. An optimizer is a theorem-prover working over your code, and its axioms are the rules of the defined language. Given the axiom *signed overflow never happens*, the theorem *`x + 1 < x` is always false* follows in one step, and the guarded branch is dead code. Given *`int *` and `float *` never alias*, the store through `f` cannot change `*i`. Given *every array index is in bounds*, a bounds check you wrote "just in case" is provably redundant. Each deleted check, hoisted load, or reordered store is a small, locally valid inference from promises you didn't know you were making. Chained together across an optimizing build, they produce a program that can diverge from the `-O0` build anywhere your code relies on behaviour the standard never guaranteed.

This is why `-O0` and `-O2` *legitimately* diverge. They are not two implementations of your program; they are two implementations of two different programs — the defined one you meant to write, and the undefined one you actually wrote, which the standard declines to constrain. When someone tells you "it works at `-O0` but breaks at `-O2`," translate it instantly: *this program contains UB, and the optimizer found it before we did.* That sentence is a diagnosis, not a compiler bug report.

Three practical corollaries, all of which the lab makes you feel:

1. **"It worked in testing" proves nothing.** An undefined program's behaviour is a property of the exact compiler version, flags, and surrounding code. Any change — an upgrade, a new flag, an unrelated edit that shifts inlining — can produce a new, still-"legal" behaviour.
2. **A warning-free compile proves nothing.** Both demos in this module compile clean under `-Wall -Wextra`. The compiler is not required to diagnose UB, and usually cannot.
3. **The sanitizer build is the ground truth you can actually run.** ASan and UBSan exist precisely to convert silent promises into loud, located failures. From here through Book III, "clean under ASan/UBSan" is the standing definition of "my program stays on the defined-language map" — I.7 made it a gate requirement; this module makes it a habit.

## Reading unfamiliar C

Everything so far has been code you wrote. The L3 skill — the one the gate statement names — is doing all of this to code you didn't write. Real audit targets are foreign: a vendor library, OpenPLC's runtime, a parser inside a firmware image's source drop. You cannot read a few hundred lines the way you read your own code, top to bottom, line by line; you will drown. You need a method. This one has four moves, in order, and it produces a written artifact — the *code map* — as it goes.

**1. Find the entry points.** Start from the outside. Where does execution enter (`main`, a library's public functions, a callback registration), and where does data enter (files, sockets, `argv`, `stdin`)? List them. In a parser, the entry point is almost always a small driver that reads input and calls one top-level function; everything else is reachable from there. You are not reading yet — you are drawing the border of the program.

**2. Map the data structures.** Before you read control flow, read the type declarations and the `#define` tunables. The structs *are* the program's design: a `token` with a kind and text, a `record` with fields, a `config` holding records. If you can state what each struct represents and what its size limits are, you understand most of what the code can and cannot do. Fixed capacities (`#define MAX … 32`) deserve special attention — every fixed bound is a place the code must either check or trust.

**3. Trace one transaction end to end.** Pick the smallest meaningful unit of work — one line of input, one request, one record — and follow it from the entry point to the final output, through every function it touches. For a parser: input bytes → lexer → tokens → parser → AST → printed result. Write the trace down, naming the functions on the path. One transaction, fully traced, teaches you the architecture; the other hundred transactions are variations on it.

**4. Note ownership at every boundary.** Everywhere data crosses a function boundary, ask the I.4 questions: who allocated this, who frees it, who is allowed to mutate it, how long does the pointer stay valid? Write one ownership note per boundary: "`read_file` returns a heap buffer the caller owns"; "tokens borrow pointers into the source buffer — the source must outlive them" (or doesn't, if the lexer copies); "the AST is static storage, never freed." Most real defects live exactly at these boundaries — the places where two functions disagree about a lifetime, a bound, or a terminator.

That is the method: entry points, data structures, one transaction, ownership at every boundary. Run it on a small file first to calibrate. Here is the shape of the resulting map, applied to the lab program from this module (you will produce a much larger one for the capstone):

```text
code map: lab_ub.c
entry:    main → bump / parity / load_and_sum (all data is compile-time constants)
data:     no structs; one fixed array per function (tmp[8], data[8])
trace:    main → load_and_sum(data, 8): copies data[i] into tmp[i] for i in 0..n,
          sums tmp[0..n-1] → returns total → printed
ownership: no heap; data[] is main's stack storage, lent to load_and_sum
           as const; tmp[] is load_and_sum's private storage
risks:    fixed bound 8 vs parameter n — who checks that n <= 7 fits?
```

Five lines of map, and the "risks" line already points at the defect the lab will confirm by tool. That is the ratio to internalize: a page of structured reading buys you the same finding a sanitizer run does, and the two cross-check each other. Reading tells you where to point the tools; the tools confirm or correct the reading.

## Instrumenting code you didn't write

The reading method finds defects by eye. To confirm them — and to find the ones your eye missed — you instrument. Instrumenting foreign code has two tiers, and the first requires no source changes at all.

**Tier 1: the sanitizer build.** Rebuild the target with `-fsanitize=address,undefined` and run its normal inputs. You changed nothing in the source; the instrumentation is in the build flags. This is the single highest-value move in an audit, it costs minutes, and it is why I.7 made you assemble the toolchain before this module. I.7's rule stands here unchanged, and this module owns its explanation: the default sanitizer build is `-O0 -g` — the optimizer leaves the code alone, so the instrumented program is the program you read, and the sanitizers see everything there is to see. The lab below shows why this is not pedantry: at `-O1` and above, the compiler promotes small arrays into registers and deletes dead stores outright, and a sanitizer run can report "clean" over code that is anything but. But `-O0` is the default, not the whole audit. The second pass is the same sanitizers at `-O2`, and it is mandatory, not optional. The optimizer changes what the sanitizers can observe, and `-O2` is where the optimizer-exploited UB this module keeps demonstrating actually lives — the deleted guards, the committed values, the aliasing assumptions. It is also the build you ship, and the build the capstone scores: the finished artifact must run clean under ASan/UBSan at `-O2`. A clean `-O0` run says the tools saw nothing; a clean `-O2` run says the optimizer found nothing to exploit. You need both sentences before you call a codebase clean.

**Tier 2: targeted probes.** When a sanitizer report (or your reading) locates a suspicious region, drop in temporary instrumentation at the choke point — and *only* there. Three probe forms, in ascending order of commitment:

- **Trace probes.** A `fprintf(stderr, …)` at a choke point that every transaction passes through. In a parser, the one function every token flows through is the parser's token-consumption routine; patching one line there traces the entire parse. Here is that probe applied to the capstone codebase (you will recognize the function when you read it), compiled and run on a one-record input:

```c
    const struct token *tok = &p->toks[p->pos];
    /* PROBE: trace every token the parser consumes. */
    fprintf(stderr, "[trace] line %d: consume %s \"%s\"\n",
            tok->line, token_kind_name(tok->kind), tok->text);
    if (tok->kind != TOK_END)
        p->pos++;
    return tok;
```

```text
[trace] line 1: consume record "record"
[trace] line 1: consume identifier "flowmeter_a"
[trace] line 1: consume '{' ""
[trace] line 1: consume newline ""
[trace] line 2: consume identifier "unit"
[trace] line 2: consume '=' ""
[trace] line 2: consume identifier "litres_per_min"
[trace] line 2: consume newline ""
[trace] line 3: consume '}' ""
[trace] line 3: consume newline ""
```

One patched line, and the parser's entire decision sequence is visible — you can watch it expect `{`, consume a name, take assignments, and close the record. Two habits make probes safe in foreign code: print to `stderr` (unbuffered by default, so the output survives a crash or abort, and never contaminates the program's real stdout), and mark every probe with a searchable comment (`/* PROBE */`) so you can strip them all before shipping.

- **Assertions as documented invariants.** When your reading concludes "the author clearly believes X is always true here," write it down as `assert(X);` at that spot. The assert does double duty: it documents the invariant you inferred, and it converts a violation into an immediate, located abort — at any optimization level, in any build with assertions enabled. If the assert fires, your reading found a defect; if it never fires under adversarial inputs, you have evidence the invariant is load-bearing and real.

- **Counting probes.** A counter incremented on every allocation and decremented on every free, printed at exit, is the I.4 leak check you did by hand — it works unchanged in code you didn't write, and it answers the ownership questions of the reading method with numbers.

Two honesty notes about this machine, stated once and then assumed for the rest of the book. First, the sanitizer situation on macOS: clang here supports `-fsanitize=address` and `-fsanitize=undefined` (you have been using them since I.7), but `-fsanitize=memory` — the detector designed for uninitialized reads — is not supported for this target; the compiler says so itself (`clang: error: unsupported option '-fsanitize=memory' for target 'arm64-apple-darwin…'`). For that class you rely on the compiler's `-Wuninitialized` warnings and on `-O0`/`-O2` divergence, or on a Linux box where MSan runs. Second, valgrind is absent on macOS (I.7 said this and it still holds): its role — instruction-level memory checking without a rebuild — is filled here by ASan, and its report format is worth recognizing when you meet it in Linux-based write-ups, but the hands-on runs in this book are ASan runs.

## The Seam

Step back and look at the catalogue as an adversary does. Every entry is not just a bug — it is a *primitive*:

- an out-of-bounds write is memory corruption with attacker-chosen content (I.5's seam, the dominant CVE class in ICS advisories);
- a use-after-free is a dangling pointer an attacker can arrange to point at attacker-shaped data (I.4's seam);
- a signed overflow is a bounds computation that wraps to a small allocation followed by a large copy (I.2's seam);
- an uninitialized read is an information leak — stack garbage is yesterday's secrets;
- an aliasing or pointer-arithmetic violation is a confusion the optimizer may turn into something none of the source lines say.

And the connective tissue of all of it is this module's lesson: **"it worked in testing" is the sound of a latent one.** UB that behaved conveniently at `-O0` in the lab ships as UB that behaves conveniently at `-O2` in the field — until a compiler upgrade, a new flag, or an attacker who has read the same standard arranges otherwise. This is where the seams get their names. You met each bug class as an accident in its home module; you have now seen the mechanism — the optimizer's promise — that makes them a single family. Book III.2 systematizes exactly this: the vulnerability-taxonomy module maps each class back to its Book I seam and reads it as an attacker, and Book III.3 turns one of them into control of a program, in a sandbox. You are not done with any of these defects. You have only learned to see them.

## Lab

A guided exercise with three planted defects, run three ways: plain at both optimization levels, then under each sanitizer. The program — `lab_ub.c`:

```c
#include <stdio.h>
#include <limits.h>

/* We print to stderr so the output survives a mid-program abort. */

/* Defect 1: a signed-overflow guard the optimizer is entitled to delete. */
static int bump(int x)
{
    if (x + 1 < x)
        return -1;              /* "overflow" */
    return x + 1;
}

/* Defect 2: an uninitialized read — r is only set on one path. */
static int parity(int v)
{
    int r;
    if (v > 0)
        r = v % 2;
    return r;                   /* what is r when v <= 0? */
}

/* Defect 3: an off-by-one that walks one past the end of an 8-slot array. */
static int load_and_sum(const int *src, int n)
{
    int tmp[8];
    int total = 0;

    for (int i = 0; i <= n; i++)    /* <= copies one element too many */
        tmp[i] = src[i];
    for (int i = 0; i < n; i++)
        total += tmp[i];
    return total;
}

int main(void)
{
    int data[8] = { 10, 20, 30, 40, 50, 60, 70, 80 };

    fprintf(stderr, "bump(INT_MAX) = %d\n", bump(INT_MAX));
    fprintf(stderr, "bump(7)       = %d\n", bump(7));
    fprintf(stderr, "parity(9)     = %d\n", parity(9));
    fprintf(stderr, "parity(-3)    = %d\n", parity(-3));
    fprintf(stderr, "sum           = %d\n", load_and_sum(data, 8));
    return 0;
}
```

**Step 1 — compile at both levels and read the diagnostics.**

```sh
cc -std=c11 -Wall -Wextra -O0 lab_ub.c -o lab_O0
cc -std=c11 -Wall -Wextra -O2 lab_ub.c -o lab_O2
```

Both builds emit one warning — the compiler *can* see defect 2, and this is what its diagnostic looks like:

```text
lab_ub.c:18:9: warning: variable 'r' is used uninitialized whenever 'if' condition is false [-Wsometimes-uninitialized]
    if (v > 0)
        ^~~~~
lab_ub.c:20:12: note: uninitialized use occurs here
    return r;                   /* what is r when v <= 0? */
```

Note what the compiler does *not* warn about: the other two defects compile silent. One out of three is the best a warning flag will ever do for you.

**Step 2 — run both builds and record the divergence.**

```sh
./lab_O0
./lab_O2
```

Observed output, `-O0`:

```text
bump(INT_MAX) = -1
bump(7)       = 8
parity(9)     = 1
parity(-3)    = 8521108
Abort trap: 6
```

Observed output, `-O2`:

```text
bump(INT_MAX) = -2147483648
bump(7)       = 8
parity(9)     = 1
parity(-3)    = 1
sum           = 360
```

Fill in the divergence table before reading further:

| line | `-O0` | `-O2` |
|---|---|---|
| `bump(INT_MAX)` | `-1` — guard fired | `-2147483648` — guard deleted, wrap visible |
| `parity(-3)` | stack garbage (8521108 this run; it changes every run — 36078996, 50103700, 78120340 on the next three) | `1` — the optimizer picked a value |
| `sum` | never printed — the process aborts | `360`, printed, exit 0 |

Three surprises worth naming. First, the `-O0` garbage is not even stable — an uninitialized read hands you whatever the stack happened to hold, and that changes run to run. Second, the `-O0` build *aborts* before printing `sum`: Apple clang enables the stack protector by default, and its canary check at the end of `load_and_sum` caught the off-by-one write on the way out. Rebuild with `-fno-stack-protector` and the same source runs to completion at `-O0` — printing `sum = 0`, a wrong answer produced silently. Third, the `-O2` build prints the "right" sum of 360 and exits 0 — the off-by-one still executes, but the layout it corrupts happens to be harmless *on this machine, at these flags*. Right output from wrong code is the most dangerous result in this whole lab.

**Step 3 — UBSan.**

```sh
cc -std=c11 -Wall -Wextra -O1 -g -fsanitize=undefined lab_ub.c -o lab_ubsan
./lab_ubsan
```

Observed output:

```text
lab_ub.c:9:11: runtime error: signed integer overflow: 2147483647 + 1 cannot be represented in type 'int'
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior lab_ub.c:9:11
bump(INT_MAX) = -1
bump(7)       = 8
parity(9)     = 1
parity(-3)    = 1
lab_ub.c:30:9: runtime error: index 8 out of bounds for type 'int[8]'
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior lab_ub.c:30:9
sum           = 360
Abort trap: 6
```

UBSan names defect 1 (line 9: the overflow itself, whether or not the guard survives) and defect 3 (line 30: index 8 into an 8-element array), each with file, line, and a precise description. It recovers and continues after each report — add `-fno-sanitize-recover=all` to stop at the first — and the trailing `Abort trap: 6` is the stack protector again, firing at the function return UBSan let it reach. Note what UBSan did *not* flag: `parity(-3)`. Reading an uninitialized automatic variable is outside UBSan's checks on this build — that is MSan's job, and MSan is unavailable on this machine. Know your tools' blind spots; the compiler warning in step 1 was the only alarm this defect tripped.

**Step 4 — ASan.** Built at `-O0` deliberately: at `-O1` and above the compiler promotes the tiny `tmp` array into registers, the out-of-bounds access never touches memory, and ASan has nothing to see — the same build runs "clean" with `sum = 360`. Optimization level changes what the sanitizers can observe, not just what the optimizer does. When a sanitizer build reports nothing, the finding is "no memory error *as compiled*," not "no defect."

```sh
cc -std=c11 -Wall -Wextra -O0 -g -fsanitize=address lab_ub.c -o lab_asan
ASAN_OPTIONS=symbolize=0 ./lab_asan
```

Observed output (abridged to the lines that matter):

```text
bump(INT_MAX) = -1
bump(7)       = 8
parity(9)     = 1
parity(-3)    = 1
=================================================================
==35020==ERROR: AddressSanitizer: stack-buffer-overflow on address 0x00016f992760 ...
READ of size 4 at 0x00016f992760 thread T0
    #0 0x00010046cde0  (.../lab_asan:arm64+0x100000de0)
    #1 0x00010046cae8  (.../lab_asan:arm64+0x100000ae8)

Address 0x00016f992760 is located in stack of thread T0 at offset 64 in frame
    #0 0x00010046c7ec  (.../lab_asan:arm64+0x1000007ec)

  This frame has 1 object(s):
    [32, 64) 'data' (line 38) <== Memory access at offset 64 overflows this variable
```

Read an ASan report top to bottom, the way you will read hundreds of them by the end of Book III: **what** happened (`stack-buffer-overflow`, a `READ of size 4`), **where** in the program (the stack frames — shown unsymbolized here because `ASAN_OPTIONS=symbolize=0` was set; on this machine the default symbolizer can stall, and the report's object annotation below still names the variable and line), and **which object** was overflowed — the report tells you directly: `data`, the 8-element array at line 38, occupies bytes [32, 64) of its frame, and the access at offset 64 is the first byte past it. That is `src[i]` with `i == 8`: the off-by-one's *read* side, caught before the write side even executes. ASan found the same defect UBSan did, from the memory side rather than the language side. Two independent tools, one root cause.

**Step 5 — write one line per defect.** Three columns: what the code assumed, what the standard says, what the optimizer (or machine) did with the difference. Model answers:

1. **`bump`** — assumed signed overflow wraps and can be detected after the fact; the standard says signed overflow is undefined (C11 §6.5 ¶5: if the result is not representable, the behaviour is undefined); at `-O2` the optimizer assumed it away and deleted the guard, while the `-O0` build performed the wrapping addition and fired it.
2. **`parity`** — assumed `r` holds a meaningful value on every path; the standard says an uninitialized automatic object has indeterminate value and reading it is undefined; the compiler warned, `-O0` returned rotating stack garbage, `-O2` committed to `1`.
3. **`load_and_sum`** — assumed indices `0..n` fit in an 8-element array with `n == 8`; the standard says indexing one past the last element is outside the object and undefined; at `-O0` the stack protector aborted the process, at `-O2` the same smash produced a plausible-looking 360 in silence, and ASan named the variable and the line.

State the rule, one sentence, before you close this lab: **undefined behaviour is not "the machine might do anything" — it is "the compiler may assume this never happens," and every divergence between your `-O0` and `-O2` runs marks a place where you relied on behaviour the standard never promised.**

## Build Task

CAPSTONE — **the I.8 parser**. Everything in this book converges here: you are given a small, real C program you did not write — a line-oriented config/record parser with a lexer and a recursive-descent core, a few hundred lines — and you will read it, instrument it, find the defect planted in it, and extend its grammar. This is the L3 gate statement made literal: *given a C file you have never seen, produce an accurate map of it and catch its undefined behaviour, by eye and by tool.*

### The reading codebase

`minicfg.c`, in full. It compiles warning-free under `cc -std=c11 -Wall -Wextra`, runs correctly on well-formed input, and contains exactly one planted defect of a class you have met in this book. The defect is not marked. Find it the way you would in any audit: read, then instrument.

```c
/*
 * minicfg.c — a tiny line-oriented configuration parser.
 *
 * Grammar (one statement per line; '#' starts a comment that runs to
 * end of line):
 *
 *     config     := record*
 *     record     := "record" NAME "{" assignment* "}"
 *     assignment := NAME "=" value
 *     value      := NAME | NUMBER | STRING
 *
 * Example:
 *
 *     # sensor calibration block
 *     record flowmeter_a {
 *         unit = litres_per_min
 *         range_low = 0
 *         range_high = 400
 *         label = "north loop flow"
 *     }
 *
 * Build:  cc -std=c11 -Wall -Wextra minicfg.c -o minicfg
 * Run:    ./minicfg example.cfg [record-name]
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* ---------- tunables ---------- */

#define TOK_TEXT_MAX    32    /* max spelling bytes kept per token */
#define LEX_MAX_TOKENS 512
#define CFG_MAX_RECORDS 16
#define REC_MAX_FIELDS  32
#define NAME_MAX        32
#define VALUE_MAX       64

/* ---------- tokens ---------- */

enum token_kind {
    TOK_RECORD,                 /* the keyword "record"            */
    TOK_IDENT,                  /* bare word: [A-Za-z_][A-Za-z0-9_]* */
    TOK_NUMBER,                 /* integer literal                 */
    TOK_STRING,                 /* "quoted text", quotes stripped  */
    TOK_EQUALS,
    TOK_LBRACE,
    TOK_RBRACE,
    TOK_NEWLINE,
    TOK_END,
    TOK_ERROR
};

struct token {
    enum token_kind kind;
    int line;
    char text[TOK_TEXT_MAX];
};

static const char *token_kind_name(enum token_kind k)
{
    switch (k) {
    case TOK_RECORD:  return "record";
    case TOK_IDENT:   return "identifier";
    case TOK_NUMBER:  return "number";
    case TOK_STRING:  return "string";
    case TOK_EQUALS:  return "'='";
    case TOK_LBRACE:  return "'{'";
    case TOK_RBRACE:  return "'}'";
    case TOK_NEWLINE: return "newline";
    case TOK_END:     return "end of input";
    case TOK_ERROR:   return "error";
    }
    return "?";
}

/* ---------- lexer ---------- */

struct lexer {
    const char *cur;            /* read position in the source buffer */
    int line;                   /* 1-based line number of cur          */
};

static int is_word_char(int c)
{
    return isalnum((unsigned char)c) || c == '_';
}

/* Read one word (identifier or keyword) into tok. */
static void lex_word(struct lexer *lx, struct token *tok)
{
    char buf[TOK_TEXT_MAX];     /* staging buffer for this word */
    size_t n = 0;

    while (is_word_char((unsigned char)*lx->cur)) {
        if (n < TOK_TEXT_MAX)   /* keep at most TOK_TEXT_MAX bytes */
            buf[n++] = *lx->cur;
        lx->cur++;
    }
    buf[n] = '\0';

    if (strcmp(buf, "record") == 0)
        tok->kind = TOK_RECORD;
    else
        tok->kind = TOK_IDENT;
    strcpy(tok->text, buf);
}

/* Read one integer literal into tok. */
static void lex_number(struct lexer *lx, struct token *tok)
{
    size_t n = 0;

    while (isdigit((unsigned char)*lx->cur)) {
        if (n < TOK_TEXT_MAX - 1)
            tok->text[n++] = *lx->cur;
        lx->cur++;
    }
    tok->text[n] = '\0';
    tok->kind = TOK_NUMBER;
}

/* Read one "quoted" string into tok, quotes stripped. */
static void lex_string(struct lexer *lx, struct token *tok)
{
    size_t n = 0;

    lx->cur++;                              /* opening quote */
    while (*lx->cur != '\0' && *lx->cur != '"') {
        if (n < TOK_TEXT_MAX - 1)
            tok->text[n++] = *lx->cur;
        lx->cur++;
    }
    tok->text[n] = '\0';
    tok->kind = TOK_STRING;
    if (*lx->cur == '"')
        lx->cur++;                          /* closing quote */
    else
        tok->kind = TOK_ERROR;              /* unterminated string */
}

/*
 * Tokenize src into toks (capacity cap). Returns the token count,
 * always ending with a TOK_END token, or -1 on a lexer error (a
 * diagnostic is printed naming the line).
 */
static int lex_all(const char *src, struct token *toks, int cap)
{
    struct lexer lx = { src, 1 };
    int n = 0;

    for (;;) {
        struct token *tok;
        char c = *lx.cur;

        if (n >= cap - 1) {
            fprintf(stderr, "lexer: too many tokens (max %d)\n", cap);
            return -1;
        }
        tok = &toks[n];
        tok->line = lx.line;
        tok->text[0] = '\0';

        if (c == '\0') {
            tok->kind = TOK_END;
            n++;
            return n;
        } else if (c == ' ' || c == '\t' || c == '\r') {
            lx.cur++;
            continue;
        } else if (c == '#') {
            while (*lx.cur != '\0' && *lx.cur != '\n')
                lx.cur++;
            continue;
        } else if (c == '\n') {
            tok->kind = TOK_NEWLINE;
            lx.cur++;
            lx.line++;
            n++;
        } else if (c == '=') {
            tok->kind = TOK_EQUALS;
            lx.cur++;
            n++;
        } else if (c == '{') {
            tok->kind = TOK_LBRACE;
            lx.cur++;
            n++;
        } else if (c == '}') {
            tok->kind = TOK_RBRACE;
            lx.cur++;
            n++;
        } else if (isalpha((unsigned char)c) || c == '_') {
            lex_word(&lx, tok);
            n++;
        } else if (isdigit((unsigned char)c)) {
            lex_number(&lx, tok);
            n++;
        } else if (c == '"') {
            lex_string(&lx, tok);
            if (tok->kind == TOK_ERROR) {
                fprintf(stderr, "line %d: unterminated string\n", lx.line);
                return -1;
            }
            n++;
        } else {
            fprintf(stderr, "line %d: unexpected character '%c'\n",
                    lx.line, c);
            return -1;
        }
    }
}

/* ---------- abstract syntax tree ---------- */

struct field {
    char key[NAME_MAX];
    char value[VALUE_MAX];
};

struct record {
    char name[NAME_MAX];
    struct field fields[REC_MAX_FIELDS];
    int nfields;
};

struct config {
    struct record records[CFG_MAX_RECORDS];
    int nrecords;
};

/* ---------- parser (recursive descent) ---------- */

struct parser {
    const struct token *toks;
    int ntokens;
    int pos;                    /* index of the next unconsumed token */
    int error;                  /* sticky error flag */
};

static const struct token *peek(struct parser *p)
{
    return &p->toks[p->pos];
}

static const struct token *advance(struct parser *p)
{
    const struct token *tok = &p->toks[p->pos];
    if (tok->kind != TOK_END)
        p->pos++;
    return tok;
}

static void skip_newlines(struct parser *p)
{
    while (peek(p)->kind == TOK_NEWLINE)
        advance(p);
}

/* Consume one token of the expected kind or record an error. */
static const struct token *expect(struct parser *p, enum token_kind want)
{
    const struct token *tok = peek(p);
    if (tok->kind != want) {
        fprintf(stderr, "line %d: expected %s, got %s",
                tok->line, token_kind_name(want),
                token_kind_name(tok->kind));
        if (tok->text[0] != '\0')
            fprintf(stderr, " (\"%s\")", tok->text);
        fprintf(stderr, "\n");
        p->error = 1;
        return NULL;
    }
    return advance(p);
}

/* assignment := NAME "=" value */
static void parse_assignment(struct parser *p, struct field *fld)
{
    const struct token *key = expect(p, TOK_IDENT);
    const struct token *val;

    if (key == NULL)
        return;
    snprintf(fld->key, sizeof fld->key, "%s", key->text);

    if (expect(p, TOK_EQUALS) == NULL)
        return;

    val = peek(p);
    if (val->kind != TOK_IDENT && val->kind != TOK_NUMBER &&
        val->kind != TOK_STRING) {
        fprintf(stderr, "line %d: expected a value, got %s\n",
                val->line, token_kind_name(val->kind));
        p->error = 1;
        return;
    }
    advance(p);
    snprintf(fld->value, sizeof fld->value, "%s", val->text);

    expect(p, TOK_NEWLINE);
}

/* record := "record" NAME "{" assignment* "}" */
static void parse_record(struct parser *p, struct record *rec)
{
    const struct token *name;

    expect(p, TOK_RECORD);
    name = expect(p, TOK_IDENT);
    if (name == NULL)
        return;
    snprintf(rec->name, sizeof rec->name, "%s", name->text);

    if (expect(p, TOK_LBRACE) == NULL)
        return;
    expect(p, TOK_NEWLINE);

    rec->nfields = 0;
    for (;;) {
        skip_newlines(p);
        if (p->error)
            return;
        if (peek(p)->kind == TOK_RBRACE) {
            advance(p);
            expect(p, TOK_NEWLINE);
            return;
        }
        if (peek(p)->kind == TOK_END) {
            fprintf(stderr, "line %d: unterminated record \"%s\"\n",
                    peek(p)->line, rec->name);
            p->error = 1;
            return;
        }
        if (rec->nfields >= REC_MAX_FIELDS) {
            fprintf(stderr, "line %d: record \"%s\" has too many fields "
                    "(max %d)\n", peek(p)->line, rec->name, REC_MAX_FIELDS);
            p->error = 1;
            return;
        }
        parse_assignment(p, &rec->fields[rec->nfields]);
        if (p->error)
            return;
        rec->nfields++;
    }
}

/* config := record* */
static int parse_config(const struct token *toks, int ntokens,
                        struct config *cfg)
{
    struct parser p = { toks, ntokens, 0, 0 };

    cfg->nrecords = 0;
    for (;;) {
        skip_newlines(&p);
        if (peek(&p)->kind == TOK_END)
            return p.error ? -1 : 0;
        if (cfg->nrecords >= CFG_MAX_RECORDS) {
            fprintf(stderr, "too many records (max %d)\n", CFG_MAX_RECORDS);
            return -1;
        }
        parse_record(&p, &cfg->records[cfg->nrecords]);
        if (p.error)
            return -1;
        cfg->nrecords++;
    }
}

/* ---------- queries ---------- */

static const struct record *config_lookup(const struct config *cfg,
                                          const char *name)
{
    for (int i = 0; i < cfg->nrecords; i++)
        if (strcmp(cfg->records[i].name, name) == 0)
            return &cfg->records[i];
    return NULL;
}

static void print_record(const struct record *rec)
{
    printf("record %s {\n", rec->name);
    for (int i = 0; i < rec->nfields; i++)
        printf("    %s = %s\n", rec->fields[i].key, rec->fields[i].value);
    printf("}\n");
}

static void print_config(const struct config *cfg)
{
    for (int i = 0; i < cfg->nrecords; i++)
        print_record(&cfg->records[i]);
    printf("%d record(s) parsed\n", cfg->nrecords);
}

/* ---------- driver ---------- */

static char *read_file(const char *path)
{
    FILE *fp = fopen(path, "rb");
    long size;
    char *buf;

    if (fp == NULL)
        return NULL;
    if (fseek(fp, 0, SEEK_END) != 0 || (size = ftell(fp)) < 0 ||
        fseek(fp, 0, SEEK_SET) != 0) {
        fclose(fp);
        return NULL;
    }
    buf = malloc((size_t)size + 1);
    if (buf == NULL) {
        fclose(fp);
        return NULL;
    }
    if (fread(buf, 1, (size_t)size, fp) != (size_t)size) {
        free(buf);
        fclose(fp);
        return NULL;
    }
    buf[size] = '\0';
    fclose(fp);
    return buf;
}

int main(int argc, char **argv)
{
    static struct token toks[LEX_MAX_TOKENS];
    static struct config cfg;
    char *src;
    int ntokens;

    if (argc < 2 || argc > 3) {
        fprintf(stderr, "usage: %s file.cfg [record-name]\n", argv[0]);
        return 2;
    }

    src = read_file(argv[1]);
    if (src == NULL) {
        fprintf(stderr, "%s: cannot read %s\n", argv[0], argv[1]);
        return 1;
    }

    ntokens = lex_all(src, toks, LEX_MAX_TOKENS);
    free(src);
    if (ntokens < 0)
        return 1;
    if (parse_config(toks, ntokens, &cfg) != 0)
        return 1;

    if (argc == 3) {
        const struct record *rec = config_lookup(&cfg, argv[2]);
        if (rec == NULL) {
            fprintf(stderr, "%s: no record named \"%s\"\n", argv[0], argv[2]);
            return 1;
        }
        print_record(rec);
    } else {
        print_config(&cfg);
    }
    return 0;
}
```

And a well-formed input to run it on — `example.cfg`:

```text
# North-loop sensor calibration
# Lines are records; fields are key = value pairs.

record flowmeter_a {
    unit = litres_per_min
    range_low = 0
    range_high = 400
    label = "north loop flow"
}

record pressure_b {
    unit = kpa
    range_low = 0
    range_high = 1600
    label = "discharge header"
    alarm_high = 1400
}
```

Baseline behaviour, observed on this machine (`./minicfg example.cfg`):

```text
record flowmeter_a {
    unit = litres_per_min
    range_low = 0
    range_high = 400
    label = north loop flow
}
record pressure_b {
    unit = kpa
    range_low = 0
    range_high = 1600
    label = discharge header
    alarm_high = 1400
}
2 record(s) parsed
```

`./minicfg example.cfg pressure_b` prints just the named record; malformed input gets a located diagnostic (`line 3: expected '=', got number ("0")`). The program works. The defect is nonetheless in there.

### What you deliver

1. **A written code map**, produced with the four-move method: the entry points (execution and data), the token/AST data structures and what each represents, one transaction traced end to end (follow one record from file bytes to printed output, naming every function on the path), and an ownership note at every allocation boundary — `read_file`'s heap buffer, the token array, the config storage, every `strcpy`/`snprintf` destination.
2. **An instrumented build**: the parser compiled with `-fsanitize=address,undefined`, plus whatever probes your reading motivated, with the probe sites listed in your write-up.
3. **The planted defect, found, with reproducible evidence**: the sanitizer report (or probe output) that located it, the exact input that triggers it, the commands that reproduce the report from a clean tree, and your one-line statement of what the code assumed versus what the standard says — the lab's discipline, applied to code you didn't write.
4. **One grammar extension, with tests**: a new production added to the grammar — a new statement form or value form — implemented in the lexer *and* the recursive-descent core, with tests that cover it. Candidates: top-level `key = value` defaults outside any record; a `list = a, b, c` value form; an optional `record name : parent { … }` inheritance clause. Pick one. Your tests must include a well-formed input exercising the new production, a malformed input rejected with a located diagnostic, and the original `example.cfg` passing unchanged.

### Scoring criteria

| Criterion | Pass looks like |
|---|---|
| The code map is accurate | Entry points, the token/AST structures, one transaction traced end to end, and an ownership note at every allocation boundary — spot-checked against the source; no guess survives a re-read |
| The planted defect is found with sanitizer evidence | Your write-up's commands reproduce the report from a clean tree; the trigger input and the faulting line are named |
| The extension lands without breaking existing behaviour | New production works and is tested; the original grammar and `example.cfg` behave identically to the baseline |
| The whole artifact is clean | Original plus extension compiles warning-free under `cc -std=c11 -Wall -Wextra` and runs clean under ASan/UBSan at `-O2` — fixing the defect you found is part of the artifact |

Constraints: fix the defect minimally and say in one sentence why your fix is correct; do not redesign the parser around it. Keep the codebase warning-free — a new warning is a regression.

**Stretch goals.** (1) Restructure the fixed, extended parser into the I.7 shape — `minicfg.h`, `minicfg.c`, a driver, a Makefile — so it could sit in `libcore.a` beside the growable buffer and `read_line`; notice which functions stop being `static` and why. (2) Become your own adversary: write a small script that generates random config files — long names, deep field counts, unterminated strings, stray characters — and run the sanitizer build against a few hundred of them. If you find a *second* defect the planting didn't intend, document it; that is what the job actually looks like.

Hold on to the finished artifact. Book III.4 points a fuzzer at the I.8 parser and watches it crash; what you found by eye and sanitizer here, you will find by coverage-guided brute force there — and the defects your extension accidentally introduced will be found the same way.

## Why This Matters for Your Roadmap

This is the module the book exists for. Reading, instrumenting, and extending an unfamiliar C codebase is not an exercise *resembling* the work — it *is* the work, at miniature scale. The OpenPLC home lab on your roadmap is exactly this skill pointed at a larger target: OpenPLC's runtime is C, and the first useful hour you spend with it is entry points, data structures, one transaction, ownership at the boundaries. The same applies to any industrial library you audit later. When WT1 applications go out in Fall 2027, "I took a few hundred lines of unfamiliar C, mapped it, found a planted memory defect with sanitizer evidence, and extended its grammar without breaking it" is concrete, showable evidence — a repository and a write-up, not a claim on a résumé. This capstone is that evidence. It is also the generator for the "What a PLC actually does" post on Laboratoires Structure: at this altitude, a PLC runtime is a parser and interpreter of someone else's C, and you now own a worked example small enough to explain in public. And the artifact is load-bearing forward: Book III.4's fuzzer aims at the I.8 parser specifically, which makes this capstone the first component of the exam-sprint tier's scoring surface — the code you are graded on in Book III is the code you are reading today.

## Reps

- Rewrite `guard.c` from memory, predict the `-O0` and `-O2` outputs before compiling, then check. If any prediction missed, redo tomorrow.
- Re-run the lab binary pair a day later: fill in the three one-liners (assumption / standard / optimizer) from memory *before* scrolling back to the model answers.
- Take any earlier artifact — the I.4 growable buffer, the I.5 bounded reader — build it at `-O2` with `-fsanitize=address,undefined`, and fix or explain anything that fires.
- Pick one small C file you have never read (any single-file utility, ~100 lines) and produce a five-line code map using the four moves. Time yourself; the capstone is the same method with a bigger budget.
- Predict-then-run: `alias.c` at `-O0` and `-O2`, and state in one sentence which promise the optimizer exploited.

## Deferred

The formal standard and its full UB catalogue — you have the six classes that matter in practice; the standard's complete annex of undefined and unspecified behaviour, sequence points and their C11 successors, and the reading-the-standard skill itself are deferred to the audit work of Book III, where you will need chapter-and-verse citations in adversarial write-ups. Compiler internals beyond the optimization-assumption model taught here — how inlining, value range analysis, and dead-code elimination actually compose — are deferred indefinitely; you have the mental model the rest of the curriculum uses. And the adversarial exploitation of everything catalogued here — turning each class into a primitive, on purpose, under mitigations — is Book III.2 and III.3, by design.
