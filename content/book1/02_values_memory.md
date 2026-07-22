# I.2 · Values and the shape of memory

> **Level:** L0→L1 · **Prerequisites:** I.1
> **You will be able to:** choose integer types by width and signedness on purpose, predict what any integer expression does to the bits, and spot the two conversion traps that turn arithmetic into vulnerabilities.

## Cold Open

One pattern of 32 bits, read three ways. Write `coldopen.c`:

```c
#include <stdint.h>
#include <stdio.h>

int main(void)
{
    uint32_t bits = 0xFFFFFFFFu;

    printf("as unsigned: %u\n", bits);
    printf("as signed:   %d\n", (int32_t)bits);

    unsigned char *p = (unsigned char *)&bits;
    printf("as bytes:    ");
    for (int i = 0; i < 4; i++) {
        printf("%02x ", p[i]);
    }
    printf("\n");

    printf("as chars:    ");
    for (int i = 0; i < 4; i++) {
        printf("%c", p[i]);
    }
    printf("\n");

    return 0;
}
```

Compile and run it:

```sh
cc -std=c11 -Wall -Wextra coldopen.c -o coldopen
./coldopen
```

Observed output:

```text
as unsigned: 4294967295
as signed:   -1
as bytes:    ff ff ff ff
as chars:    ÿÿÿÿ
```

(The last line prints four copies of byte `0xFF` rendered as a character — on most terminals that shows as `ÿ` or a replacement glyph. The bytes are not printable ASCII; that is fine, they are still characters as far as C is concerned.)

Two things in this listing deserve a look before you move on. First, the cast in `(int32_t)bits`: printing `bits` directly with `%d` would break the format-string contract from I.1 — `%d` is a promise that the argument is an `int`. The cast is how you keep that promise honestly. Second, the `(unsigned char *)&bits` move: you are taking the address of the integer and re-reading those same four bytes through a different lens. Nothing was copied. Nothing was converted. The bits sat still while you changed your mind about them.

All four bytes came out `ff`, so this pattern can't show you byte order. Change the pattern to one with distinct bytes and run again:

```c
#include <stdint.h>
#include <stdio.h>

int main(void)
{
    uint32_t bits = 0x00000041u;  /* 65: printable as 'A' */

    printf("as unsigned: %u\n", bits);
    printf("as signed:   %d\n", (int32_t)bits);

    unsigned char *p = (unsigned char *)&bits;
    printf("byte[0] as char: %c\n", p[0]);
    printf("byte order:      %02x %02x %02x %02x\n", p[0], p[1], p[2], p[3]);

    return 0;
}
```

```text
as unsigned: 65
as signed:   65
byte[0] as char: A
byte order:      41 00 00 00
```

The byte holding `0x41` — the *least significant* byte, the 'A' — sits at the lowest address, `byte[0]`. On this machine (Apple silicon, and on every x86-64 you will touch), the little end of the number comes first in memory: **little-endian**. Other machines put the big end first. File that away; it is an observation about this machine, not a law, and it will matter when you parse wire formats in I.6.

What just happened: 32 bits were stored once and produced `4294967295`, `-1`, four raw bytes, and four characters depending on which type you read them through. The bits do not know what they mean. A value in C is never just a bit pattern — it is a bit pattern *plus a type*, and the type is the entire interpretation. This module is about what types actually commit you to: a fixed width, an encoding for negatives, and a set of arithmetic rules with two well-placed traps.

## Fixed-width integers and `sizeof`

In I.1 you met `int`, `double`, and `char` as storage commitments. Here is the problem with the classic integer types: the standard does not fix their widths. It promises minimums — `char` is at least 8 bits, `short` at least 16, `int` at least 16, `long` at least 32 — and lets each platform choose. An `int` is 32 bits on every machine you are likely to touch, but `long` is 64 bits on this Mac and 32 bits on 64-bit Windows. Code that assumes a width and moves between platforms is a portability bug waiting for a network.

The fix, since C99, is `<stdint.h>` — the fixed-width types:

| Type | Width | Range |
|---|---|---|
| `int8_t` / `uint8_t` | 8 bits | −128 … 127 / 0 … 255 |
| `int16_t` / `uint16_t` | 16 bits | −32,768 … 32,767 / 0 … 65,535 |
| `int32_t` / `uint32_t` | 32 bits | −2,147,483,648 … 2,147,483,647 / 0 … 4,294,967,295 |
| `int64_t` / `uint64_t` | 64 bits | ≈ −9.2×10¹⁸ … 9.2×10¹⁸ / 0 … ≈ 1.8×10¹⁹ |

The pattern in the ranges is the whole story of this module: an *n*-bit unsigned type holds `0 … 2ⁿ−1`; an *n*-bit signed type holds `−2ⁿ⁻¹ … 2ⁿ⁻¹−1`. Memorize the shape of that table, not the digits. When you write a size, a length, a count of bytes, or a value read from a wire format, you choose one of these types deliberately — the width is part of the design, and so is the signedness.

You never have to guess how big anything is. `sizeof` is an operator (not a function) that answers in bytes, at compile time, for any type or object. Its result has type `size_t`, printed with `%zu`. Run the survey:

```c
#include <stdint.h>
#include <stdio.h>

int main(void)
{
    printf("sizeof(char)      = %zu\n", sizeof(char));
    printf("sizeof(short)     = %zu\n", sizeof(short));
    printf("sizeof(int)       = %zu\n", sizeof(int));
    printf("sizeof(long)      = %zu\n", sizeof(long));
    printf("sizeof(long long) = %zu\n", sizeof(long long));
    printf("sizeof(void *)    = %zu\n", sizeof(void *));
    printf("sizeof(size_t)    = %zu\n", sizeof(size_t));
    printf("\n");
    printf("sizeof(int8_t)    = %zu\n", sizeof(int8_t));
    printf("sizeof(uint8_t)   = %zu\n", sizeof(uint8_t));
    printf("sizeof(int16_t)   = %zu\n", sizeof(int16_t));
    printf("sizeof(uint16_t)  = %zu\n", sizeof(uint16_t));
    printf("sizeof(int32_t)   = %zu\n", sizeof(int32_t));
    printf("sizeof(uint32_t)  = %zu\n", sizeof(uint32_t));
    printf("sizeof(int64_t)   = %zu\n", sizeof(int64_t));
    printf("sizeof(uint64_t)  = %zu\n", sizeof(uint64_t));
    return 0;
}
```

On this machine:

```text
sizeof(char)      = 1
sizeof(short)     = 2
sizeof(int)       = 4
sizeof(long)      = 8
sizeof(long long) = 8
sizeof(void *)    = 8
sizeof(size_t)    = 8

sizeof(int8_t)    = 1
sizeof(uint8_t)   = 1
sizeof(int16_t)   = 2
sizeof(uint16_t)  = 2
sizeof(int32_t)   = 4
sizeof(uint32_t)  = 4
sizeof(int64_t)   = 8
sizeof(uint64_t)  = 8
```

Read the survey, don't skim it. The fixed-width block is boring by design — `int32_t` is 4 bytes everywhere it exists; that is the point of it. The classic block is where the information lives: `long` is 8 bytes here, a pointer is 8 bytes, and `size_t` — the type every length, count, and allocation size in the standard library uses — is 8 bytes, matching the pointer. That alignment is what a "64-bit machine" means in practice: pointers and the sizes of memory objects are 64 bits wide. `sizeof(void *)` is 8 here; on a 32-bit embedded target it is 4, and `size_t` shrinks with it. When you size buffers in I.5 and I.6, `size_t` is the type that will hold those sizes, and its width is the machine's width.

Two habits start now. Use the fixed-width types whenever the width matters — which is whenever data crosses a boundary: a file, a network frame, a register map, an API with a fixed contract. And use `sizeof` on the *object* (`sizeof x`) rather than the type (`sizeof(int32_t)`) where you can, so the code stays correct when the type changes.

## Two's complement and signedness

Why is `-1` the same bits as `4294967295`? Because of how negatives are encoded. Every machine you will program uses **two's complement**: to negate a number, invert every bit and add one. Here it is, done by hand at the bit level:

```c
#include <stdint.h>
#include <stdio.h>

static void print_bits(uint32_t v)
{
    for (int i = 31; i >= 0; i--) {
        putchar((v >> i & 1u) ? '1' : '0');
        if (i % 8 == 0 && i != 0) {
            putchar(' ');
        }
    }
}

int main(void)
{
    int32_t five = 5;
    int32_t neg_five = -5;

    printf(" 5: ");
    print_bits((uint32_t)five);
    printf("\n-5: ");
    print_bits((uint32_t)neg_five);
    printf("\n\n");

    /* two's complement by hand: invert all bits, add one */
    uint32_t inverted = ~(uint32_t)five;
    uint32_t negated = inverted + 1u;
    printf("~5 + 1 as unsigned bits: ");
    print_bits(negated);
    printf("\n");
    printf("same bits as -5?         %s\n",
           negated == (uint32_t)neg_five ? "yes" : "no");
    printf("\n");

    /* the asymmetry: INT32_MIN has no positive partner */
    printf("INT32_MAX = %d\n", INT32_MAX);
    printf("INT32_MIN = %d\n", INT32_MIN);
    uint32_t pos_mag = -(uint32_t)INT32_MIN; /* negate in unsigned: defined */
    printf("|INT32_MIN| = %u -- one more than INT32_MAX\n", pos_mag);
    printf("INT32_MAX + 1 (unsigned math) = %u\n",
           (uint32_t)INT32_MAX + 1u);

    return 0;
}
```

```text
 5: 00000000 00000000 00000000 00000101
-5: 11111111 11111111 11111111 11111011

~5 + 1 as unsigned bits: 11111111 11111111 11111111 11111011
same bits as -5?         yes

INT32_MAX = 2147483647
INT32_MIN = -2147483648
|INT32_MIN| = 2147483648 -- one more than INT32_MAX
INT32_MAX + 1 (unsigned math) = 2147483648
```

Three properties of this encoding do all the work. First, negation is symmetric and mechanical: `~x + 1` gets you `-x`, for every value but one. Second, the top bit is set on every negative — you will hear it called the "sign bit," but do not picture a flag stapled onto a magnitude. In two's complement, the top bit contributes `−2³¹` to the value, which is why `1111...1111` is `−1` and not "negative zero." There is exactly one zero, and it is all zeros. Third, the range is asymmetric: with 32 bits you get one more negative value than positive. `INT32_MIN` is `−2147483648`; its positive partner, `+2147483648`, does not fit in `int32_t`. That is why the last computation above was done in *unsigned* arithmetic, where the rules are clean.

The asymmetry has a live consequence: **negating `INT32_MIN` has no representable answer**. `-INT32_MIN` cannot be an `int32_t`. In signed arithmetic that is undefined behaviour — not "a strange value," but a broken promise the compiler is entitled to exploit. Flag it now; I.8 owns the full treatment of what the optimizer may do with that entitlement. The practical rule for this module: if you ever need the magnitude of a value that might be `INT_MIN`, do the negation in the corresponding unsigned type, where the answer is defined, as the listing does.

The mental model to keep: the `2³²` patterns of a 32-bit word are a circle. Unsigned interpretation cuts the circle between `4294967295` and `0`. Signed interpretation cuts it between `2147483647` and `−2147483648`. Same circle, same bits, different cut — and arithmetic moves you around the circle regardless of where you cut it. Everything surprising in this module is that picture, seen from the wrong side of the cut.

## Overflow, wraparound, conversion

Add one to the largest value a type can hold and you have **overflow**. What happens next depends entirely on signedness, and this is the load-bearing fact of the module:

- **Unsigned arithmetic is defined to wrap.** It is arithmetic modulo 2ⁿ, always, by the standard. `UINT32_MAX + 1` is `0`. `0u - 1u` is `UINT32_MAX`. No exceptions, no maybes.
- **Signed overflow is undefined behaviour.** The standard does not say what `INT32_MAX + 1` is. It says the program has no meaning at that point — the compiler may assume it never happens.

Run both:

```c
#include <stdint.h>
#include <stdio.h>

int main(void)
{
    /* unsigned wraparound: DEFINED by the standard (modulo 2^32) */
    volatile uint32_t umax = UINT32_MAX;
    uint32_t wrapped = umax + 1u;
    printf("UINT32_MAX     = %u\n", umax);
    printf("UINT32_MAX + 1 = %u   (defined: wraps mod 2^32)\n", wrapped);
    printf("\n");

    /* signed overflow: UNDEFINED BEHAVIOUR. What you see here is
       what this compiler, on this machine, at this -O level, did.
       The standard permits anything. Owned properly in I.8. */
    volatile int32_t smax = INT32_MAX;
    int32_t sover = smax + 1;
    printf("INT32_MAX      = %d\n", smax);
    printf("INT32_MAX + 1  = %d   (UB: observed value, not a promise)\n", sover);

    return 0;
}
```

(The `volatile` qualifier forces the addition to happen at run time, so the compiler cannot fold the constants at compile time and hide what the machine actually does.) Compiled and run at both `-O0` and `-O2`:

```text
UINT32_MAX     = 4294967295
UINT32_MAX + 1 = 0   (defined: wraps mod 2^32)

INT32_MAX      = 2147483647
INT32_MAX + 1  = -2147483648   (UB: observed value, not a promise)
```

On this machine, at both optimization levels, the signed addition happened to wrap to `INT32_MIN` — the hardware's adder does the same thing either way. Do not learn that as the rule. The value you observed is an artifact of this compiler, this target, this day. The standard's answer is "undefined," and undefined means the compiler may *reason* about your code under the assumption that signed overflow never occurs — deleting checks, reordering loops, proving things that are false of the bits. I.8 opens by making that concrete: you will write a signed-overflow guard and watch the optimizer delete it. For now, hold two facts: unsigned wraps, always and legally; signed overflow is a hole in the floor, and you write code that never steps in it.

The second trap is quieter, because no value goes out of range at all. When an expression mixes signed and unsigned operands of the same rank — an `int` and an `unsigned int` — the **usual arithmetic conversions** convert the signed operand to unsigned before the operation. The bits don't change; the interpretation does, and `-1` becomes the largest value in the type. Run it:

```c
#include <stdio.h>
#include <stdint.h>

int main(void)
{
    printf("-1 < 1   -> %d  (both int: ordinary signed compare)\n", -1 < 1);
    printf("-1 < 1U  -> %d  (int vs unsigned int: the trap)\n", -1 < 1U);
    printf("\n");

    unsigned u = -1;   /* converting -1 into unsigned: defined */
    printf("(unsigned)-1 = %u\n", u);
    printf("UINT_MAX     = %u\n", UINT32_MAX);
    printf("same value?  %s\n", u == UINT32_MAX ? "yes" : "no");
    printf("\n");

    int a = -1;
    unsigned b = 1;
    printf("a + b = %u  (a converted to %u, then +1 wraps to 0)\n",
           (unsigned)(a + b), (unsigned)a);

    return 0;
}
```

```text
-1 < 1   -> 1  (both int: ordinary signed compare)
-1 < 1U  -> 0  (int vs unsigned int: the trap)

(unsigned)-1 = 4294967295
UINT_MAX     = 4294967295
same value?  yes

a + b = 0  (a converted to 4294967295, then +1 wraps to 0)
```

Read the middle block first: converting `-1` to unsigned is *defined* (the standard pins it: add 2³² until in range), and it produces `4294967295`. Now the first block makes sense — `-1 < 1U` converts the `-1` to `4294967295` and then asks whether `4294967295 < 1`, which is false. The comparison answered a question you didn't ask. And in the last line, `a + b` converted `a` to `4294967295` and added `1` — defined unsigned wraparound, landing on `0`. Every step was legal, defined, and wrong relative to intent.

One more rule sits underneath both traps and will stay with you: before any arithmetic or comparison, operands of types narrower than `int` (like `uint8_t`) are promoted to `int` first. That is why `uint8_t` arithmetic doesn't wrap at 255 — it happens in `int` and narrows on assignment. The promotions are mostly invisible; the signed/unsigned conversion is not. The defensive habit that covers all of it: **never mix signedness in one expression without an explicit cast and a written reason.** Pick the signedness at the design level — sizes and counts unsigned (`size_t`), values that can legitimately go negative signed — and convert at exactly one documented boundary.

## The Seam

Integer overflow is not a curiosity. It is a **bug primitive** — a small, well-defined misbehaviour that composes into the big bug classes. The composition you need to see now is the three-step chain: a size computation that wraps becomes an **under-allocation** (you asked for `n * sizeof(rec)` bytes, the product wrapped, you got a small buffer), which becomes an **overflowed buffer** (you write `n` records into a buffer that holds three), which becomes memory corruption. That chain has a name in this book: it is the setup for **the I.5 overflow**, where you will smear a buffer on purpose and watch it clobber its neighbour, and Book III.2 revisits the same artifact read as an attacker. The integer bug is the quiet first domino; the buffer overflow is the loud last one. When you reach I.7, UBSan is the tool that makes this module's sins loud at run time — keep that in mind as the standing answer to "how would I ever catch these."

The comparison trap has its own kill record, and it is worth watching one die. The pattern: a lower layer signals failure with a negative sentinel; an upper layer checks "do we have enough bytes?" with a mixed-sign comparison. Write `seam.c`:

```c
#include <stdio.h>
#include <stdint.h>

/* A frame handler: 'remaining' comes from a lower layer that uses -1
   as its error sentinel for a truncated read. 'needed' is the size of
   the record we are about to parse. */
static int frame_ok(int remaining, unsigned needed)
{
    /* intent: "only parse if we have enough bytes" */
    if (remaining >= needed) {
        return 1;   /* enough: go ahead */
    }
    return 0;       /* not enough: reject */
}

int main(void)
{
    int remaining = -1;      /* lower layer said: read failed */
    unsigned needed = 24;    /* we want to parse a 24-byte record */

    printf("remaining = %d, needed = %u\n", remaining, needed);
    if (frame_ok(remaining, needed)) {
        printf("check PASSED: handler would parse %u bytes "
               "from a buffer that does not exist\n", needed);
    } else {
        printf("check rejected the frame\n");
    }
    printf("\n");

    /* what the machine compared: */
    printf("remaining converted to unsigned: %u\n", (unsigned)remaining);
    printf("so the comparison was:           %u >= %u\n",
           (unsigned)remaining, needed);

    return 0;
}
```

Compile and run:

```text
seam.c:10:19: warning: comparison of integers of different signs: 'int' and 'unsigned int' [-Wsign-compare]
   10 |     if (remaining >= needed) {
      |         ~~~~~~~~~ ^  ~~~~~~
1 warning generated.
remaining = -1, needed = 24
check PASSED: handler would parse 24 bytes from a buffer that does not exist

remaining converted to unsigned: 4294967295
so the comparison was:           4294967295 >= 24
```

The bounds check — the entire defence between this program and parsing memory it does not own — passed a failed read straight through, because `-1 >= 24U` compared `4294967295 >= 24`. In real code the next line is a `memcpy` or a parse loop, and the program reads or writes past the end of a real buffer. This exact shape — a signed error sentinel meeting an unsigned size in a comparison — is a recurring pattern in vulnerability advisories, precisely because it survives casual testing: every non-negative input behaves correctly.

Notice what the compiler did: it warned. `-Wsign-compare` fired under `-Wextra` and named the exact line and the exact sin. The check died anyway, because a warning you ignore is a bug you ship. This is why "compiles warning-free under `cc -Wall -Wextra`" is a scoring criterion on every build task in this book, not a style preference.

The fix is to validate in the domain where the value's meaning lives, before any conversion: `if (remaining >= 0 && (unsigned)remaining >= needed)`. Negative is rejected as itself; only a validated non-negative value crosses into unsigned, and the cast makes the crossing explicit. That one-line shape — check signedness first, then convert deliberately — closes this trap everywhere it appears.

## Lab

Three short experiments, each with a prediction step. The predicting is the exercise; the running is the grading.

**Step 1 — Survey your machine.** Write the `sizeof` survey from the *Fixed-width integers* section above (retype it, don't paste it), compile with `cc -std=c11 -Wall -Wextra`, and run it. Before running, write down your guesses for `sizeof(int)`, `sizeof(long)`, and `sizeof(void *)`. Compare against the output shown in that section — on this machine they are 4, 8, and 8. If you are ever on a different machine, rerun the survey there and note what moved; `int` and the fixed-width types won't, `long` and pointers can.

**Step 2 — Force the wrap, predict first.** Write `lab_wrap.c`:

```c
#include <stdint.h>
#include <stdio.h>

int main(void)
{
    uint32_t u = UINT32_MAX;

    /* Write down your three predictions BEFORE running this. */
    printf("UINT32_MAX     = %u\n", u);
    printf("UINT32_MAX + 1 = %u\n", u + 1u);
    printf("UINT32_MAX + 2 = %u\n", u + 2u);
    printf("0u - 1u        = %u\n", 0u - 1u);
    return 0;
}
```

Write your four predictions on paper. Then compile and run:

```text
UINT32_MAX     = 4294967295
UINT32_MAX + 1 = 0
UINT32_MAX + 2 = 1
0u - 1u        = 4294967295
```

Every answer is arithmetic mod 2³²: `4294967295 + 1 ≡ 0`, `+ 2 ≡ 1`, and `0 − 1 ≡ 4294967295`. If any prediction was wrong, redo the mod-2³² arithmetic by hand until the circle picture from the two's complement section is doing the work for you.

**Step 3 — The comparison trap, predict first.** Write `lab_cmp.c`:

```c
#include <stdio.h>

int main(void)
{
    /* Predict each line: 0 or 1? Write your answers down first. */
    printf("(a) -1 < 1    -> %d\n", -1 < 1);
    printf("(b) -1 < 1U   -> %d\n", -1 < 1U);
    printf("(c) -1 > 1U   -> %d\n", -1 > 1U);

    int  s = -1;
    unsigned u = 1;
    printf("(d) s < u     -> %d\n", s < u);
    printf("(e) s + u     -> %u\n", s + u);
    return 0;
}
```

Predict all five. Then compile and run:

```text
lab_cmp.c:12:39: warning: comparison of integers of different signs: 'int' and 'unsigned int' [-Wsign-compare]
(a) -1 < 1    -> 1
(b) -1 < 1U   -> 0
(c) -1 > 1U   -> 1
(d) s < u     -> 0
(e) s + u     -> 0
```

(a) is the only ordinary comparison: two `int`s, `-1 < 1`, true. Every other line converted the signed operand to unsigned first: `-1` became `4294967295`, which is neither less than `1` (b, d) nor, added to `1`, anything but a wrapped `0` (e). Note also that the compiler warned only on (d): comparisons of literals are folded silently, but the variable comparison earned `-Wsign-compare`. The warning is the smoke alarm for this entire bug class.

Close the lab by stating the rule, in one sentence, in your notes: **when a signed and an unsigned operand of the same rank meet in an arithmetic or comparison expression, the signed operand is converted to unsigned — so `-1` becomes the largest value in the type, and the expression answers a question you didn't ask.**

## Build Task

**The fixed-point money calculator** — a program called `money` that does decimal currency arithmetic in integer cents, with no floating point anywhere.

**Interface.** Single file, `money.c` (multi-file programs arrive in I.7). The arithmetic core is four functions with exactly these signatures:

```c
typedef enum { MONEY_OK = 0, MONEY_UNREPRESENTABLE = 1 } money_status;

money_status cents_add(int64_t a, int64_t b, int64_t *out);
money_status cents_sub(int64_t a, int64_t b, int64_t *out);
money_status cents_mul(int64_t a, int64_t qty, int64_t *out);
money_status cents_div(int64_t a, int64_t parts, int64_t *out, int64_t *rem);
```

All amounts are `int64_t` **cents**: `$12.34` is `1234`, `−$5.00` is `−500`. `cents_mul` computes `a * qty` (price times quantity). `cents_div` splits `a` cents into `parts` equal shares: `*out` gets the share in cents, truncated toward zero, and `*rem` gets the leftover cents. Every function detects overflow *before* it happens and returns `MONEY_UNREPRESENTABLE` without writing a wrapped value to `*out`.

The CLI parses its operands from text — never through a floating-point type:

```sh
money add 19.99 0.01        # prints: 20.00
money sub 0.00 0.01         # prints: -0.01
money mul 12.99 3           # prints: 38.97
money div 10.00 3           # prints: 3.33 rem 0.01
money add 92233720368547758.07 0.01   # prints: result unrepresentable
```

Your parser accepts an optional leading `-`, one or more digits, and an optional `.` followed by exactly one or two digits (`12.3` means `12.30`). Anything else — empty strings, letters, a second `.` — is rejected with a usage message and a nonzero exit, not a crash.

**Behavioural requirements.**

- The scaling is documented in exactly one comment block at the top of the file: what one unit of the integer means, why cents, and the division truncation rule.
- Division by `parts == 0` reports `result unrepresentable` (a split into zero shares has no answer), as does any genuine overflow.
- Output is always printed from cents: format as `d.cc` yourself, with exactly two fraction digits, including for negative amounts.

**Test vector set.** Your program must produce exactly these results:

| Command | Expected output |
|---|---|
| `add 19.99 0.01` | `20.00` |
| `add -5.00 -7.50` | `-12.50` |
| `sub 0.00 0.01` | `-0.01` |
| `sub -12.50 -7.50` | `-5.00` |
| `mul 12.99 3` | `38.97` |
| `mul -4.25 4` | `-17.00` |
| `mul 0.01 100` | `1.00` |
| `div 10.00 3` | `3.33 rem 0.01` |
| `div -10.00 3` | `-3.33 rem -0.01` |
| `div 0.05 2` | `0.02 rem 0.01` |
| `add 92233720368547758.07 0.01` | `result unrepresentable` |
| `mul 1.00 9223372036854775807` | `result unrepresentable` |
| `mul 92233720368547758.07 2` | `result unrepresentable` |
| `div 10.00 0` | `result unrepresentable` |

(The large addend in the overflow row is `INT64_MAX` cents: `$92,233,720,368,547,758.07`. One more cent cannot exist in the type. Your check must catch it *before* adding, and the program must not print a wrapped number.)

**Constraints.**

- The strings `float` and `double` do not appear in the source. The grader greps.
- No reliance on types wider than `int64_t`; the overflow checks work within the type.

**Scoring criteria** (verbatim from the syllabus, as a rubric):

| Criterion | Pass looks like |
|---|---|
| No `float` or `double` in the source; scaling is explicit and documented in one comment block. | Grep finds neither keyword; the comment block states the unit, the choice, and the division rule. |
| Correct results on the provided test vector set, including negative amounts. | Every row of the table matches exactly, byte for byte. |
| Overflow is detected and reported ("result unrepresentable"), never silently wrapped. | The overflow rows print the message and exit nonzero; no input exists that produces a wrapped total. |

**Stretch goals.**

1. Add a `rate` operation: `money rate 199.99 825` computes 8.25% of an amount in cents, staying integral end to end (basis points, multiply-then-divide, documented rounding). Watch the order of operations — multiply first, or you lose the cents.
2. Make `div` rounding selectable: truncation (as specified) versus half-up, chosen by a flag, with the rule printed in the output.

## Why This Matters for Your Roadmap

Foundational, and said plainly: register widths, two's complement, and conversion rules are the water firmware swims in — every length field in every Modbus frame and every bounds check in every PLC runtime is this module's arithmetic. There is no direct roadmap hook to invent here. The connection arrives when this exact bug class becomes the vulnerability taxonomy in Book III, and when UBSan in I.7 makes these sins loud on demand.

## Reps

- From memory, write the bit-pattern printer; print `-1` as bits and confirm it equals `UINT32_MAX`'s pattern. No peeking at the listing until yours runs.
- Rewrite the `sizeof` survey from memory; diff your output against the saved output from the lab. Add one line: predict `sizeof(long)` on 64-bit Windows (4), then verify when you next can.
- Predict-then-run, five fresh expressions you invent yourself: two unsigned wraps, two mixed-sign comparisons, one `0u - 1u` variant. Written predictions first, run second, grade yourself.
- Open `<stdint.h>` on your machine (`cc -E` on an empty file with the include, or find the header) and trace where `int32_t` actually comes from.
- Recite the lab's one-sentence conversion rule aloud, once, before you start I.3.

## Deferred

Floating-point representation — sign, exponent, mantissa, rounding, NaN, and why `0.1 + 0.2 != 0.3` — is deferred. You will use `double` pragmatically where a syllabus task calls for it (the I.1 converter did), and no more. The fixed-point discipline you just practiced — integers with an explicit, documented scale — is how you avoid needing the floating-point lecture at all in the domains this roadmap cares about.
