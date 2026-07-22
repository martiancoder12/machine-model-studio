# I.7 · Multi-file programs and the real toolchain *(L3 gate)*

> **Level:** L2→L3 (gate module) · **Prerequisites:** I.1–I.6 — especially **the I.4 growable buffer** and the I.5 bounded reader `read_line`, both of which this module packages.
> **You will be able to:**
> - Split a program across headers and implementation files, and read the compiler's and the linker's diagnostics as two different voices.
> - Write a Makefile by hand that rebuilds exactly what changed and nothing more.
> - Use function pointers to build data-driven dispatch tables, and drive gdb (or lldb), ASan, UBSan, and valgrind to make memory bugs loud.

## Cold Open

You have a working program. From I.5, your bounded reader `read_line` plus its demo main, in one file:

```c
/* demo.c — the I.5 read_line, plus a demo main */
#include <stdio.h>

/* Reads one line from stdin into caller-provided storage.
 * The scored I.5 contract, carried over unchanged — snprintf-style:
 *   - writes at most cap - 1 payload bytes; never touches dst[cap - 1]
 *     or beyond, under any input
 *   - always NUL-terminates dst (empty input, EOF, truncation — every
 *     path), whenever cap > 0; cap == 0 stores nothing
 *   - returns the payload length of the FULL line, newline excluded,
 *     whether or not it fit: return value >= cap means the line was
 *     truncated to cap - 1 stored bytes
 *   - consumes the rest of an over-long line, so the next call starts
 *     at the next line; immediate EOF returns 0 with feof(stdin) set
 */
size_t read_line(char *dst, size_t cap)
{
    size_t full = 0;
    int c;

    while ((c = getchar()) != EOF && c != '\n') {
        if (full + 1 < cap)
            dst[full] = (char)c;
        full++;
    }
    if (cap > 0)
        dst[full < cap ? full : cap - 1] = '\0';

    return full;
}

int main(void)
{
    char line[64];
    size_t n;

    printf("type something: ");
    n = read_line(line, sizeof line);
    if (n == 0 && feof(stdin)) {
        printf("(no input)\n");
        return 1;
    }
    if (n >= sizeof line)
        printf("(line truncated: %zu bytes total)\n", n);
    printf("you typed: %s\n", line);
    return 0;
}
```

```sh
$ cc -std=c11 -Wall -Wextra demo.c -o demo
$ echo "hello machine" | ./demo
type something: you typed: hello machine
```

One file, one compile line, everything visible to everything. Now do what every real C project does: split it. The reader goes into a header plus an implementation file; the interactive prompting goes into `main.c`; a second header declares the prompt function. Four files:

```c
#ifndef READLINE_H
#define READLINE_H

#include <stddef.h>

struct line_buf {
    char storage[64];
    size_t len;
};

/* The scored I.5 contract, carried over unchanged: writes at most
 * cap - 1 payload bytes, always NUL-terminates when cap > 0, and
 * returns the payload length of the FULL line (newline excluded) —
 * a return value >= cap signals truncation distinctly. Immediate
 * EOF returns 0 with feof(stdin) set. */
size_t read_line(char *dst, size_t cap);
int read_line_buf(struct line_buf *lb);

#endif /* READLINE_H */
```

```c
#include "readline.h"
#include <stdio.h>

size_t read_line(char *dst, size_t cap)
{
    size_t full = 0;
    int c;

    while ((c = getchar()) != EOF && c != '\n') {
        if (full + 1 < cap)
            dst[full] = (char)c;
        full++;
    }
    if (cap > 0)
        dst[full < cap ? full : cap - 1] = '\0';

    return full;
}

int read_line_buf(struct line_buf *lb)
{
    size_t n = read_line(lb->storage, sizeof lb->storage);

    lb->len = (n < sizeof lb->storage) ? n : sizeof lb->storage - 1;
    return (n == 0 && feof(stdin)) ? -1 : 0;
}
```

```c
#ifndef PROMPT_H
#define PROMPT_H

#include "readline.h"

void prompt_and_read(struct line_buf *lb);

#endif /* PROMPT_H */
```

```c
#include <stdio.h>
#include "readline.h"
#include "prompt.h"

void prompt_and_read(struct line_buf *lb)
{
    printf("type something: ");
    if (read_line_buf(lb) < 0)
        printf("(no input)\n");
    else
        printf("you typed: %s\n", lb->storage);
}

int main(void)
{
    struct line_buf lb;
    prompt_and_read(&lb);
    return 0;
}
```

Build it in pieces — each `.c` compiled to an object file, then the objects linked:

```sh
$ cc -std=c11 -Wall -Wextra -c readline.c -o readline.o
$ cc -std=c11 -Wall -Wextra -c main.c -o main.o
$ cc readline.o main.o -o demo
$ echo "split across files" | ./demo
type something: you typed: split across files
```

Same program, same behaviour. Now break it — three ways, each one a failure you will meet in the wild, each with its own diagnostic voice.

**Break 1: remove the include guard.** Delete the `#ifndef READLINE_H` / `#define READLINE_H` / `#endif` lines from `readline.h` and recompile `main.c`:

```text
In file included from main.c:3:
In file included from ./prompt.h:4:
./readline.h:4:8: error: redefinition of 'line_buf'
    4 | struct line_buf {
      |        ^
main.c:2:10: note: './readline.h' included multiple times, additional include site here
    2 | #include "readline.h"
      |          ^
./prompt.h:4:10: note: './readline.h' included multiple times, additional include site here
    4 | #include "readline.h"
      |          ^
./readline.h:4:8: note: unguarded header; consider using #ifdef guards or #pragma once
```

`main.c` includes `readline.h` directly, and again through `prompt.h`. Without the guard, the struct is defined twice in one compile and the compiler refuses. Note that clang even tells you the fix.

**Break 2: put a definition in the header.** Restore the guard, but move the whole body of `read_line` — braces and all — into `readline.h` in place of its declaration. Both `.c` files now compile cleanly (each gets its own copy of the function). The failure moves to the link step:

```text
duplicate symbol '_read_line' in:
    .../main.o
    .../readline.o
ld: 1 duplicate symbols
clang: error: linker command failed with exit code 1 (use -v to see invocation)
```

**Break 3: forget a file.** Restore everything, then build with only `main.c` on the command line:

```text
$ cc -std=c11 -Wall -Wextra main.c -o demo
Undefined symbols for architecture arm64:
  "_read_line_buf", referenced from:
      _prompt_and_read in main-82465e.o
ld: symbol(s) not found for architecture arm64
clang: error: linker command failed with exit code 1 (use -v to see invocation)
```

The compiler was perfectly happy — the header *promised* `read_line_buf` exists. Nobody kept the promise, because `readline.o` never reached the linker.

Fix all three (guard back in, body back in `readline.c`, both objects on the link line) and the program runs exactly as before:

```sh
$ cc -std=c11 -Wall -Wextra -c readline.c -o readline.o
$ cc -std=c11 -Wall -Wextra -c main.c -o main.o
$ cc readline.o main.o -o demo
$ echo "all three fixed" | ./demo
type something: you typed: all three fixed
```

**What just happened.** The single file hid a distinction the split exposes: the *compiler* sees one `.c` file at a time — a translation unit — and the *linker* stitches the resulting object files together by matching names. A header is not compiled; it is text pasted into whichever `.c` file includes it. Break 1 was a compiler error about one translation unit seeing a struct twice. Breaks 2 and 3 were linker errors about names across object files: one name defined twice, one name defined never. Two tools, two voices, two different phases of the build. The exposition gives each its grammar.

## Headers, Translation Units, Linkage

**The translation unit.** When you run `cc -c main.c`, the preprocessor first performs every `#include` by textual substitution — after `cc -E main.c`, the contents of `stdio.h`, `readline.h`, and `prompt.h` are all physically present in one long stream. That stream is the translation unit, and it is the only thing the compiler ever sees. It does not see `readline.c`. It does not know `read_line` has a body somewhere. It knows only what the pasted text tells it.

This is why break 1 was a *compile* error: within one translation unit, `struct line_buf` was defined twice, and one TU may not contain two definitions of the same struct. The include guard works because it makes the second paste empty — the `#ifndef` is false the second time through, so the preprocessor skips to the matching `#endif`. (`#pragma once`, which clang suggested, does the same job in one non-standard line; the guard is the portable, universal form. Use the guard.)

**Declaration vs definition.** The split forces you to keep straight two things that single-file programs blur:

| | Declaration | Definition |
|---|---|---|
| Function | `size_t read_line(char *dst, size_t cap);` | the same, with a body `{ ... }` |
| What it does | promises the name exists, with this type | creates the actual code/storage |
| How many times per program | as many as you like | exactly once (for external names) |
| Lives in | headers, included anywhere | one `.c` file |

A header's entire job is to carry *declarations* — promises — so that every translation unit agrees on the shape of names it shares. The one-definition rule is what break 2 violated: a function body in a header is a definition, and it lands in every TU that includes the header, so the linker meets `_read_line` twice and refuses to choose.

**What the linker resolves.** Compilation turns each TU into an object file containing machine code plus a symbol table: names this object *defines* and names it *references but expects from elsewhere*. The linker's job is bookkeeping — for every referenced name, find exactly one definition among all the objects. Break 3's `Undefined symbols` is a reference with no definition anywhere on the link line; break 2's `duplicate symbol` is two definitions for one reference. When a link fails, the compiler has already signed off on every file individually — the error is always about the *set*.

**`extern` and `static`: the two linkage knobs.** A file-scope name has *external linkage* by default — visible to every object file at link time. Two keywords change the deal:

- `extern` on a variable says "this is a declaration, not a definition — storage lives in some other TU." You need it because a variable in a header would otherwise be *defined* once per includer (the variable version of break 2).
- `static` at file scope says the opposite: "this name is private to this translation unit" — internal linkage. It will not appear in the symbol table the linker consults.

Watch both work:

```c
/* hits.c */
#include "hits.h"

static unsigned long total;   /* internal linkage: this file only */

void hit(void)
{
    total++;
}

unsigned long hits_total(void)
{
    return total;
}
```

```c
/* main.c */
#include <stdio.h>
#include "hits.h"

extern int opt_verbose;   /* declaration: defined somewhere else */
int opt_verbose = 1;      /* definition: storage lives here, exactly once */

int main(void)
{
    if (opt_verbose)
        printf("verbose on\n");
    hit();
    hit();
    hit();
    printf("total: %lu\n", hits_total());
    return 0;
}
```

```sh
$ cc -std=c11 -Wall -Wextra hits.c main.c -o linkage
$ ./linkage
verbose on
total: 3
```

Now try to cheat — declare `total` in a third file and reach for it directly:

```c
/* probe.c */
extern unsigned long total;   /* lies: hits.c's total is static */
int main(void) { return (int)total; }
```

```text
$ cc -std=c11 -Wall -Wextra hits.c probe.c -o probe
Undefined symbols for architecture arm64:
  "_total", referenced from:
      _main in probe-e85ad5.o
```

The compiler believed the `extern` declaration; the linker found no such symbol, because `static` kept `total` out of the table. This is the mechanism behind the gate's requirement that internal helpers be `static`: it is not tidiness, it is how you guarantee no other file can depend on — or collide with — your private machinery.

The discipline, stated once: **headers declare; one `.c` defines; everything shared goes through the header; everything private is `static`.**

## `make`

You now have four files and three compile lines that must run in the right combination after every edit. Typing them is how mistakes like break 3 happen. `make` exists to encode the build once and re-run only the necessary part.

A Makefile is a set of rules. Each rule has a **target** (a file to produce), **prerequisites** (files the target is built from), and a **recipe** (the commands, indented with a TAB — a real tab character, not spaces; this is the single most common Makefile syntax error):

```make
target: prerequisites
	recipe
```

`make` builds a dependency graph from the rules and uses file timestamps: a target is rebuilt if any prerequisite is newer than the target. Here is the complete Makefile for the split program, developed line by line:

```make
CC     = cc
CFLAGS = -std=c11 -Wall -Wextra -g

demo: main.o readline.o
	$(CC) $(CFLAGS) main.o readline.o -o demo

main.o: main.c readline.h prompt.h
	$(CC) $(CFLAGS) -c main.c -o main.o

readline.o: readline.c readline.h
	$(CC) $(CFLAGS) -c readline.c -o readline.o

clean:
	rm -f demo main.o readline.o
```

Line by line:

1. `CC = cc` and `CFLAGS = ...` are variables. `$(CC)` expands to `cc` wherever it appears. One edit point for the compiler and flags — you will add sanitizer flags by editing one line. `-g` asks for debug information; you want it for the debugger section below.
2. `demo: main.o readline.o` — the final binary depends on the two object files. The recipe links them. This rule says nothing about `.c` files; it doesn't need to.
3. `main.o: main.c readline.h prompt.h` — **headers are prerequisites too.** This is the line beginners omit and regret. If `main.o` depended only on `main.c`, editing `readline.h` would not rebuild it, and you would link stale code against a new header — a mismatch that produces the most confusing bugs in C. List every header each TU pastes in.
4. `readline.o: readline.c readline.h` — same treatment.
5. `clean:` — a target that names no real file: its recipe just removes build products so you can force a from-scratch build.

The first target in the file is the default goal, so a bare `make` builds `demo`. The graph `make` constructs:

```text
                demo
               /    \
          main.o    readline.o
         /   |   \      |    \
     main.c readline.h prompt.h readline.c
              (readline.h is shared by both objects)
```

Watch the graph do its job (real output):

```text
$ make
cc -std=c11 -Wall -Wextra -g -c main.c -o main.o
cc -std=c11 -Wall -Wextra -g -c readline.c -o readline.o
cc -std=c11 -Wall -Wextra -g main.o readline.o -o demo
$ make
make: `demo' is up to date.
$ touch readline.h        # pretend you edited the header
$ make
cc -std=c11 -Wall -Wextra -g -c main.c -o main.o
cc -std=c11 -Wall -Wextra -g -c readline.c -o readline.o
cc -std=c11 -Wall -Wextra -g main.o readline.o -o demo
$ touch prompt.h          # only main.c includes this one
$ make
cc -std=c11 -Wall -Wextra -g -c main.c -o main.o
cc -std=c11 -Wall -Wextra -g main.o readline.o -o demo
```

Touching `readline.h` rebuilds *both* objects (both depend on it) and relinks. Touching `prompt.h` rebuilds only `main.o` — `readline.o` is left alone because none of its prerequisites changed. That selectivity is the entire point: in a thousand-file project, `make` is the difference between a three-second rebuild and a thirty-minute one.

Two operational warnings, both learned from real pain. First, the TAB: recipes must be tab-indented; if your editor inserts spaces, `make` answers `*** missing separator`. Second, **`make` tracks files, not flags.** Changing `CFLAGS` does not make any target look out of date. If you build once with sanitizers and again without, `make` will happily link objects from different worlds — on this machine, that produced a link failure naming `___asan_init` and `___ubsan_handle_type_mismatch_v1`, the sanitized objects demanding a runtime the plain link didn't provide. When you change flags, `make clean && make`. (A `san` target that always builds clean, like the one in the build task, sidesteps this.)

That is all of `make` you need for the next two books. Deferred: pattern rules, automatic variables, generated header dependencies.

## Function Pointers and Callbacks

This is the material I.3 deferred, arriving on schedule — because I.3 gave you the model it runs on: a pointer is a value that names a location. Functions live at addresses too. A function pointer is a variable that holds one.

The syntax is the hard part, so read it once, carefully:

```c
int (*run)(int, int);
```

`run` is a pointer to a function taking two `int`s and returning `int`. The parentheses around `*run` are load-bearing: `int *run(int, int)` would declare a function returning `int *`. Assign with the function's bare name (which decays to its address, array-style), call through the pointer as if it were the function:

```c
int add(int a, int b) { return a + b; }

int (*run)(int, int) = add;
int result = run(3, 4);   /* calls add(3, 4) */
```

Why is this worth a whole section? Because it turns *behaviour* into *data*. A table of function pointers is a table of things the program can do, and iterating a table is something you already know how to do. The payoff is the dispatch table:

```c
/* calc.c */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int op_add(int a, int b) { return a + b; }
static int op_sub(int a, int b) { return a - b; }
static int op_mul(int a, int b) { return a * b; }

struct command {
    const char *name;
    int (*run)(int, int);
};

static const struct command commands[] = {
    { "add", op_add },
    { "sub", op_sub },
    { "mul", op_mul },
};

int main(int argc, char **argv)
{
    if (argc != 4) {
        fprintf(stderr, "usage: %s <add|sub|mul> A B\n", argv[0]);
        return 2;
    }

    int a = atoi(argv[2]);
    int b = atoi(argv[3]);

    for (size_t i = 0; i < sizeof commands / sizeof commands[0]; i++) {
        if (strcmp(argv[1], commands[i].name) == 0) {
            printf("%d\n", commands[i].run(a, b));
            return 0;
        }
    }

    fprintf(stderr, "unknown command: %s\n", argv[1]);
    return 1;
}
```

```sh
$ cc -std=c11 -Wall -Wextra calc.c -o calc
$ ./calc add 3 4
7
$ ./calc mul 6 7
42
$ ./calc div 1 2
unknown command: div
```

Study the shape: the `main` loop contains no `add`, no `mul`, no arithmetic at all. It walks a table of `{name, function}` pairs and calls whichever it matches. **Adding a command is one table entry** — write `op_div`, add one line to `commands[]`, and the driver code does not change. That property — behaviour selected by data rather than by control flow — is what "data-driven" means, and the gate's test harness is scored on it.

A *callback* is the same mechanism pointed the other way: you hand your function's address to someone else's code, and they call it. The standard library does this — `qsort` sorts any type because you pass it a comparison function pointer. You have been calling functions by name since I.1; from here on, a function is also a value you can store, pass, and table.

## `gdb`, `valgrind`, ASan/UBSan

Everything so far this module has been about *building* the program. This section is about interrogating it. Four tools, four different relationships to the binary.

**The debugger: gdb.** First, machine honesty: gdb is not installed on this Mac — Apple ships **lldb** instead, the same class of tool with nearly identical concepts. The commands below are gdb's, because gdb is what you will meet on every Linux machine, server, and autograder you ever touch; the lldb equivalents (`bt`, `frame variable`, `frame select N`) are noted once, and the Lab walks the same session either way.

To debug, compile with `-g` (debug info: the mapping from machine code back to your source lines) and `-O0` (no optimization, so the code is where you wrote it). The essential session is five commands:

```text
gdb ./prog          # load the program
run                 # start it (run ARG1 ARG2 for arguments)
bt                  # backtrace: the call stack at this moment
frame 1             # move up the stack to frame 1
info locals         # show that frame's local variables
print expr          # evaluate any expression
quit                # leave
```

(lldb: same `run` and `bt`; `frame select 1` for `frame 1`; `frame variable` for `info locals`; `p expr` for `print`.)

When a program segfaults under the debugger, it stops *at the faulting instruction* with the whole call stack frozen — every frame's locals still inspectable. That is the superpower: a segfault outside the debugger gives you `Segmentation fault` and nothing; inside, it gives you the exact line, the exact pointer value, and the state of every caller on the way down. The Lab runs this session in full.

**ASan and UBSan: the sanitizers.** Where the debugger waits for you to ask, the sanitizers watch every operation and speak first. They are compiler instrumentation: add flags at build time, and the compiler weaves checks into your code.

```sh
cc -std=c11 -Wall -Wextra -g -fsanitize=address,undefined prog.c -o prog
```

- **AddressSanitizer (ASan)** surrounds every allocation with poisoned "redzone" bytes and tracks every freed block. Any read or write into a redzone or into freed memory aborts the program *at the faulting instruction* with a full report: the faulting line, the allocation site, the region's size.
- **UndefinedBehaviorSanitizer (UBSan)** instruments operations the standard calls undefined — signed overflow, bad shifts, misaligned access, out-of-bounds indexing where sizes are known — and prints a runtime error naming the exact operation and source line. Unlike ASan it does not abort by default; it reports and lets the program continue. (Add `-fno-sanitize-recover=all` if you want it fatal.)

UBSan on the I.2 sin, for real:

```c
#include <stdio.h>
#include <limits.h>

int main(void)
{
    int x = INT_MAX;
    x = x + 1;            /* signed overflow: undefined */
    printf("%d\n", x);
    return 0;
}
```

```text
$ cc -std=c11 -Wall -Wextra -g -fsanitize=undefined ub.c -o ub
$ ./ub
ub.c:7:11: runtime error: signed integer overflow: 2147483647 + 1 cannot be represented in type 'int'
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior ub.c:7:11
-2147483648
```

One flag, and behaviour the standard leaves undefined — silent on every run since I.2 — now announces itself with file, line, and the exact arithmetic. Note the program still printed `-2147483648` and exited 0: UBSan told you the truth *and* showed you the machine's actual result.

**valgrind.** valgrind is different in kind: no recompilation, no instrumentation — it runs your existing binary on a synthetic CPU and checks every memory access and every allocation as it executes. It is slower than ASan (10–50× is normal) but needs nothing from your build. Second piece of machine honesty: **valgrind is not available for this Mac** (current macOS on Apple silicon is not a supported platform). So: learn its output format here from a representative report, run it the day you sit at a Linux box, and let ASan carry the hands-on runs on this machine — with one gap noted below.

valgrind's Memcheck tool, invoked as `valgrind --leak-check=full ./prog`, emits reports in a fixed grammar. A representative leak summary (representative — not captured on this machine):

```text
==12345== 128 bytes in 1 blocks are definitely lost in loss record 1 of 1
==12345==    at 0x4841828: malloc (vg_replace_malloc.c:381)
==12345==    by 0x109168: main (leak.c:4)
==12345== LEAK SUMMARY:
==12345==    definitely lost: 128 bytes in 1 blocks
==12345== ERROR SUMMARY: 1 errors from 1 contexts
```

Read it like ASan's: what happened, how much, and the allocation stack trace. The build task's "zero valgrind errors, zero leaked bytes" criterion is phrased in this grammar. Two macOS gaps to be candid about: Apple's ASan build here also declines leak detection (`detect_leaks is not supported on this platform`), so on this machine the leak half of the criterion rests on your ownership discipline plus ASan/UBSan cleanliness, and gets its mechanical check wherever valgrind or full LeakSanitizer is available. macOS does ship a native `leaks(1)` tool worth knowing; in restricted environments it can be refused memory access, so treat its "0 leaks" there as no information.

**Which tool when.** Debugger: you have a crash or a wrong result and want to inspect state. ASan: every build, always — it catches the spatial and lifetime sins (I.4, I.5) at the exact line. UBSan: same builds — it catches the arithmetic sins (I.2). valgrind: when you're on Linux, when you can't recompile, or when you want the leak audit. They overlap on purpose; a bug caught by two tools is a bug understood twice.

## The Seam

This module's seam is meta: **instrumenting for memory bugs** — the tools that find every seam you have met so far. Until now, each bug class got its own careful demonstration and you had to trust the narrative about when it bites. From here on, the tooling states it for you, at the faulting line, with the allocation site attached.

The I.4 sin, prosecuted by ASan:

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    int *p = malloc(sizeof *p);
    *p = 42;
    free(p);
    *p = 13;              /* use-after-free */
    printf("%d\n", *p);
    return 0;
}
```

```text
$ cc -std=c11 -Wall -Wextra -g -O0 -fsanitize=address uaf.c -o uaf
$ ./uaf
=================================================================
==35696==ERROR: AddressSanitizer: heap-use-after-free on address 0x6020000000b0 at pc 0x000100ba48bc bp 0x00016f25a800 sp 0x00016f25a7f8
WRITE of size 4 at 0x6020000000b0 thread T0
    #0 0x000100ba48b8 in main uaf.c:9
    #1 0x00018cf0fdfc in start+0x1b4c (dyld:arm64e+0x1fdfc)

0x6020000000b0 is located 0 bytes inside of 4-byte region [0x6020000000b0,0x6020000000b4)
freed by thread T0 here:
    #0 0x0001014e1258 in free+0x7c (libclang_rt.asan_osx_dynamic.dylib:arm64e+0x41258)
    #1 0x000100ba486c in main uaf.c:8
    #2 0x00018cf0fdfc in start+0x1b4c (dyld:arm64e+0x1fdfc)

previously allocated by thread T0 here:
    #0 0x0001014e1164 in malloc+0x78 (libclang_rt.asan_osx_dynamic.dylib:arm64e+0x41164)
    #1 0x000100ba4830 in main uaf.c:6

SUMMARY: AddressSanitizer: heap-use-after-free uaf.c:9 in main
==35696==ABORTING
```

In I.4 this program "worked" — sometimes it printed 42, sometimes garbage, and whether it failed at all depended on the allocator's mood. That flakiness is exactly why the bug ships in real code. Under ASan there is no mood: three stack traces tell the whole life story of the block — allocated at `uaf.c:6`, freed at `uaf.c:8`, written after death at `uaf.c:9` — and the program aborts every single time. ASan catches the overflows of I.5 the same way (the Lab shows it); UBSan flags the integer sins of I.2 (shown above); valgrind accounts for every leaked byte.

One honest wrinkle, and it is a preview of I.8: sanitizers only see the code that actually runs. The overflow in the Lab below, built at `-O1` on this machine, *vanished* — the optimizer proved the writes were dead (nothing ever read them) and deleted them, bug and all, and ASan reported nothing because there was nothing left to report. So the rule is two-tier, not absolute: **default your sanitizer builds to `-O0`/`-g`**, where every operation executes as written and visibility is maximum — **and also verify at `-O2`**, because the optimizer changes what the sanitizers can observe (the vanishing overflow is your evidence) and because `-O2` is the level you ship: the I.8 capstone scores its sanitizer cleanliness there. What the optimizer may assume, and why that assumption is load-bearing, is I.8's subject.

So the seam's forward pointer, stated as a standing order: **from this module to the end of Book III, "clean under sanitizers" is a requirement, not a bonus.** Every build task you submit from here — including the gate below — runs under `-fsanitize=address,undefined` and must produce zero reports. Book III.4 then scales the same habit from "your test suite, clean" to "a fuzzer's ten million inputs, clean." The tool is the same; only the volume changes.

## Lab

Guided, three parts. Everything below was run on this machine; your numbers (addresses, PID tags) will differ, the structure will not.

**Part 1 — the three-file build, by Makefile.**

1. Recreate the four files from the cold open (`readline.h`, `readline.c`, `prompt.h`, `main.c`) in a fresh directory.
2. Write the Makefile from the `make` section, exactly as shown. Check the recipes are tab-indented: `cat -A Makefile` shows tabs as `^I`.
3. Run `make`. Expect the three compile/link lines from the verified transcript. Run `make` again: expect `` `demo' is up to date. `` — nothing rebuilt.
4. `touch readline.h && make`: expect both objects rebuilt and a relink. `touch prompt.h && make`: expect only `main.o` rebuilt. If step 4's selectivity doesn't match, your header prerequisites are wrong — fix them before continuing; this is the skill.
5. `echo "lab part 1" | ./demo` — expect `type something: you typed: lab part 1`.

**Part 2 — a deliberate heap overflow, read under ASan.**

6. Write this program, deliberately wrong:

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    char *buf = malloc(16);
    if (buf == NULL)
        return 1;

    for (size_t i = 0; i < 20; i++)
        buf[i] = 'A';

    printf("wrote 20 bytes into a 16-byte block\n");
    free(buf);
    return 0;
}
```

7. Build and run under ASan at `-O0`:

```sh
$ cc -std=c11 -Wall -Wextra -g -O0 -fsanitize=address overflow.c -o overflow
$ ./overflow
```

8. Read the report (this is the real one, abridged only in its shadow-memory dump):

```text
=================================================================
==35638==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x6020000000c0 at pc 0x00010267c89c bp 0x00016d782810 sp 0x00016d782808
WRITE of size 1 at 0x6020000000c0 thread T0
    #0 0x00010267c898 in main overflow.c:11
    #1 0x00018cf0fdfc in start+0x1b4c (dyld:arm64e+0x1fdfc)

0x6020000000c0 is located 0 bytes after 16-byte region [0x6020000000b0,0x6020000000c0)
allocated by thread T0 here:
    #0 0x000102fbd164 in malloc+0x78 (libclang_rt.asan_osx_dynamic.dylib:arm64e+0x41164)
    #1 0x00010267c804 in main overflow.c:6
    #2 0x00018cf0fdfc in start+0x1b4c (dyld:arm64e+0x1fdfc)

SUMMARY: AddressSanitizer: heap-buffer-overflow overflow.c:11 in main
==35638==ABORTING
```

9. Answer, pointing at the report, before reading on. **Faulting line?** `overflow.c:11` — the `buf[i] = 'A'` store, the moment `i` reached 16. **Allocation site?** `overflow.c:6` — the `malloc(16)`. **Region size?** `16-byte region [0x6020000000b0, 0x6020000000c0)`, and the bad write is `0 bytes after` it — the very first byte past the end. Those three answers are the whole skill of reading an ASan report; every report you'll ever see has the same three organs.
10. Rebuild at `-O1` instead of `-O0` and run again. On this machine: the program prints `wrote 20 bytes into a 16-byte block` and exits 0 — no report. The optimizer deleted the dead stores, bug included. Hence the two-tier rule: `-O0` is the default for sanitizer builds, for maximum visibility — but you verify at `-O2` as well, because the optimizer changes what the sanitizers can observe, and the I.8 capstone scores its cleanliness there. I.8 owns the explanation.

**Part 3 — a segfault, into the debugger.**

11. Write the crasher:

```c
#include <stdio.h>

static void scribble(char *dst, int n)
{
    for (int i = 0; i < n; i++)
        dst[i] = 'x';
}

static void middle(int n)
{
    char *target = NULL;
    int guard = 7;

    printf("about to write %d bytes\n", n);
    scribble(target, n);
    printf("guard is still %d\n", guard);
}

int main(void)
{
    middle(4);
    printf("survived\n");
    return 0;
}
```

12. Build with debug info and run it plainly first:

```sh
$ cc -std=c11 -Wall -Wextra -g -O0 crash.c -o crash
$ ./crash
Segmentation fault: 11
```

Note what you did *not* see: `about to write 4 bytes`. When stdout is a pipe it is block-buffered, and the buffer died with the process. (Interactive terminals line-buffer, so you may see it there.) Lesson worth the price of admission: **prints are not a reliable crash oracle — the debugger is.**

13. Into the debugger. gdb: `gdb ./crash`, then `run`. lldb on this Mac: `lldb ./crash`, then `run`. Either way, the process stops at the faulting store. Ask for the backtrace (`bt` in both). Full candour about what follows: the crash above is a real observed run, but the transcripts in this walkthrough are representative, not captured — gdb is not installed on this machine and lldb's process attachment is restricted in the environment this chapter was written in. What is shown is gdb's display format, and the frames, line numbers, and local values are this exact binary's — derived from the source you just compiled and the crash you just watched. Your session will match them.

```text
#0  scribble (dst=0x0, n=4) at crash.c:6
#1  0x0000000100000f2c in middle (n=4) at crash.c:15
#2  0x0000000100000f58 in main () at crash.c:21
```

Frame #0 is where the fault happened: `scribble`, line 6, and look at the argument — `dst=0x0`, a null pointer, arrived from the caller. `info locals` (lldb: `frame variable`) in frame #0 shows `i = 0`: it died on the first store. Now climb: `frame 1` (lldb: `frame select 1`), then inspect the dead frame's locals:

```text
(gdb) frame 1
#1  0x0000000100000f2c in middle (n=4) at crash.c:15
15          scribble(target, n);
(gdb) info locals
target = 0x0
guard = 7
```

There is the whole story: `middle` initialized `target = NULL`, never pointed it at storage, and passed it down. `guard = 7` sits right next to it, unharmed — the fault wasn't corruption, it was a pointer that was never born. The line the debugger shows (15) is where frame #1 will resume if frame #0 ever returns; that is what "the call stack is frozen" means concretely.
14. `quit`. Fix the bug (`target` needs real storage — a local array or a `malloc`), rebuild, and confirm the program now prints all three lines and exits 0.

**State the rule:** a memory bug has three coordinates — the faulting line, the allocation site, and the region's bounds — and the instrumentation toolchain reports all three; your job is to read them, not to guess.

## Build Task

**← L3 GATE.** Package the work of Book I so far as a real library with a real build and a real test suite. This artifact — **`libcore.a`** — is the L3 gate: it does not pass, you do not advance to Book II. The gate statement from the front matter applies in full.

**What you build.** A static library archiving two modules you already own, plus a data-driven test harness:

```text
core.h        — the public header (the only header a user of the library includes)
buf.c         — the I.4 growable buffer implementation
readline.c    — the I.5 bounded reader implementation
harness.c     — the test harness
Makefile      — builds the library, the harness, and runs the tests
```

**The interface, fixed.** `core.h` declares, and only declares:

```c
struct buf {
    int *data;
    size_t len;
    size_t cap;
};

void buf_init(struct buf *b);
int  buf_push(struct buf *b, int value);   /* doubling growth; -1 on allocation failure */
int  buf_get(const struct buf *b, size_t i, int *out);
void buf_free(struct buf *b);

/* The scored I.5 contract, carried over unchanged — snprintf-style:
 * writes at most cap - 1 payload bytes and always NUL-terminates when
 * cap > 0, never touching dst[cap - 1] or beyond under any input;
 * returns the payload length of the FULL line (newline excluded), so
 * a return value >= cap signals truncation distinctly. Immediate EOF
 * returns 0 with feof(stdin) set. */
size_t read_line(char *dst, size_t cap);
```

Behavioural requirements are inherited, not relaxed: `buf_push` grows geometrically (doubling), `realloc` failure leaves the old buffer intact and returns -1, the ownership contract from I.4 stands (caller calls `buf_free`; a successful `buf_push` may invalidate saved pointers into `data` — say so in the header comment), and the `buf_get` signature — status return, value delivered through the `out` parameter — is carried over unchanged from I.4. For `read_line`, the scored I.5 contract is carried over unchanged, and it is the snprintf-style one stated in the header comment above: never writes past `dst[cap - 1]` under any input, always NUL-terminates, and signals truncation distinctly through the return value — `>= cap` means the line did not fit, with the stored payload always `cap - 1` bytes plus the NUL.

**The harness.** Tests are registered in a function-pointer dispatch table and run with a pass/fail summary:

```c
struct test_case {
    const char *name;
    int (*run)(void);        /* returns 0 on pass, nonzero on fail */
};
```

The driver walks the table, prints each test's name with `PASS`/`FAIL`, prints a `N/M passed` summary, and exits zero only if every test passed. Register at minimum: a growth test (push many, verify `len`, verify values readable back through `buf_get`), a bounds test (`buf_get` out of range fails cleanly), and a truncation test for `read_line` with input far longer than `cap` (pipe it in; the harness reads `stdin`) — the test must *branch* on the truncation signal: a return value `>= cap` means truncated, with `cap - 1` payload bytes stored.

**The Makefile.** Required targets:

- default: builds `libcore.a` (`ar rcs libcore.a buf.o readline.o`) and the harness (`cc ... harness.c -L. -lcore -o harness`).
- `test`: builds everything, runs the harness (feed its stdin a long line).
- `san`: a clean build with `-fsanitize=address,undefined` added, then the full test run — at `-O0` by default, and again at `-O2`, the level the I.8 capstone scores. Make it build clean itself — flags are not files, and `make` does not track them.
- `clean`.

**Scoring criteria** (verbatim from the syllabus; the rubric is how each is checked):

| Criterion | How it is checked |
|---|---|
| `make` from a clean tree builds the library, the harness, and runs the tests; header/implementation separation is correct (guards, no definitions in the header, internal helpers `static`). | Fresh `make clean && make && make test` succeeds; `core.h` contains declarations and the struct definition only, behind a guard; `nm libcore.a` shows no helper symbols visible that shouldn't be. |
| The harness fails loudly — a broken test produces a nonzero exit and a named failure — demonstrated by deliberately breaking one test. | Break one assertion on purpose (e.g. expect the wrong `len`), `make test`, show the `FAIL` line naming the test and the nonzero exit (`make: *** [test] Error 1`). Restore before submitting. Keep the transcript. |
| The full suite passes clean under ASan and UBSan, with zero valgrind errors and zero leaked bytes. | `make san` runs green with zero sanitizer reports. On Linux: `valgrind --leak-check=full ./harness` with `ERROR SUMMARY: 0 errors` and `definitely lost: 0 bytes`. On this Mac: the sanitizer run is the operative check (valgrind is unavailable and ASan leak detection is declined — state this in your README rather than faking it). |
| The dispatch table is genuinely data-driven: adding a test is one table entry, no driver changes. | Add a fourth test by writing its function and one `tests[]` line. If you touched the driver loop, it doesn't count. |

**Stretch goals.** (1) Add your I.3 `my_strlen` to the library as a third module — pointer arithmetic only, table-registered tests — so `libcore.a` spans three modules of the book. (2) Make the growth test assert the *observable* doubling geometry: track `cap` across pushes and verify it only ever takes the values 4, 8, 16, 32, …, so the geometric-growth requirement is tested, not just believed.

## Why This Matters for Your Roadmap

Foundational, and candidly so: the roadmap hook is not this module's content but its gate. There is no Modbus frame in a Makefile. But the toolchain you assembled here — multi-file builds, `make`, the debugger, the sanitizers — *is* the audit instrument that the L3 skill ("read unfamiliar C, catch its UB") runs on, and L3 is the PLC-codebase audit skill the whole OT lane is built around. I.8 puts you in front of a codebase you didn't write; this gate is what makes that something you can actually do rather than something you can describe. Book III.4 then scales exactly this toolchain into fuzzing — the same sanitizer flags, pointed at industrial protocol parsers, as a work-term deliverable. Pass the gate; the instrument is yours.

## Reps

- From memory, write the declaration/definition split for a one-function module — header with guard, `.c` with the body, a `main` — then break each rule once and predict the diagnostic before reading it.
- Reproduce the cold open's three breaks in a fresh directory without looking at this chapter. Two linker voices (`duplicate symbol`, `Undefined symbols`), one compiler voice (`redefinition`) — name which tool speaks each time.
- Handwrite the lab Makefile from memory; verify `touch`-based selectivity on both headers.
- Extend `calc.c` with `div` and a table-driven `help` entry; if you edited the driver loop, start over.
- Take any program you wrote in I.4–I.6 and build it with `-fsanitize=address,undefined`. Predict what it will report, then run it. Write one line on any prediction that was wrong.

## Deferred

Shared libraries and the dynamic linker (`libcore.so`, `LD_LIBRARY_PATH`, symbol visibility) — static archiving is all the next two books need. CMake and pkg-config — you now know what they generate, which is the point of learning `make` first. Advanced gdb: conditional breakpoints, watchpoints on specific addresses, Python scripting — the five commands you have cover the I.8 capstone and Book II. Automatic Makefile dependency generation (`-MMD`), pattern rules, and phony-target hygiene — flagged for when a project outgrows handwritten rules.
