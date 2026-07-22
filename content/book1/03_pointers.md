# I.3 · Pointers and addresses *(make-or-break)*

> **Level:** L1 · **Prerequisites:** I.1 (the pipeline, `printf`), I.2 (fixed-width integers, `sizeof`)
> **You will be able to:**
> - Read and write pointer code: take an address with `&`, follow it with `*`, and know exactly which byte of the machine each operation touches.
> - Reason about automatic storage: say precisely when a local is born, when it dies, and why its address is borrowed time.
> - Compute with typed pointers: predict the address of `p + i` before you run the program, and walk `char **argv` one indirection at a time.

## Cold Open

Before any explanation, type this — don't paste it — compile it, and run it:

```c
#include <stdio.h>

int main(void)
{
    int x = 42;
    int *p = &x;

    printf("%p %d\n", (void *)p, *p);
    return 0;
}
```

```sh
cc -std=c11 -Wall -Wextra cold_open.c -o cold_open
./cold_open
```

```text
0x16da52868 42
```

Two numbers on one line. The first is an address — a location in your machine's memory, printed in hexadecimal with `%p`. The second is the value stored at that location. Your address will differ from this one (it will likely differ between two runs of the same binary — the loader randomizes it); on this machine, at this moment, `x` lived at `0x16da52868`. The `42` is the same everywhere.

**What just happened.** `int *p = &x;` created a variable that does not hold an integer — it holds the *address of* an integer. Then `*p` asked: what integer lives at the address `p` holds? Two new operators, one idea: **a pointer is a value that names a location.** Every pointer program you will ever read is those two moves — naming a location, visiting a location — composed a thousand ways. If this module doesn't click, nothing after it does; that is why it is marked make-or-break. Rep it until it does.

One small mechanical note before the exposition: `%p` expects a `void *`, a "pointer to anything," which is why the call casts with `(void *)p`. Casting is a later conversation; for now it is boilerplate that keeps `printf`'s contract (I.1) honest.

## Address-of and dereference: `&` and `*` as inverses

`&` and `*` undo each other, and watching them do it once is worth a page of definition:

```c
#include <stdio.h>

int main(void)
{
    int x = 42;
    int *p = &x;

    printf("p          = %p\n", (void *)p);
    printf("&x         = %p\n", (void *)&x);
    printf("*&x        = %d\n", *&x);        /* undo & with * */
    printf("&*p == p   -> %p\n", (void *)&*p); /* undo * with & */

    *p = 99;                          /* write through the pointer */
    printf("x after *p = 99: %d\n", x);
    return 0;
}
```

```text
p          = 0x16af2a868
&x         = 0x16af2a868
*&x        = 42
&*p == p   -> 0x16af2a868
x after *p = 99: 99
```

Read the declaration `int *p` as a sentence: *"`p` is a pointer to `int`."* The type matters in both directions. `&x` yields a value of type `int *` — it can only legally point at `int`-sized, `int`-shaped storage. And `*p` doesn't just fetch bytes; it fetches bytes *and interprets them as an `int`*, because the pointer's type is a promise about what's at the far end. You saw in I.2 that bits don't know what they mean. A pointer's type is how the meaning travels: through the address, to the far end.

The last two lines are the move that makes pointers worth the trouble. `*p = 99;` never mentions `x`. It writes through the address, and `x` changes, because `*p` and `x` are two names for the same four bytes of storage. This is aliasing, and it is the entire mechanism: a function that receives an address can modify storage it does not own. The lab makes you feel that. The seam makes you fear it.

Two boundary facts, stated once and then assumed:

- A pointer may also hold **no location**: the null pointer, written `NULL`. Dereferencing it is not "reads a zero" — it crashes (at best) and is undefined behaviour (at worst). `NULL` becomes load-bearing in I.4, where it is `malloc`'s failure signal; until then, treat it as the empty address and don't follow it.
- `&` on an ordinary local is always valid. `*` on a pointer is valid only if the pointer currently names live storage of the right type. That word *currently* is the whole seam of this chapter.

## The stack and automatic storage

Where did `x`'s address come from? You never asked for memory; you declared a local, and memory appeared. That memory is **automatic storage**, and it lives in a region called the **stack**. The rules are brutal and simple:

1. Entering a block creates storage for the locals declared in it.
2. Leaving the block destroys that storage.
3. "Destroyed" does not mean erased. It means *not yours anymore*.

Every function call pushes a new region — a **frame** — onto the stack, and returning pops it. You can watch the stack grow with two addresses:

```c
#include <stdio.h>

void inner(void)
{
    int y = 2;
    printf("inner's frame: &y = %p\n", (void *)&y);
}

int main(void)
{
    int x = 1;
    printf("main's frame:  &x = %p\n", (void *)&x);
    inner();
    return 0;
}
```

```text
main's frame:  &x = 0x16d542868
inner's frame: &y = 0x16d54283c
```

On this machine the stack grows *downward*: `inner`'s local sits at a lower address than `main`'s (`0x...283c` < `0x...2868`), because calling a function extends the stack into lower memory. Drawn as a picture:

```text
high addresses
+---------------------------+
| main's frame              |
|   int x  @ 0x16d542868    |  <- alive for all of main
+---------------------------+
| inner's frame             |
|   int y  @ 0x16d54283c    |  <- born at the call, dead at the return
+---------------------------+  <- the stack grows DOWN, toward low addresses
low addresses
```

The moment `inner` returns, `y`'s slot stops belonging to `y`. The bytes are not zeroed; the region is simply back on the free list, and the next call's frame will be built on top of it. Block scope inside one function is the same rule at a finer grain: a local declared inside `{ ... }` lives until the closing brace and not one statement longer.

This gives you the chapter's first law: **the address of a local is borrowed time.** It is a perfectly good address while the local lives and a trap the instant it dies. The compiler knows the lifetime; it will not stop you from keeping the address past the end of it. Keep this law in view for the rest of the book — I.4 gives storage a manual lifetime (`malloc`/`free`), and the same question — *is this address still mine?* — becomes the central discipline of C.

## Pointer arithmetic and pointer type

Adding an integer to a pointer does not add that many *bytes*. It adds that many *elements* — and the element size comes from the pointer's type:

```c
#include <stdio.h>

int main(void)
{
    int    ai[3] = {10, 20, 30};
    double ad[3] = {1.5, 2.5, 3.5};

    int    *pi = ai;
    double *pd = ad;

    printf("sizeof(int) = %zu, sizeof(double) = %zu\n",
           sizeof(int), sizeof(double));

    printf("pi     = %p\n", (void *)pi);
    printf("pi + 1 = %p\n", (void *)(pi + 1));
    printf("pi + 2 = %p\n", (void *)(pi + 2));

    printf("pd     = %p\n", (void *)pd);
    printf("pd + 1 = %p\n", (void *)(pd + 1));

    printf("*(pi + 1) = %d\n", *(pi + 1));
    printf("*(pd + 2) = %.1f\n", *(pd + 2));
    return 0;
}
```

```text
sizeof(int) = 4, sizeof(double) = 8
pi     = 0x16afde868
pi + 1 = 0x16afde86c
pi + 2 = 0x16afde870
pd     = 0x16afde850
pd + 1 = 0x16afde858
*(pi + 1) = 20
*(pd + 2) = 3.5
```

Look at the deltas, on this machine:

| expression | address | byte delta from base |
|---|---|---|
| `pi` | `0x16afde868` | 0 |
| `pi + 1` | `0x16afde86c` | +4 = one `int` |
| `pi + 2` | `0x16afde870` | +8 = two `int`s |
| `pd` | `0x16afde850` | 0 |
| `pd + 1` | `0x16afde858` | +8 = one `double` |

`p + 1` advances by `sizeof(*p)`. Pointer arithmetic is **typed, not byte-counted**: the same `+ 1` moves four bytes through an `int *` and eight bytes through a `double *`. This is why the pointer's type is a promise and not a decoration — the compiler uses it to compute every single step you take.

Subtraction is the mirror: subtracting two pointers of the same type yields the number of *elements* between them, not bytes. `pi + 2 - pi` is `2`. Hold that thought; the build task's `my_strlen` is exactly one subtraction.

There is a boundary law to go with the arithmetic, and it will matter more than any other sentence in this section once buffers arrive in I.5. Given an array of `n` elements, the legal pointer values are `p` (first element) through `p + n - 1` (last element), plus *one* honorary extra: `p + n`, the one-past-the-end pointer. You may compute it and compare against it — that is how every end-of-array loop in C is written — but you may not dereference it. Anything beyond it, in either direction, is not "reads a neighbour's bytes"; forming the pointer at all is undefined behaviour, filed in I.8's catalogue under *invalid pointer arithmetic*. The machine's bytes don't care about the law, which is exactly why you must.

(An honesty note about the arrays in that listing: writing `int *pi = ai;` works because an array's name, in most expressions, *decays* to a pointer to its first element. Decay has rules and exceptions — `sizeof ai` does not decay, `&ai` does not decay — and I.5 owns them. For now, treat `pi = ai` as "`pi` points at the first element" and nothing more.)

## Pointers to pointers: `char **argv` demystified

Indirection is a repeatable move. If a pointer can hold the address of an `int`, a pointer can hold the address of a pointer — and you've been writing one since I.1 without being shown it: `main`'s second parameter, `char **argv`.

`argv` is an array of slots. Each slot holds a `char *` — a pointer to the first character of one command-line argument. So `argv` itself, decayed, is a pointer to the first slot: a pointer to a pointer to `char`. Here it is, walked for real:

```c
#include <stdio.h>

int main(int argc, char **argv)
{
    printf("&argv[0] = %p\n", (void *)&argv[0]);
    for (int i = 0; i < argc; i++) {
        printf("argv[%d]: slot %p -> %p \"%s\"\n",
               i, (void *)&argv[i], (void *)argv[i], argv[i]);
    }
    return 0;
}
```

```sh
cc -std=c11 -Wall -Wextra argv_walk.c -o argv_walk
./argv_walk forward security
```

```text
&argv[0] = 0x16bd76ed8
argv[0]: slot 0x16bd76ed8 -> 0x16bd770b0 "./argv_walk"
argv[1]: slot 0x16bd76ee0 -> 0x16bd770bc "forward"
argv[2]: slot 0x16bd76ee8 -> 0x16bd770c4 "security"
```

Read the addresses (yours will differ — on this machine only). The slots are 8 bytes apart (`0x...ed8`, `0x...ee0`, `0x...ee8`): `sizeof(char *)` is 8 here, and pointer arithmetic on a `char **` steps by 8, exactly as the previous section promised. Each slot *contains* an address in a different neighbourhood (`0x...70b0` and onward) — that's where the actual characters live. The picture:

```text
argv (char **)
  |
  v
+-------------+-------------+-------------+
| 0x...770b0  | 0x...770bc  | 0x...770c4  |   <- the slots (char * each)
+-------------+-------------+-------------+
      |             |             |
      v             v             v
  "./argv_walk"  "forward"    "security"       <- the strings (char each)
```

Now walk it with indirection alone — no indexing, one dereference at a time:

```c
#include <stdio.h>

int main(int argc, char **argv)
{
    char **pp = argv;              /* pp points at the first slot */
    for (int i = 0; i < argc; i++) {
        char *s = *pp;             /* one dereference: a char*  */
        char c = **pp;             /* two dereferences: a char  */
        printf("pp = %p, *pp = %p, **pp = '%c' (string \"%s\")\n",
               (void *)pp, (void *)s, c, s);
        pp++;                      /* advance one slot */
    }
    return 0;
}
```

```text
pp = 0x16bd3eed8, *pp = 0x16bd3f0b0, **pp = '.' (string "./argv_pp")
pp = 0x16bd3eee0, *pp = 0x16bd3f0ba, **pp = 'f' (string "forward")
pp = 0x16bd3eee8, *pp = 0x16bd3f0c2, **pp = 's' (string "security")
```

Three levels, each doing one job: `pp` is the address of a slot; `*pp` is the address stored in that slot; `**pp` is the character at that address. `pp++` advances one *slot* — 8 bytes — because `pp` is a `char **`. There is no magic in `char **` and there never was. It is the same two operators, one layer deeper. Whatever number of `*`s you meet in the wild — and you will meet `***` in real firmware — this is the procedure: one star, one hop, check the address, repeat.

One standard-guaranteed detail worth knowing now: the slot after the last argument, `argv[argc]`, is always `NULL`. The list of slots is terminated the same way a string is — a sentinel at the end — so `argc` is technically redundant. Programs do walk `argv` as `while (*argv++)` in the wild; now you can read that idiom, and you can verify the guarantee yourself by printing `argv[argc] == NULL` in the walk above.

## The Seam

**The dangling stack pointer.** A function returns the address of one of its locals. The caller receives a pointer to storage that died at the `return` — and the next call builds its frame on the corpse. Write it, because you will meet it in code review for the rest of your career:

```c
#include <stdio.h>

int *make_number(void)
{
    int n = 1337;          /* automatic storage: dies when this function returns */
    return &n;             /* the caller now holds a pointer to dead storage */
}

void clobber(void)
{
    int x = 99;            /* the next call reuses the same stack region */
    int y = 55;
    printf("clobber's locals: %d %d\n", x, y);
}

int main(void)
{
    int *p = make_number();
    int before = *p;       /* read immediately, before printf runs over the dead frame */
    printf("through the dangling pointer: %d\n", before);

    clobber();
    int after = *p;        /* same address, whoever lives there now */
    printf("after clobber():            %d\n", after);
    return 0;
}
```

The compiler sees exactly what you did. With `-Wall`, clang names it:

```text
dangle.c:6:13: warning: address of stack memory associated with local variable 'n' returned [-Wreturn-stack-address]
```

Now run it, at both optimization levels, on this machine:

```text
$ ./dangle_O0
through the dangling pointer: 1337
clobber's locals: 99 55
after clobber():            1

$ ./dangle_O2
through the dangling pointer: -115212032
clobber's locals: 99 55
after clobber():            99
```

Three facts, and all three are the seam:

1. **At `-O0` it works — the first time.** The dead slot still held `1337` when you read it, because nothing had reused the frame yet. This is the program passing its tests.
2. **Then it doesn't.** After `clobber()`, the same address read `1` — not `99`, not `1337`; whatever the intervening calls left in that region. The pointer is unchanged. The storage under it has new tenants, and which tenant's bytes you read is an accident of call history.
3. **The same source, compiled differently, fails differently.** At `-O2` even the *first* read is garbage (`-115212032`), and after `clobber()` the slot reads exactly `99` — the smear lands perfectly. The optimizer laid the frames out differently, and every "it worked on my machine" evaporated with a compiler flag.

Why does it ship? Because the language does not make it an error — using a pointer to dead storage is *undefined behaviour*, and undefined behaviour is not required to crash (I.8 owns this catalogue; for now: UB means the standard washes its hands of your program). Because it often passes every test the author writes, at the optimization level the author tests at. Because the warning only appears if the compiler can see the escape — and seeing it requires the escape to happen inside one function, in a shape the analysis recognizes. The moment the address flows through a function call, a struct field, a global, or a translation-unit boundary, the diagnostic goes silent; no compiler is required to track a value's provenance across your whole program, and at real code sizes none can. That is not a tooling gap to be patched; it is the price of a language that lets an address be an ordinary value. In firmware written across forty files, nobody is returning `&n` from the function that defines `n`; they are stashing the address of a local into a struct field, a global, a callback table, and the corpse gets visited three subsystems away.

The forward pointers, so you know where this gets its names: I.7 hands you the sanitizer that catches this class on the exact faulting line (ASan calls it *stack-use-after-return*); I.8 files it in the UB catalogue; Book III.2 revisits it as an attacker, for whom a pointer to reused stack storage is not a bug but a handle. You met the seam by hand here. Remember what `1` felt like.

## Lab

Two exercises, both short, both mandatory. Draw the pictures — the drawings are the point.

**Part 1 — `swap`, by value and by pointer.**

Step 1. Write this program in full:

```c
#include <stdio.h>

void swap_by_value(int a, int b)
{
    int t = a;
    a = b;
    b = t;
    printf("  inside: a = %d, b = %d\n", a, b);   /* swapped copies */
}

void swap_by_pointer(int *a, int *b)
{
    int t = *a;
    *a = *b;
    *b = t;
}

int main(void)
{
    int x = 1, y = 2;

    printf("by value:   before x = %d, y = %d\n", x, y);
    swap_by_value(x, y);
    printf("by value:   after  x = %d, y = %d\n", x, y);

    printf("by pointer: before x = %d, y = %d\n", x, y);
    swap_by_pointer(&x, &y);
    printf("by pointer: after  x = %d, y = %d\n", x, y);
    return 0;
}
```

Step 2. Compile and run:

```sh
cc -std=c11 -Wall -Wextra swap.c -o swap && ./swap
```

```text
by value:   before x = 1, y = 2
  inside: a = 2, b = 1
by value:   after  x = 1, y = 2
by pointer: before x = 1, y = 2
by pointer: after  x = 2, y = 1
```

Step 3. Verify the by-value version did nothing to `main`'s variables: inside `swap_by_value` the swap happened (`a = 2, b = 1`), and back in `main` nothing changed. Draw why:

```text
BY VALUE — the function swaps copies in its own frame

main's frame                    swap_by_value's frame
+-------+-------+               +-------+-------+-------+
| x = 1 | y = 2 | -- copies --> | a = 1 | b = 2 |  t    |
+-------+-------+               +-------+-------+-------+
   unchanged                        dies with the frame
```

Step 4. Verify the by-pointer version worked, and draw that too — the arrow is the whole difference:

```text
BY POINTER — the function reaches into main's frame

main's frame                    swap_by_pointer's frame
+-------+-------+ <-- &x ------ +-------+
| x = 1 | y = 2 | <-- &y ------ | a | b |   a holds &x, b holds &y
+-------+-------+               +---+---+   *a IS x.  *b IS y.
   changed by *a, *b                dies with the frame — the writes already landed
```

**Part 2 — walk an array without `[]`.**

Step 5. Write this program. The walk uses only `p + i` and `*`; `&a[i]` appears solely as the oracle you check against:

```c
#include <stdio.h>

int main(void)
{
    int a[5] = {10, 20, 30, 40, 50};
    int *p = a;                    /* a decays to &a[0] (full story in I.5) */

    for (int i = 0; i < 5; i++) {
        printf("p + %d = %p   &a[%d] = %p   value = %d\n",
               i, (void *)(p + i), i, (void *)&a[i], *(p + i));
    }
    return 0;
}
```

Step 6. Compile, run, and compare the address columns line by line:

```text
p + 0 = 0x16b922850   &a[0] = 0x16b922850   value = 10
p + 1 = 0x16b922854   &a[1] = 0x16b922854   value = 20
p + 2 = 0x16b922858   &a[2] = 0x16b922858   value = 30
p + 3 = 0x16b92285c   &a[3] = 0x16b92285c   value = 40
p + 4 = 0x16b922860   &a[4] = 0x16b922860   value = 50
```

Every `p + i` lands exactly where `&a[i]` does, 4 bytes per step — `sizeof(int)` on this machine. That identity is not a convenience; it is the definition of `[]` in C: `a[i]` *is* `*(a + i)`. I.5 will make you live in that identity; today, confirm it with your own addresses.

**State the rule, one sentence, out loud:** a function can change a caller's variable only when the caller hands over its address — and `p + i` is `&a[i]`, always.

## Build Task

**Hand-rolled string functions.** From scratch, implement the three functions that C programmers have written in interviews and firmware since 1972: `my_strlen`, `my_strcpy`, `my_strcmp`. These exact names matter — they are the contract I.5's string work and Book II.3's safe re-implementation both refer back to.

**File layout.** Two files, one command:

- `my_string.c` — your implementations, nothing else. No `main`.
- `test_harness.c` — the scored harness, given below in full. Do not modify it.

```sh
cc -std=c11 -Wall -Wextra test_harness.c my_string.c -o test && ./test
```

**Interface (exact signatures):**

```c
size_t my_strlen(const char *s);
char  *my_strcpy(char *dst, const char *src);
int    my_strcmp(const char *a, const char *b);
```

Two type notes so the signatures aren't mysterious. `size_t` is the unsigned size type `sizeof` produces (I.2); string lengths live in it. `const char *` reads "pointer to characters I promise not to modify" — the compiler enforces the promise, and it is how a function advertises which pointers it only reads through.

**Behavioural requirements (match libc):**

- `my_strlen` returns the number of characters before the terminating NUL. The empty string's length is 0.
- `my_strcpy` copies `src` into `dst` *including the terminating NUL*, and returns `dst`.
- `my_strcmp` returns zero for equal strings; otherwise the difference of the first differing characters, compared as `unsigned char` — negative when `a` sorts before `b`, positive when after. Strings differing only in the final byte must return the correct sign (`"abcd"` vs `"abce"`), and a prefix sorts before its extension (`"abc"` < `"abcd"`).

**Constraint (the point of the exercise):** pointer arithmetic only. No array indexing anywhere in the implementation — not `s[i]`, not `dst[i]`, nothing in brackets. Walk with `s++`, compare with `*a` and `*b`, and let `my_strlen` be the one-subtraction function the exposition promised.

**The harness, in full:**

```c
#include <stdio.h>

/* Test harness for the I.3 build task.
 * You implement my_strlen, my_strcpy, my_strcmp — pointer arithmetic only. */

size_t my_strlen(const char *s);
char  *my_strcpy(char *dst, const char *src);
int    my_strcmp(const char *a, const char *b);

#define DST_CAP 16

static int check(const char *name, int ok)
{
    printf("%-40s %s\n", name, ok ? "PASS" : "FAIL");
    return ok;
}

int main(void)
{
    int fails = 0;

    /* --- my_strlen --- */
    fails += !check("strlen(\"\") == 0",         my_strlen("") == 0);
    fails += !check("strlen(\"a\") == 1",        my_strlen("a") == 1);
    fails += !check("strlen(\"hello\") == 5",    my_strlen("hello") == 5);
    fails += !check("strlen(\"bookends\") == 8", my_strlen("bookends") == 8);

    /* --- my_strcmp --- */
    fails += !check("strcmp(\"\", \"\") == 0",        my_strcmp("", "") == 0);
    fails += !check("strcmp(\"abc\", \"abc\") == 0",  my_strcmp("abc", "abc") == 0);
    fails += !check("strcmp(\"abc\", \"abd\") < 0",   my_strcmp("abc", "abd") < 0);
    fails += !check("strcmp(\"abd\", \"abc\") > 0",   my_strcmp("abd", "abc") > 0);
    fails += !check("strcmp(\"abcd\", \"abce\") < 0", my_strcmp("abcd", "abce") < 0);
    fails += !check("strcmp(\"abce\", \"abcd\") > 0", my_strcmp("abce", "abcd") > 0);
    fails += !check("strcmp(\"abc\", \"abcd\") < 0",  my_strcmp("abc", "abcd") < 0);

    /* --- my_strcpy with canaries ---
     * block[] is one contiguous region: canary byte, DST_CAP bytes of
     * destination, canary byte. dst is NOT the whole block; if your copy
     * writes past the destination's declared size, a canary dies. */
    char block[DST_CAP + 2];
    char *dst = block + 1;

    block[0]           = '\xAA';   /* front canary */
    block[DST_CAP + 1] = '\xAA';   /* back canary  */
    for (int i = 0; i < DST_CAP; i++)
        dst[i] = '\xCC';           /* poison, so a missing NUL is visible */

    const char *src = "firmware";
    char *ret = my_strcpy(dst, src);

    fails += !check("strcpy returns dst",    ret == dst);
    fails += !check("front canary intact",   block[0] == (char)'\xAA');
    fails += !check("back canary intact",    block[DST_CAP + 1] == (char)'\xAA');
    fails += !check("content matches",       my_strcmp(dst, src) == 0);
    fails += !check("copied length",         my_strlen(dst) == my_strlen(src));

    /* Second copy: a source that fills the destination exactly
     * (DST_CAP - 1 chars + NUL). One byte of overflow here kills a canary. */
    const char *full = "0123456789abcde";    /* exactly 15 chars */
    for (int i = 0; i < DST_CAP; i++)
        dst[i] = '\xCC';

    ret = my_strcpy(dst, full);
    fails += !check("full-fit: returns dst",         ret == dst);
    fails += !check("full-fit: front canary intact", block[0] == (char)'\xAA');
    fails += !check("full-fit: back canary intact",  block[DST_CAP + 1] == (char)'\xAA');
    fails += !check("full-fit: content matches",     my_strcmp(dst, full) == 0);

    if (fails == 0)
        printf("ALL TESTS PASS\n");
    return fails;
}
```

Read the canary block until you could redraw it: the destination's declared size is `DST_CAP`, but the memory around it is instrumented — a byte before, a byte after, poison inside. A correct run on this machine looked like this:

```text
strlen("") == 0                          PASS
strlen("a") == 1                         PASS
strlen("hello") == 5                     PASS
strlen("bookends") == 8                  PASS
strcmp("", "") == 0                      PASS
strcmp("abc", "abc") == 0                PASS
strcmp("abc", "abd") < 0                 PASS
strcmp("abd", "abc") > 0                 PASS
strcmp("abcd", "abce") < 0               PASS
strcmp("abce", "abcd") > 0               PASS
strcmp("abc", "abcd") < 0                PASS
strcpy returns dst                       PASS
front canary intact                      PASS
back canary intact                       PASS
content matches                          PASS
copied length                            PASS
full-fit: returns dst                    PASS
full-fit: front canary intact            PASS
full-fit: back canary intact             PASS
full-fit: content matches                PASS
ALL TESTS PASS
```

To prove the canary is alive and not decoration: a version of `my_strcpy` with one extra write past the terminator — a single `*d = '\0';` after the copy loop — passed every content check and still failed:

```text
full-fit: back canary intact             FAIL
```

with a nonzero exit status. The full-fit source exists precisely so that one byte of overflow has nowhere to hide.

**Scoring criteria:**

| criterion | what "pass" means |
|---|---|
| libc behaviour on the vector set | every `my_strlen`/`my_strcmp` check passes, including the empty string and strings differing only at the last byte |
| pointer arithmetic only | no `[` or `]` in `my_string.c`; the walk is `p++` and `*p` |
| `my_strcpy` respects the declared size | both canary checks pass on both copies — the destination's `DST_CAP` bytes and nothing beyond them |
| clean build | `cc -std=c11 -Wall -Wextra` compiles both files warning-free, and a passing run exits 0 |

**Stretch goals.** (1) Add `my_strncmp(const char *a, const char *b, size_t n)` — same contract, but never compare more than `n` characters — and extend the harness to cover the tricky edge: strings equal for `n` bytes that differ at `n + 1`. (2) Rebuild the harness with `-fsanitize=address` (a preview of I.7's toolchain) and confirm a deliberately planted off-by-one in your copy loop is caught *by the sanitizer* as well as by the canary. Two tripwires for the same bug — get used to that belt-and-suspenders posture; it is the book's default from I.7 onward.

## Why This Matters for Your Roadmap

Foundational — and say it plainly: this is the single highest-rep module in the book. There is no direct OT hook to wire here, and inventing one would be dishonest; the hook is indirect but total. Firmware is pointer code. Every module after this one presumes it: I.4's `malloc` hands you a raw address and a lifetime to manage, I.5's buffers are pointers plus a length you must enforce yourself, I.6's wire-format parsing is pointer arithmetic over bytes, I.7's dispatch tables are addresses of functions, and I.8's whole UB catalogue is the list of ways an address can lie to you. The reps below are not a suggestion — they are the spaced re-exposure that decides whether I.4 through I.8 are learnable at all.

## Reps

Run these before I.4, and again before I.7. From memory, not by scrolling up.

1. Write `swap_by_pointer` and `my_strlen` from a blank file, compile, run against the harness. If you peeked, do it again tomorrow.
2. Predict-then-run: on paper, predict all six addresses and both values of the `arith.c` program before compiling; check the deltas against `sizeof` afterwards.
3. Recreate `dangle.c` from memory; predict the `-O0` and `-O2` outputs (including *that they may differ*) before you compile either.
4. Draw the `argv` three-level diagram (slots, pointers, strings) from memory; then run `argv_pp hello world` and annotate your drawing with the real addresses.
5. Read your own `my_strcpy` and narrate it aloud, one line per statement: which pointer moves, which byte is written, when the loop stops. Feynman it — if the narration stalls, that line isn't learned yet.

## Deferred

**Function pointers** — a function's address as a value you can store, pass, and call through — land in **I.7**, where they arrive with callbacks and the test-harness dispatch table that needs them. Everything else you might expect here and didn't see (`const`-correctness in depth, `restrict`, pointer-to-array types, multi-dimensional arrays) is either I.5's array-decay material or deliberately out of scope for the machine-model tier. You have what the next five modules need. Rep this chapter until the two operators feel like punctuation, then go meet the heap.
