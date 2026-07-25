# I.5 · Arrays, strings, buffers

> **Level:** L1→L2 · **Prerequisites:** I.1–I.4 (the pipeline, fixed-width values, pointers, the heap)
> **You will be able to:**
> - Explain exactly when an array name becomes a pointer — and when it doesn't, and what `sizeof` and `&` reveal about the difference.
> - Overflow a stack buffer with your own hands, watch the bytes land in a neighbouring variable, and state precisely what the unbounded code trusted.
> - Write a bounded input reader that never overruns, always terminates, and signals truncation — the reader you will ship into `libcore.a` in I.7.

## Cold Open

You are going to break the machine's memory rules on purpose, before anyone explains what the rules are. One buffer, one neighbour, one unbounded copy. Write `overflow.c`:

```c
#include <stdio.h>
#include <string.h>

int main(int argc, char *argv[])
{
    char neighbour[32] = "NEIGHBOUR-INTACT";
    char buf[16];

    setvbuf(stdout, NULL, _IONBF, 0);   /* unbuffered: output survives a crash */

    printf("&buf       = %p\n", (void *)buf);
    printf("&neighbour = %p\n", (void *)neighbour);
    printf("before: neighbour = %s\n", neighbour);

    if (argc < 2) {
        printf("usage: %s <word>\n", argv[0]);
        return 1;
    }

    strcpy(buf, argv[1]);

    printf("after:  buf       = %s\n", buf);
    printf("after:  neighbour = %s\n", neighbour);
    return 0;
}
```

The `setvbuf` line is not part of the lesson — it makes `stdout` unbuffered so you still see the output when the program dies. The address prints are part of the lesson: you want to see who lives next to whom. Compile and run it with a polite input:

```sh
cc -std=c11 -Wall -Wextra -O0 overflow.c -o overflow
./overflow hello
```

```text
&buf       = 0x16bb16810
&neighbour = 0x16bb16820
before: neighbour = NEIGHBOUR-INTACT
after:  buf       = hello
after:  neighbour = NEIGHBOUR-INTACT
```

Compiles clean, behaves itself. Note the addresses on this machine: `buf` sits at `0x...810`, and `neighbour` begins at `0x...820` — exactly 16 bytes higher, which is exactly `sizeof buf`. The compiler laid them out back to back, with `neighbour` immediately *above* `buf` in memory. (Your machine may order them differently — print the addresses and look; the lesson survives either way.)

Now be rude. Feed it 32 `A`s — twice the size of `buf`:

```sh
./overflow AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
```

```text
&buf       = 0x16b42e7f0
&neighbour = 0x16b42e800
before: neighbour = NEIGHBOUR-INTACT
Trace/BPT trap: 5
```

Exit status 133. The program died *inside the copy* — you never even see the `after:` lines. What just happened? You asked `strcpy` to write 33 bytes (32 letters plus a terminator) into a 16-byte array. That act has a name — a **stack buffer overflow** — and on a modern machine the toolchain's first line of defense killed your process before the damage could be observed. Ask the binary who actually did the copying:

```sh
nm overflow | grep strcpy
```

```text
                 U ___strcpy_chk
```

You wrote `strcpy`. The compiler and the macOS SDK quietly substituted `__strcpy_chk`, a fortified variant that knows `buf` is 16 bytes and traps the moment you exceed it. That is a mitigation, and it is good news — but it hides the machine's raw behaviour, and the raw behaviour is the lesson. Turn both of this machine's safeties off and run it again:

```sh
cc -std=c11 -Wall -Wextra -O0 -D_FORTIFY_SOURCE=0 -fno-stack-protector overflow.c -o overflow_raw
./overflow_raw AAAAAAAAAAAAAAAAAAAAAAAA
```

```text
&buf       = 0x16f28a810
&neighbour = 0x16f28a820
before: neighbour = NEIGHBOUR-INTACT
after:  buf       = AAAAAAAAAAAAAAAAAAAAAAAA
after:  neighbour = AAAAAAAA
```

There it is. You wrote 24 `A`s into a 16-byte array. The first 16 filled `buf`; the next 8 kept going, uphill in memory, and landed in `neighbour` — obliterating `NEIGHBOUR-INTACT` and leaving eight `A`s and a terminator in its place. Bytes you wrote landed in memory you didn't name. No error, no warning at run time, no permission asked. The machine simply did what the copy loop said: *write the next byte at the next address, until you see a NUL.*

That is **the I.5 overflow**. Keep this source file. You will meet it twice more: Book II.1 has you write the same program in Rust and watch the compiler refuse to build it, and Book III.2 hands it back to you to read as an attacker. For now, sit with the discomfort: nothing in the language stopped that write. The exposition is about why.

## Arrays vs pointers: decay and its exceptions

I.3 told you a pointer is a value that names a location. An array is something different: a *contiguous block of storage* for N elements of one type. `char buf[16]` is not a pointer. It is sixteen bytes of stack, full stop. But C conspires to make you think otherwise, because of the single most misquoted rule in the language:

**In almost every expression, an array name decays to a pointer to its first element.**

Pass `buf` to a function, assign it to a pointer, do arithmetic on it — you are holding a `char *` whose value is `&buf[0]`. The array itself does not travel; only the address of its front door does. This is why functions that "take an array" really take a pointer and have no idea how long the array is — a fact the rest of this chapter weaponizes.

Almost every expression. The exceptions are where the truth leaks out. Watch:

```c
#include <stdio.h>

static void probe(int *p)
{
    printf("  in probe: sizeof p  = %zu\n", sizeof p);
}

int main(void)
{
    int a[8] = {0};

    printf("sizeof a    = %zu\n", sizeof a);
    probe(a);

    printf("a     = %p\n", (void *)a);
    printf("&a    = %p\n", (void *)&a);
    printf("a+1   = %p\n", (void *)(a + 1));
    printf("&a+1  = %p\n", (void *)(&a + 1));
    return 0;
}
```

```text
sizeof a    = 32
  in probe: sizeof p  = 8
a     = 0x16dd5e850
&a    = 0x16dd5e850
a+1   = 0x16dd5e854
&a+1  = 0x16dd5e870
```

Three facts, all load-bearing:

1. **`sizeof` does not decay.** Inside `main`, `sizeof a` is 32 — eight `int`s, the whole block. Inside `probe`, the array has decayed to a parameter `int *p`, and `sizeof p` is 8 — one pointer on this 64-bit machine. The size information was destroyed at the function boundary. This is why every array-taking function in C also takes a length, or should.
2. **`&` does not decay.** `a` and `&a` print the *same address* — the block starts where it starts — but they have different types, and pointer arithmetic is typed (I.3). `a + 1` advances one `int`: 4 bytes. `&a + 1` advances one *entire array of 8 ints*: 32 bytes, clean past the whole block. Same numeric address, two different units of travel.
3. **The decayed pointer carries no length.** Nothing about `int *` says "eight of them." The length lived in the array type, and the array type died in the call.

(The full list of no-decay contexts is short: `sizeof`, unary `&`, `_Alignof`, and array initialization from a string literal. Everything else decays.)

Hold this model: an array is storage; its name is a rumor of a pointer, true almost everywhere, false exactly where you could have measured the storage. Every bounds bug in this chapter is, at root, someone acting on the rumor after the measurement became impossible.

## C strings and NUL termination

C has no string type. What C has is a *convention*: a string is a `char` array whose content ends at the first byte with value zero — the NUL terminator, `'\0'`. `"hello"` in source is six bytes: `h e l l o \0`. Every library function that "handles strings" — `strlen`, `strcpy`, `printf("%s", ...)` — is a loop that trusts this convention: *read or write forward until you see a zero byte.*

Break the convention and the loop walks off the end of your array into whatever bytes follow, reading (or worse, writing) until it trips over a zero by accident. Watch it happen:

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char good[] = "hello";                   /* six bytes: h e l l o NUL */
    char bad[]  = {'h', 'e', 'l', 'l', 'o'}; /* five bytes, no NUL       */
    char fence[16] = "FENCE";

    printf("sizeof good = %zu, sizeof bad = %zu\n", sizeof good, sizeof bad);
    printf("strlen(good) = %zu\n", strlen(good));
    printf("strlen(bad)  = %zu   <- reads past the array, value meaningless\n",
           strlen(bad));
    printf("bad as string: [%s]   <- prints until it trips over a zero byte\n",
           bad);
    printf("fence after: %s\n", fence);
    return 0;
}
```

```text
sizeof good = 6, sizeof bad = 5
strlen(good) = 5
strlen(bad)  = 13   <- reads past the array, value meaningless
bad as string: [hello"hello]   <- prints until it trips over a zero byte
fence after: FENCE
```

(One unprintable byte between the quote and the second `hello` is omitted from the transcript above — it was stack garbage with no ASCII glyph. Everything else is verbatim.)

`bad` is not a string — it is five characters and a lie. `strlen(bad)` returned 13 on this machine because the eighth byte past the array happened to be zero; run it again after a different program touched your stack and you may get 40, or a crash. `printf` cheerfully printed `hello`, then garbage, then a second stray `hello` found in adjacent memory before a zero byte stopped it. The number 13 and the garbage suffix are meaningless and unstable — what they demonstrate is that *the loop had no other stopping rule*.

Two consequences to internalize now:

- **Every string function is a trust exercise.** `strlen` trusts there is a NUL. `strcpy` trusts there is a NUL in the source *and* enough room in the destination. `printf("%s", p)` trusts there is a NUL reachable from `p`. The compiler checks none of it.
- **Every string bug is a termination bug or a length bug at bottom.** The cold open was a length bug. This section was a termination bug. There is no third kind, and you will meet both again in the vulnerability taxonomy of Book III.2.

## Bounds are your job

Here is the whole section in one sentence: **the language performs no bounds check, anywhere, ever — the check you don't write is the vulnerability you ship.** An array index in C is pointer arithmetic, and pointer arithmetic is unchecked:

```c
#include <stdio.h>

int main(void)
{
    int a[4] = {10, 20, 30, 40};

    for (int i = 0; i < 8; i++)
        printf("a[%d] = %d\n", i, a[i]);
    return 0;
}
```

```text
a[0] = 10
a[1] = 20
a[2] = 30
a[3] = 40
a[4] = -115212032
a[5] = 1
a[6] = -98697065
a[7] = -2096581653
```

No diagnostic, clean exit. `a[4]` through `a[7]` are reads of stack memory that is not yours — interpreted as `int`, printed as fact. Reading past the end leaks whatever the previous occupants left behind (I.8 will show you why that is an information-disclosure primitive, not a curiosity). *Writing* past the end is the cold open.

And the bounds are only half the discipline; recall the chain from I.2's seam: a size computation that wraps (signed/unsigned conversion, integer overflow) becomes an under-allocation, which becomes a *correct-looking* length check guarding a too-small buffer, which becomes the overflow anyway. Bounds discipline therefore has two questions, both yours to answer: *how big is the destination*, and *is the number I am about to compare against it honest*.

The fix pattern is always the same shape: carry the capacity next to the pointer, check before you write, and define what happens when the input doesn't fit (truncate, or refuse) — never "write anyway." The lab makes you apply it to the I.5 overflow; the build task makes you apply it to hostile-length input from `stdin`.

## The unsafe stdlib

The C standard library ships a family of functions that cannot be used safely, because their interfaces make the bounds check impossible or optional. Meet each one properly — you will never call them again, but you will read them in firmware for the rest of your career.

**`gets(char *dst)`** — reads a line from `stdin` into `dst` with *no way to pass a size*. There is no safe call to `gets`, ever, which is why C11 removed it from the standard. This machine's SDK still ships it, and tells you what it thinks: compiling `gets(line);` produces

```text
warning: 'gets' is deprecated: This function is provided for compatibility
reasons only. Due to security concerns inherent in the design of gets(3),
it is highly recommended that you use fgets(3) instead.
```

and at link time, a second opinion from the linker itself:

```text
warning: this program uses gets(), which is unsafe.
```

Fed 48 `A`s into its 16-byte buffer (safeties off), the demo died with `Bus error: 10`. The compiler warned, the linker warned, the program shipped the bug anyway. That is C's social contract in one anecdote: warnings are speech, not enforcement.

**`strcpy(dst, src)`** — copies until the source's NUL, with no destination size. You have already met it; it is the cold open. **`strcat(dst, src)`** — the same loop, appended at the end of an existing string, trusting that the destination has room *remaining*. It doesn't check; watch the tail of the appended string land in the fence variable (safeties off):

```c
    char fence[16] = "FENCE";
    char acc[16] = "acc:";

    strcat(acc, "0123456789ABCDEFGHIJ");   /* 20 more bytes into a 16-byte slot */
```

```text
acc   = acc:0123456789ABCDEFGHIJ
fence = CDEFGHIJ
```

**`sprintf(dst, fmt, ...)`** — formats into `dst` with no size. The format string decides the length; the destination is taken on faith. This machine's clang now argues with you twice — once about the function, once about this specific call — and then the run confirms the diagnosis (safeties off):

```text
warning: 'sprintf' is deprecated: ... use snprintf(3) instead.
warning: 'sprintf' will always overflow; destination buffer has size 16,
         but format string expands to at least 29 [-Wformat-overflow]
Segmentation fault: 11
```

The bounded cousin, `snprintf(dst, n, fmt, ...)`, writes at most `n - 1` characters plus a NUL and *returns* the length it would have written — so a return value `>= n` tells you truncation happened. That is the shape of an honest interface: bound, terminate, report. It is the lab's fix.

**`strncpy(dst, src, n)`** — the trap with a good reputation. It *looks* like the safe `strcpy`, but its contract is subtly different: it copies exactly `n` bytes, padding with NULs if the source is short — and **if the source is `n` bytes or longer, it writes no NUL at all.** Your bounded copy silently produces an unterminated array, and the next `%s` or `strlen` walks off the end. Demonstrated, with the destination poisoned so no stray zero can hide the sin:

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char dst[8];
    int terminated = 0;

    memset(dst, '#', sizeof dst);          /* poison: no zero bytes anywhere */
    strncpy(dst, "way-too-long-source-string", sizeof dst);

    for (size_t i = 0; i < sizeof dst; i++)
        if (dst[i] == '\0')
            terminated = 1;

    printf("dst bytes = [%c%c%c%c%c%c%c%c]\n",
           dst[0], dst[1], dst[2], dst[3], dst[4], dst[5], dst[6], dst[7]);
    printf("NUL inside dst? %s\n", terminated ? "yes" : "NO -- dst is not a string");

    /* the safe pattern: bound, then terminate by hand */
    memset(dst, '#', sizeof dst);
    strncpy(dst, "way-too-long-source-string", sizeof dst - 1);
    dst[sizeof dst - 1] = '\0';
    printf("fixed dst = [%s]\n", dst);
    return 0;
}
```

```text
dst bytes = [way-too-]
NUL inside dst? NO -- dst is not a string
fixed dst = [way-too]
```

If you ever must use `strncpy`: pass `n - 1`, then terminate by hand. But mostly, don't — write the copy loop yourself, as the build task will have you do, where the bound and the termination are both explicit and both yours.

## The Seam

Step back from the mechanics and look at what you built in the cold open, because it is not a toy. A function copies attacker-controlled input (`argv[1]` is attacker-controlled in any program that takes arguments) into a fixed-size stack buffer, unchecked. That is the **classic stack buffer overflow**, and it is the single most consequential bug class in the systems your roadmap is aimed at: buffer overflows are the dominant vulnerability class in ICS devices — pull up any handful of CISA ICS advisories and count the CWE-120 ("classic buffer overflow") and CWE-787 ("out-of-bounds write") entries. PLCs and RTUs parse network traffic, configuration files, and protocol frames with code written in exactly this style, and they run it for decades.

You have also already seen the escalation ladder, by accident, on this machine:

- At 24 bytes of input, with the safeties off, you rewrote a neighbouring variable. That is **data corruption** — a logic bug an attacker can steer.
- At 56 bytes, the *stack canary* — a guard value the compiler plants between your locals and the frame's bookkeeping — was trampled, and the runtime aborted the process (`Abort trap: 6`) before returning. The canary converts a silent overflow into a loud crash. It is a mitigation, not a fix: the write still happened.
- At 80 bytes, safeties off, the smear reached the saved return address in the stack frame, and the program died with `Bus error: 10` trying to return to an address made of `A`s. Read that sentence again. The bytes above your buffer are *where the function returns to*. An attacker who chooses those bytes — instead of `A`s — does not crash the program; they *steer* it. That is the whole exploit primitive, and Book III.2 picks it up from exactly this spot.

None of this is exotic. It is a `strcpy` and an argument string. The distance between the cold open and the average OT advisory is intent and refinement, not kind. And the defenses you tripped over on the way — the fortified `__strcpy_chk` that trapped your first run, the canary that aborted the second — exist *because* this bug class is so common that toolchains now spend real complexity papering over it. Book III.3 is about those mitigations: what each one buys, and what each one costs.

Your defense starts smaller and closer: never write a byte whose landing spot you have not checked. That is the lab.

## Lab

Two parts: map the smear, then close it. Work in a fresh directory; you need the I.5 overflow source from the cold open.

**Step 1 — Build the raw version.** You need the machine to show you the smear, so turn off this machine's two safeties, and say out loud what each flag disables as you type it:

```sh
cc -std=c11 -Wall -Wextra -O0 -D_FORTIFY_SOURCE=0 -fno-stack-protector overflow.c -o overflow_raw
```

`-D_FORTIFY_SOURCE=0` stops the SDK from swapping `strcpy` for the checked `__strcpy_chk`. `-fno-stack-protector` stops the compiler from planting the canary. You are deliberately rebuilding a 1990s machine.

**Step 2 — Map which bytes land where.** Run with inputs of increasing length and record `neighbour` each time. Generate the inputs with `printf 'A%.0s' {1..N}` in your shell, or just type them. On this machine the table is:

| input length | `neighbour` after the copy | what happened |
|---|---|---|
| 15 | `NEIGHBOUR-INTACT` | fits: 15 + NUL = 16 bytes, exactly full |
| 16 | *(empty)* | the **NUL alone** overflowed — it landed in `neighbour[0]`, making it an empty string |
| 17 | `A` | first smeared letter: byte 17 of the copy is `neighbour[0]` |
| 20 | `AAAA` | one letter per byte past 16 |
| 24 | `AAAAAAAA` | |
| 32 | `AAAAAAAAAAAAAAAA` | half the neighbour rewritten |
| 48 | `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` | all 32 bytes of `neighbour` smeared, NUL exactly at its end |
| 80 | *(program dies: `Bus error: 10`)* | smear reached the saved return address |

Draw the stack picture for yourself — a column of addresses, `buf` occupying 16, `neighbour` the next 32, the frame's bookkeeping above — and mark, for input length *n*, that the copy writes bytes 0 through *n* (the NUL is byte *n*). The smear begins at *n* = 16, one byte earlier than your intuition says, because **the terminator overflows first**. Off-by-one is not a small bug; it is the first byte of every big one.

**Step 3 — Rebuild with the canary only** (`-D_FORTIFY_SOURCE=0` alone) and binary-search the length where `Abort trap: 6` appears. On this machine: length 56. That number *is* the canary's position — you just measured your stack frame's layout with a hose of `A`s.

**Step 4 — Fix it.** Replace the unbounded copy with a length-checked one. New file `fixed.c`, same shape as the cold open, one line different:

```c
#include <stdio.h>
#include <string.h>

int main(int argc, char *argv[])
{
    char neighbour[32] = "NEIGHBOUR-INTACT";
    char buf[16];

    setvbuf(stdout, NULL, _IONBF, 0);

    printf("before: neighbour = %s\n", neighbour);

    if (argc < 2) {
        printf("usage: %s <word>\n", argv[0]);
        return 1;
    }

    snprintf(buf, sizeof buf, "%s", argv[1]);   /* the length-checked copy */

    printf("after:  buf       = %s\n", buf);
    printf("after:  neighbour = %s\n", neighbour);
    return 0;
}
```

Compile it *plain* — no special flags, safeties on, exactly as you would ship it:

```sh
cc -std=c11 -Wall -Wextra -O0 fixed.c -o fixed
./fixed AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
```

```text
before: neighbour = NEIGHBOUR-INTACT
after:  buf       = AAAAAAAAAAAAAAA
after:  neighbour = NEIGHBOUR-INTACT
```

The same 32-`A` input is now *truncated* to 15 bytes plus a NUL, and the neighbour never flickers. Note the discipline in that one line: the bound is `sizeof buf`, written at the call site where the array still exists and `sizeof` still means the whole block — this is the decay section paying rent. Note also what `snprintf` returns (the would-be length) and that a serious caller checks it to detect the truncation; the build task makes that non-optional.

**Step 5 — State the rule.** One sentence, precise, no hand-waving:

> The unbounded version trusted that the input would never be longer than the destination — it trusted the *length* of `argv[1]`, a value it never measured, supplied by someone it never met.

## Build Task

**The bounded reader** — a function you will reuse for the rest of the curriculum, starting in I.7 where it is packaged into `libcore.a`. Write `read_line.c` plus a `main` that demonstrates and tests it.

**Interface (exact):**

```c
#include <stddef.h>

/* Reads one line from stdin into caller-provided storage.
 * Contract you must honour and document in the header comment:
 *   - writes at most cap - 1 payload bytes into dst
 *   - always NUL-terminates dst (empty input and EOF included)
 *   - reports truncation so the caller cannot silently accept half a line
 */
int read_line(char *dst, size_t cap);
```

The return type is your design: an `int` status, a byte count, an enum — anything that lets the caller distinguish *full line read* from *line truncated* (and think about what EOF before any bytes should mean). Whatever you choose, document it in the header comment the way I.4 taught you to document ownership.

**Behavioural requirements:**

- Reads characters from `stdin` up to and including the newline (or EOF), storing at most `cap - 1` payload bytes in `dst`.
- Never writes past `dst[cap - 1]`, under any input, including inputs thousands of bytes longer than `cap`.
- Always leaves `dst` a valid, NUL-terminated C string — on empty input, on immediate EOF, on truncation, every path.
- Consumes the rest of an over-long line from `stdin` (so the next call starts at the next line), and signals the truncation distinctly.
- Handles `cap == 0` and `cap == 1` sensibly — decide what "sensibly" means and document it.

**Constraints:**

- Banned anywhere in the source: `gets`, `strcpy`, `strcat`, `sprintf`, and `%s` with `scanf`. The point of the exercise is that you can write the bounded loop yourself, so write it.
- `cc -std=c11 -Wall -Wextra` clean.

**Scoring criteria:**

| Criterion | What earns it |
|---|---|
| Never writes past `dst[cap - 1]` under any input, including inputs far longer than `cap` — demonstrated with a canary test | Your test harness declares a `char canary[...]` sentinel adjacent to a deliberately small `dst`, feeds inputs of escalating length (well past `cap`), and asserts the canary is byte-for-byte intact after every call. Print the canary in the test output so the evidence is visible, the way the cold open printed `neighbour`. |
| Always NUL-terminates, including on empty input and EOF | Tests cover: empty line, EOF as the first byte, a line of exactly `cap - 1`, exactly `cap`, and far beyond `cap` — each followed by a `strlen(dst) < cap` assertion. |
| Signals truncation distinctly | A test feeds an over-long line and demonstrates the caller *branching* on the truncation signal — not merely ignoring the return value. |
| No banned functions | `grep` clean; stated, not assumed. |

**Stretch goals:** (1) Make the return value also tell the caller how many payload bytes the full line *would* have needed, `snprintf`-style, so a caller can size a retry. (2) Strip a trailing `\r\n` pair as well as `\n`, and add a test for it — you will thank yourself the first time you parse a config file written on Windows.

Do not look for the "right" answer online. The whole artifact is fifty lines; the discipline in it is the point. It goes into `libcore.a` in I.7, gets re-implemented with ownership and slices in Book II.3, and its absence is what Book III.2 exploits.

## Why This Matters for Your Roadmap

This is the module where the book's seams stop being abstract. Buffer overflows are the dominant vulnerability class in ICS devices — open any CISA ICS advisory and count the CWE-120 and CWE-787 entries, and know that each one is, mechanically, the thing you did to `neighbour` in the cold open, found in a PLC or RTU that somebody's factory depends on. When you read *Countdown to Zero Day* and *Sandworm*, this is the bug class doing the quiet work underneath the geopolitics; you now own the mechanics, not just the metaphor. For WT1 in Fall 2027, "I can build a stack overflow with my hands and then fix it three ways" is a sentence that lands in an industrial-firmware interview the way "I read about buffer overflows" does not. And the seam is load-bearing forward: Book II.3's safe string routines map directly onto this module's string work — the Rust borrow checker enforcing, at compile time, the bound you just learned to enforce by hand — and Book III.2's vulnerability taxonomy maps every memory-corruption class back to this seam, where you will meet the I.5 overflow again as an adversary. The rep you do here is the one you are graded on, three books from now, from the other side of the fence.

## Reps

- From memory, write the bounded copy loop (no `snprintf`) that the lab used `snprintf` for; then check it compiles and truncates the 32-`A` input. Ten lines, two minutes.
- Predict before running: for `char s[10]`, what are `sizeof s`, `sizeof &s`, `sizeof (s + 0)`? Run and reconcile any miss.
- Re-run the I.5 overflow at input lengths 15, 16, 17 *predicting* `neighbour` each time, including the empty-string case at 16. If the NUL-first smear ever surprises you again, rep it again.
- Read `man snprintf` (or `snprintf(3)`) until the return value's truncation semantics are boring to you.
- One code-reading rep: open any C file you have around and find every call to `strcpy`/`strcat`/`sprintf`/`gets`. Each one is a claim that the destination is big enough; decide whether the claim is proven.

## Deferred

**Wide strings, locale, and encodings** — `wchar_t`, `char16_t`/`char32_t`, multibyte encodings, collation, the whole `locale.h` apparatus. Real, and out of scope. Everything in this chapter is bytes, and `char`-sized NUL-terminated strings are what firmware, protocols, and the rest of this curriculum actually run on. When encodings become load-bearing — internationalized text, UTF-8 handling — the bounded-thinking you built here transfers unchanged; only the definition of "one character" gets harder. Flagged, not taught.
