# I.4 · The heap and manual memory

> **Level:** L1 · **Prerequisites:** I.3 (pointers and addresses); I.2 helps
> **You will be able to:**
> - allocate, resize, and release heap memory with `malloc`, `calloc`, `realloc`, and `free`, including the `realloc` failure path
> - state and enforce an ownership contract for every allocation you make — by hand, because nothing else will
> - build **the I.4 growable buffer**, the ancestor of every dynamic array you will ever use

## Cold Open

In I.3 you learned that a local variable dies with its block. That is fine until you need storage whose lifetime you choose: a buffer that grows as input arrives, a structure that outlives the function that built it, a record handed from one subsystem to another. For that, C gives you the heap — a region of memory where you allocate bytes explicitly and release them explicitly. Explicitly is the whole story. The compiler tracks nothing here. Every byte you take, you must give back, exactly once, at exactly the right time. This module is where C stops being merely fussy and starts being dangerous, and it is the module Book II exists to answer.

Before any explanation, do this. Allocate an integer on the heap, store a value, read it back, free it — and then keep using the pointer anyway:

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    int *p = malloc(sizeof *p);
    if (p == NULL) {
        fprintf(stderr, "malloc failed\n");
        return 1;
    }

    *p = 42;
    printf("stored 42 at %p\n", (void *)p);
    printf("read back: %d\n", *p);

    free(p);

    /* p still holds the address. What happens if we use it anyway? */
    printf("after free, reading the same address: %d\n", *p);
    *p = 1337;
    printf("wrote 1337 through the freed pointer; reading: %d\n", *p);

    /* Provoke the allocator into reusing that block. */
    int *q = malloc(sizeof *q);
    *q = 9999;
    printf("q = %p, *q = %d\n", (void *)q, *q);
    printf("reading through p again: %d\n", *p);

    return 0;
}
```

Compile and run it, at both optimization levels:

```sh
cc -std=c11 -Wall -Wextra -O0 coldopen.c -o coldopen_O0 && ./coldopen_O0
cc -std=c11 -Wall -Wextra -O2 coldopen.c -o coldopen_O2 && ./coldopen_O2
```

Observed output on this machine (identical at `-O0` and `-O2` here):

```text
stored 42 at 0x1017fdc20
read back: 42
after free, reading the same address: 4
wrote 1337 through the freed pointer; reading: 1337
q = 0x1017fdc20, *q = 9999
reading through p again: 9999
```

Look at three things. First, after `free(p)`, reading `*p` did not give back 42 — it gave back 4, a value nobody stored there (on this machine the allocator scribbles its own bookkeeping into the block it just reclaimed; on yours the number may differ, and that difference is part of the lesson). Second, the program did not crash: writing 1337 through the freed pointer "worked." Third, the next `malloc` returned *the same address*, and now `p` and `q` are two names for one live allocation — `*q` reads 9999 through both.

What just happened: you produced a **use-after-free** with your own hands. `free` ended the block's life, but `p` still carries its address, and the language lets you follow that address into storage you no longer own. No warning, no error, behaviour that changes run to run and machine to machine. Hold the discomfort. The exposition now names everything you just saw.

## The four allocator calls: `malloc`, `calloc`, `realloc`, `free`

All four live in `<stdlib.h>`. The heap is the third storage class you have met: not static (lives for the whole program, I.1's string literals) and not automatic (dies with its block, I.3's locals), but **dynamic** — it lives from the moment you allocate it until the moment you free it, across scopes, across functions, as long as you say so.

**`malloc(n)`** — reserves `n` bytes and returns a `void *` to them, or `NULL` if the request cannot be satisfied. The bytes are *uninitialized*: whatever was there before is still there. Check for `NULL`. Every time. A failed allocation dereferenced is an instant crash at best.

**`calloc(count, size)`** — allocates `count * size` bytes *and zeroes them*. Use it when zero is a meaningful initial state (counters, tables, "empty"). It costs a little more than `malloc` because the zeroing is work.

**`realloc(p, n)`** — resizes the block `p` points to to `n` bytes. If the block can grow in place, it does. If not, `realloc` allocates a new block, *copies the old contents over*, frees the old block, and returns the new address. That last clause is the trap: **the address can change**, and when it does, the old pointer is dead — every copy of it, everywhere in your program. On failure `realloc` returns `NULL` *and leaves the old block valid and yours*. That failure path is why you never write `p = realloc(p, n)` — on failure you would have overwritten your only handle to the still-living old block, leaking it. The pattern is two-step: `t = realloc(p, n); if (t == NULL) { /* p still valid */ } else { p = t; }`.

**`free(p)`** — ends the block's life. `p` must be a pointer you got from `malloc`/`calloc`/`realloc` and have not already freed. `free(NULL)` is defined as a no-op, which turns out to be a useful safety valve (the lab uses it).

Run this and watch all four:

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    /* malloc: bytes reserved, contents unspecified. */
    int *a = malloc(4 * sizeof *a);
    if (a == NULL) return 1;
    printf("malloc'd ints, uninitialized (on this machine): %d %d %d %d\n",
           a[0], a[1], a[2], a[3]);

    /* calloc: same idea, but the bytes arrive zeroed. */
    int *b = calloc(4, sizeof *b);
    if (b == NULL) return 1;
    printf("calloc'd ints: %d %d %d %d\n", b[0], b[1], b[2], b[3]);

    /* realloc: grow a block in place if possible, else move it. */
    char *s = malloc(16);
    if (s == NULL) return 1;
    printf("before realloc: %p (16 bytes)\n", (void *)s);

    char *t = realloc(s, 1 << 20);   /* ask for a megabyte */
    if (t == NULL) {
        /* s is still valid and still ours to free. */
        free(s);
        return 1;
    }
    printf("after realloc:  %p (1 MiB)\n", (void *)t);
    if (t != s)
        printf("the block MOVED — s is dead now; only t may be used\n");
    else
        printf("the block grew in place\n");

    free(a);
    free(b);
    free(t);
    return 0;
}
```

Observed output:

```text
malloc'd ints, uninitialized (on this machine): 0 0 0 0
calloc'd ints: 0 0 0 0
before realloc: 0x102fd99b0 (16 bytes)
after realloc:  0xa5d010000 (1 MiB)
the block MOVED — s is dead now; only t may be used
```

Two flags. The `malloc` block happened to read as zeroes on this run — that is luck, not a guarantee; uninitialized means *uninitialized*, and another run, another allocator, or a busier heap hands you garbage. Do not learn the wrong lesson from a polite machine. And the `realloc` from 16 bytes to a megabyte visibly moved the block to a completely different region (`0x102fd…` → `0xa5d01…`) — move semantics, demonstrated with real before/after pointers. From that line onward, `s` is a dangling pointer; only `t` may be used or freed.

## Lifetime and ownership by hand

A heap block's lifetime has nothing to do with any variable's scope. The block lives from allocation to `free`, and pointers to it are just values — copies of an address that can outlive the thing they point at. This decoupling is the power and the hazard in one move:

```text
malloc ──► [ block: ALIVE ] ──► free ──► [ block: DEAD, address recyclable ]
                ▲                              ▲
      p, q, r may all point here        p still holds this address;
      (many pointers, one block)        following it is use-after-free
```

Because nothing tracks this for you, C programmers survive by a discipline the language never states: **ownership**. Every allocation has exactly one *owner* — the variable, structure, or subsystem responsible for freeing it. The rules you will enforce by hand for the rest of this book:

1. **Every allocation has exactly one owner, known at the moment of allocation.**
2. **The owner frees the block exactly once, on every path through the code** — success paths, error paths, early returns.
3. **Ownership can be transferred** (a function returns a heap pointer; a struct takes over a buffer), but the transfer must be deliberate and documented, so there is never a moment with two owners or zero.
4. **Non-owners may hold pointers, but only as borrowers** — they may read and write through them, never free them, and only while the owner guarantees the block lives.
5. **After a free or a moving `realloc`, every stale pointer is dead** — set the owner's copy to `NULL` (cheap, and `free(NULL)` is safe) and treat all other copies as radioactive.

None of this is enforced. Violate rule 2 on an error path and you leak. Violate rule 3 and two owners each free — a double-free. Violate rule 4 or 5 and you touch dead storage. The compiler will sit silent through all of it; `-Wall -Wextra` said nothing about the cold open, and `-O2` ran it identically to `-O0` here. This is the seam the whole book is built around.

## API ownership conventions

Ownership becomes a social problem the moment a heap pointer crosses a function boundary: who frees it? C answers with *convention*, stated in documentation, and there are exactly two shapes.

**Caller-allocates.** The caller provides storage; the function fills it. Ownership never moves. This is `strcpy(dst, src)`, `snprintf(buf, cap, ...)`, `fgets(buf, cap, stdin)`, and I.5's `read_line(char *dst, size_t cap)`. The function's contract must say how much storage it needs and what it does when there isn't enough.

**Callee-allocates.** The function allocates and returns a heap pointer; ownership *transfers across the return statement* to the caller, who must free it. This is POSIX's `strdup`, `getline`, and every "constructor" function in real C libraries. The documentation must say "caller must free" — if it doesn't, you cannot use the function safely, period.

Here are both conventions side by side, doing the same job:

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Caller-allocates: the caller provides storage of at least cap bytes.
 * Returns the number of bytes that would have been written, or -1 on
 * truncation. The caller keeps ownership; nothing here is freed. */
static int shout_into(char *dst, size_t cap, const char *src)
{
    size_t need = strlen(src);
    size_t n = need < cap - 1 ? need : cap - 1;
    for (size_t i = 0; i < n; i++)
        dst[i] = (char)(src[i] >= 'a' && src[i] <= 'z' ? src[i] - 32 : src[i]);
    dst[n] = '\0';
    return n == need ? (int)need : -1;
}

/* Callee-allocates: returns a heap string the CALLER must free.
 * Ownership transfers across the return statement. */
static char *shout_new(const char *src)
{
    size_t need = strlen(src) + 1;
    char *out = malloc(need);
    if (out == NULL) return NULL;
    for (size_t i = 0; i < need; i++)
        out[i] = (char)(src[i] >= 'a' && src[i] <= 'z' ? src[i] - 32 : src[i]);
    return out;
}

int main(void)
{
    char buf[8];
    int r = shout_into(buf, sizeof buf, "hello firmware");
    printf("shout_into: \"%s\" (result %d — negative means truncated)\n", buf, r);

    char *s = shout_new("hello firmware");
    if (s == NULL) return 1;
    printf("shout_new: \"%s\" — I own this now, so:\n", s);
    free(s);   /* the contract made flesh */
    return 0;
}
```

```text
shout_into: "HELLO F" (result -1 — negative means truncated)
shout_new: "HELLO FIRMWARE" — I own this now, so:
```

Notice the comment blocks above the functions. They are not decoration — they *are* the ownership contract, the only place it exists. "Returns a heap string the CALLER must free" is a load-bearing sentence. When you write heap-returning functions, that sentence is part of the deliverable; the build task below scores it.

## The Seam

This module's seam is a trilogy, and you have already committed every part of it:

**Use-after-free.** The cold open: storage freed, pointer followed anyway. It often "works" in testing — the bytes haven't been recycled yet — which is exactly why it ships. Worse, it is exploitable: an attacker who can get the allocator to reuse the freed block with attacker-controlled contents now controls what your stale pointer reads and writes. You saw the primitive yourself: `q` inherited `p`'s address and `p` silently became an alias for somebody else's data.

**Double-free.** Freeing the same block twice corrupts the allocator's bookkeeping — the same block ends up on the free list twice, so two future `malloc`s can return the same address while both callers believe they own it exclusively. The lab makes your allocator scream about it.

**Leak.** Allocation without a matching free. Not corrupt, just gone: the process's memory climbs until it dies or the device reboots. In a desktop demo it is a shrug; in firmware that runs for fifteen years it is a scheduled outage.

One honest preview of I.7: there exist tools that make all three loud. Recompile the cold open with `-fsanitize=address -g` and the "polite" machine stops being polite — AddressSanitizer aborts at the exact faulting line with the full biography of the block:

```text
==33709==ERROR: AddressSanitizer: heap-use-after-free on address 0x6020000000b0 ...
READ of size 4 at 0x6020000000b0 thread T0
    #0 0x000100d989a4 in main coldopen.c:19
0x6020000000b0 is located 0 bytes inside of 4-byte region [0x6020000000b0,0x6020000000b4)
freed by thread T0 here:
    #0 0x000100d98958 in main coldopen.c:16
previously allocated by thread T0 here:
    #0 0x000100d98814 in main coldopen.c:6
SUMMARY: AddressSanitizer: heap-use-after-free coldopen.c:19 in main
```

Read that report shape once — faulting line, free site, allocation site — and file it away. I.7 makes the sanitizers a standing requirement; from there to the end of Book III, "clean under ASan" is the price of admission. But notice what ASan is: an instrument that *catches you at runtime, some of the time, on the runs you happen to test*. It is a safety net, not a discipline.

The discipline is the explicit seed for Rust, and this module is where it gets planted. Every rule you enforced by hand above — one owner, free exactly once, transfers documented, borrowers can't outlive the owner, stale pointers dead after a move — is a rule Rust's borrow checker enforces *at compile time*. **Book II.2 re-implements the I.4 growable buffer** — the artifact you are about to build — with ownership checked by the compiler, and you will be asked to line up, rule for rule, what you enforced by hand against what the language now enforces for you:

| You enforced by hand (I.4) | The compiler enforces (II.2) |
|---|---|
| exactly one owner per allocation | ownership is part of the type system |
| free exactly once, on every path | drop runs exactly once, automatically |
| transferred ownership is documented | moves are visible in the code, checked |
| borrowers can't outlive the owner | lifetimes rejected at compile time |
| stale pointers dead after realloc | old bindings unusable after a move |

Keep this module's build artifact. You will meet it again.

## Lab

Three small programs, three deliberate sins. Commit each one, watch the consequence with your own eyes, then fix it and state the fix as a one-sentence ownership rule. Work in a scratch directory; compile everything with `cc -std=c11 -Wall -Wextra`.

### Sin 1 — the leak

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>

static long peak_rss_kb(void)
{
    struct rusage ru;
    getrusage(RUSAGE_SELF, &ru);
    return ru.ru_maxrss / 1024;   /* ru_maxrss is bytes on macOS */
}

int main(void)
{
    printf("start: peak RSS %ld KB\n", peak_rss_kb());
    for (int round = 1; round <= 5; round++) {
        for (int i = 0; i < 10; i++) {
            /* 10 MiB per allocation, deliberately never freed */
            char *p = malloc(10 << 20);
            if (p == NULL) { fprintf(stderr, "malloc failed\n"); return 1; }
            memset(p, 1, 10 << 20); /* touch every page, so the memory is real */
            (void)p;                /* leaked: no free, pointer lost */
        }
        printf("after %d MiB: peak RSS %ld KB\n", round * 100, peak_rss_kb());
    }
    return 0;
}
```

1. Compile and run. `peak_rss_kb` reports the process's peak resident memory — actual RAM consumed.
2. Observed output:

```text
start: peak RSS 1344 KB
after 100 MiB: peak RSS 103936 KB
after 200 MiB: peak RSS 206496 KB
after 300 MiB: peak RSS 309056 KB
after 400 MiB: peak RSS 411616 KB
after 500 MiB: peak RSS 514176 KB
```

Memory climbs almost exactly 100 MB per round — every leaked byte accounted for. (The `memset` matters: without touching the pages, the OS hands out virtual address space lazily and the climb is nearly invisible — a leak you can't observe is still a leak. The first version of this demo without `memset` showed ~2 MB per round. Touch the memory or you're measuring nothing.)
3. Note the exit: the program ends and the OS reclaims all 500 MB instantly. A leak only matters *during* the process's lifetime — which is why a leak in a short-lived demo is invisible and a leak in a long-running daemon or a 20-year PLC is a reliability bug.
4. **Fix:** free each block before losing the pointer (move `free(p)` inside the loop, after `memset`). Rebuild, rerun, watch RSS stay flat.
5. **State the rule:** *every allocation is freed exactly once on every path, before its last handle is lost.*

### Sin 2 — the double-free

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    char *p = malloc(64);
    if (p == NULL) return 1;
    printf("allocated %p\n", (void *)p);
    fflush(stdout);          /* make sure this prints before we die */
    free(p);
    printf("freed once — fine\n");
    fflush(stdout);
    free(p);   /* deliberate sin: the same pointer, freed twice */
    printf("you will not see this line\n");
    return 0;
}
```

1. Compile and run: `cc -std=c11 -Wall -Wextra lab_doublefree.c -o lab_doublefree && ./lab_doublefree`.
2. Observed behaviour on this machine:

```text
allocated 0x103651990
freed once — fine
Trace/BPT trap: 5            ← the process is killed; exit status 133
```

The allocator detected the second `free` of a live-once block and killed the process on the spot — the third `printf` never ran. Honesty about your machine: on this macOS (Apple clang 21, arm64) the abort arrives as `SIGTRAP` with no diagnostic printed to stderr; the detailed message goes to the system log. On glibc/Linux the same sin typically prints `double free or corruption (!prev)` and dies with `SIGABRT`. Different allocators, different last words, same cause of death. (The `fflush` calls exist because a process killed this abruptly never flushes buffered stdio — without them you would not even see the first two lines. A dying program's last output is a debugging tool; remember that.)
3. **Fix:** delete the second `free`. Then adopt the defensive habit: after freeing, set the pointer to `NULL` — `free(NULL)` is a guaranteed no-op, so a repeated free becomes harmless instead of fatal.
4. **State the rule:** *a block's owner frees it exactly once, and afterwards every pointer to it is dead (set yours to NULL).*

### Sin 3 — the `realloc` move

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void)
{
    size_t cap = 8;
    char *p = malloc(cap);
    if (p == NULL) return 1;
    strcpy(p, "abc");
    printf("cap %3zu: %p  \"%s\"\n", cap, (void *)p, p);

    /* Grow in doublings until the block has to move. */
    for (int i = 0; i < 24; i++) {
        size_t newcap = cap * 2;
        char *t = realloc(p, newcap);
        if (t == NULL) { free(p); return 1; }
        p = t;
        cap = newcap;
        printf("cap %3zu: %p  \"%s\"%s\n", cap, (void *)p, p,
               (i == 0 ? "  <- contents preserved across growth" : ""));
    }
    free(p);
    return 0;
}
```

1. Compile and run. Watch the address column.
2. Observed output (first lines and the jumps that matter):

```text
cap   8: 0x1040599d0  "abc"
cap  16: 0x1040599d0  "abc"  <- contents preserved across growth
cap  32: 0x1040599e0  "abc"
cap  64: 0x104059a00  "abc"
cap 128: 0x104059a40  "abc"
...
cap 16384: 0xb17004000  "abc"
cap 32768: 0xb16c04000  "abc"
cap 65536: 0xb16810000  "abc"
...
cap 4194304: 0x650000000  "abc"
```

The block moved almost every doubling — sometimes a few bytes up the heap, twice to entirely different regions (`0x10405…` → `0xb17…` → `0x650…`) — and the contents survived every move. `realloc` copied them; that is its job.
3. Now the pointed question: if another pointer — say a `char *cursor` walking the string, or a struct field holding `p` — had been stashed anywhere before the move, it would still hold the *old* address, which now belongs to the allocator or to someone else's allocation. This is how the cold open's use-after-free arises in real code: not from a stray `free`, but from a growth operation that invalidated pointers nobody remembered.
4. **Fix:** the two-step pattern you see in the listing (never `p = realloc(p, n)`), plus the discipline: after a successful `realloc`, *recompute* every derived pointer from the new base; never cache pointers into a growable buffer across a push.
5. **State the rule:** *only `realloc`'s return value names the block after a resize — every pointer into the old location is dead the moment the call succeeds.*

These three rules, plus "check every allocation for NULL," are the entire manual discipline. The build task makes you live by them.

## Build Task

**The I.4 growable buffer** — the Vec ancestor. You are building the data structure that every dynamic array in every language descends from: a contiguous block of elements that grows geometrically as you push into it. This artifact is load-bearing forward — Book II.2 re-implements it with compiler-checked ownership, and I.7 packages it into `libcore.a`.

### File layout and interface

Three files: `buf.h` (interface and ownership contract), `buf.c` (implementation), `main.c` (demo). The interface is fixed:

```c
struct buf {
    int *data;    /* heap block of cap ints, or NULL when empty */
    size_t len;   /* elements currently stored */
    size_t cap;   /* elements the block can hold */
};

void buf_init(struct buf *b);
int  buf_push(struct buf *b, int x);   /* 0 on success, -1 if allocation failed */
int  buf_get(const struct buf *b, size_t i, int *out);   /* 0 on success, -1 if i out of range */
void buf_free(struct buf *b);
```

### Behavioural requirements

1. `buf_init` puts the buffer in a valid empty state: `data == NULL`, `len == cap == 0`. No allocation yet.
2. `buf_push` appends `x`. When `len == cap`, it grows first: from 0 to some positive initial capacity, thereafter **doubling** (`cap *= 2`). Growth uses the two-step `realloc` pattern.
3. **The `realloc` failure path is real:** if growth allocation fails, `buf_push` returns -1 and the buffer is left exactly as it was — old data intact, `len`/`cap` unchanged, still fully usable (a subsequent `buf_get` must work, and `buf_free` must still be called).
4. `buf_get` writes the element at index `i` through `out` and returns 0. Calling it with `i >= len` is a contract violation by the caller — but a *reported* one, not a silent one: return -1 and leave `*out` untouched. Your demo must make both paths visible: successful reads by index, and one deliberate out-of-range call whose -1 you print and handle.
5. `buf_free` releases the block and returns the buffer to the initialized empty state. Calling `buf_free` twice in a row must be safe (think about what requirement 1 plus the `NULL` rules buy you). After `buf_free`, `buf_init` is *not* required before reuse.
6. `main` exercises the structure: push a sequence of values (at least 40 so several doublings occur), print `len` and `cap` after each push so geometric growth is observable in the output, retrieve and print a few elements by index, then free.

### The ownership contract (scored — write it in `buf.h`'s header comments)

Your header comment block must state, in your own words, at minimum:

- who calls `buf_free` (the owner of the `struct buf`), and that the struct owns its `data` block;
- that `buf_push` may move the block, so **any pointer a caller saved into `data` is invalid after any push**;
- that `buf_push` returning -1 transfers nothing and invalidates nothing.

### Constraints

- C11, compiles warning-free under `cc -std=c11 -Wall -Wextra`.
- No VLAs, no fixed "maximum size" constant that caps growth.
- Every allocation freed exactly once, on every path including the failure path.
- Leak accounting is ad-hoc for now (I.7 formalizes it): add a counter or print statements that convince a reader your demo's allocations and frees balance — and say so in one line of output.

### Scoring

| Criterion | Full marks | Zero marks |
|---|---|---|
| Geometric growth | `cap` doubles; output shows 0 → initial → ×2 → ×4 … and `len` catching up | growth is one-per-push or invisible in output |
| Free discipline | every allocation freed exactly once, failure path included; double-`buf_free` safe | leak, double-free, or crash on any path |
| Ownership contract | all three clauses above present and *accurate* in `buf.h` comments | contract missing, or describes code you didn't write |
| `realloc` failure path | `buf_push` returns -1, old buffer intact and usable, two-step pattern used | `p = realloc(p, …)` anywhere, or failure corrupts the buffer |
| Bounds-checked `buf_get` | out-of-range call returns -1, `*out` untouched, and the demo shows the failure handled | reads past `len` return silent garbage, or the check is absent |

### Stretch goals

1. **Failure injection.** Add a compile-time test hook (e.g. `-DFAIL_REALLOC_AT=3`) that makes the *n*-th `realloc` in your demo return `NULL`, and prove in the output that the buffer survives: push fails, old elements still readable, `buf_free` still clean.
2. **Generalize the element type.** Replace `int` with a `typedef int buf_elem;` in one place, then flip it to `double` and confirm nothing else in the implementation had to change. (The fully generic `void *` version needs material from I.6 — note it, don't build it.)

Hold on to the finished artifact. In I.7 you package it into `libcore.a`; in Book II.2 you rebuild it under a compiler that enforces everything you just promised in comments.

## Why This Matters for Your Roadmap

This is the daily reality of the firmware engineers you will work alongside: ownership-by-hand is what maintaining C on 20–30-year industrial devices *is*. The PLCs and RTUs on your OT lane don't leak abstractly — they leak on a scan cycle, in a daemon expected to run for years between maintenance windows, and the trilogy from this module is the bug class behind a large share of the advisories you will read. It is also the substance of PS2: the long-lived infrastructure that must survive harvest-now-decrypt-later is long-lived C carrying exactly these bugs, and "we should rotate the keys" presumes a system that stays up long enough to rotate them. When you reach a WT1 industrial employer in Fall 2027, "I built a growable buffer and can tell you its ownership contract" is a sentence that lands — it says you understand what their codebase costs them. And Book II.2 turns this exact artifact into your first consolidation-tier rep: same buffer, same rules, but now the compiler enforces them — the moment the curriculum's through-line stops being a promise and becomes a diff you can read.

## Reps

1. Re-implement the growable buffer from memory — no peeking at your build task. Compare against it; note every rule you dropped.
2. Re-run the cold open three times and predict each line before it prints. If any prediction surprises you, re-read the lifetime diagram.
3. Take `lab_realloc.c`, add a `char *cursor = p + 1` before the loop, and predict what `cursor` points at after three doublings. Run it. Then state, in one sentence, what you would have to do to keep `cursor` valid.
4. Read `man malloc` on your machine — specifically what it says about `free` of an already-freed pointer and about `realloc` failure. Write the two API-contract sentences from memory afterwards.
5. Write the ownership-contract comment block for a fictional `char *read_config(const char *path);` — callee-allocates — without looking at `shout_new`. Check yours against the lab's.

## Deferred

Arena and pool allocators — allocating a big slab once and handing out pieces cheaply, freeing the slab all at once — are the standard answer when malloc-per-object is too slow or too fragmented for embedded work; they are an ownership *pattern* (the arena owns everything) and land naturally beside the protocol and server code of Book III. Garbage collection — making ownership somebody else's problem at runtime — is mentioned as design space only; it changes the machine model this book is teaching you to see, so it stays out of scope. Formal leak checking and sanitizer discipline are not deferred in spirit, only in tooling: I.7 makes them a standing requirement.
