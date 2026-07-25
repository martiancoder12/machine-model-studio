# I.6 · Structs and composing data

> **Level:** L2 · **Prerequisites:** I.1–I.5 (I.4's ownership rules and I.5's buffer discipline are load-bearing here)
> **You will be able to:**
> - Read any struct's real memory layout with `offsetof` and `sizeof`, and shrink it by reordering members.
> - Parse a byte-oriented wire header field by field, without casting, and state why the cast is wrong.
> - Build a tagged union whose access is guarded and whose ownership honours I.4's rules.

## Cold Open

Declare a struct with a `char`, an `int`, and another `char`. Before you run anything, predict its size. One plus four plus one: six bytes. Write this:

```c
#include <stdio.h>
#include <stddef.h>

struct Reading {
    char sensor_id;   /* 1 byte  */
    int  value;       /* 4 bytes */
    char status;      /* 1 byte  */
};

int main(void)
{
    printf("sizeof(char)           = %zu\n", sizeof(char));
    printf("sizeof(int)            = %zu\n", sizeof(int));
    printf("sizeof(struct Reading) = %zu\n", sizeof(struct Reading));
    printf("offsetof(sensor_id)    = %zu\n", offsetof(struct Reading, sensor_id));
    printf("offsetof(value)        = %zu\n", offsetof(struct Reading, value));
    printf("offsetof(status)       = %zu\n", offsetof(struct Reading, status));
    return 0;
}
```

Compile and run it:

```sh
cc -std=c11 -Wall -Wextra coldopen.c -o coldopen
./coldopen
```

```text
sizeof(char)           = 1
sizeof(int)            = 4
sizeof(struct Reading) = 12
offsetof(sensor_id)    = 0
offsetof(value)        = 4
offsetof(status)       = 8
```

Six bytes of content. Twelve bytes of struct. And the `offsetof` output is the real surprise: `value` does not sit at offset 1, where you put it second; it sits at offset 4. Three bytes separate `sensor_id` from `value`, and three more trail `status` — bytes the compiler inserted that you never declared and can never name.

What just happened: the machine has opinions about where fields may sit, and those opinions are not yours. The compiler placed each member where the hardware wants it and billed you for the empty space in between. That empty space has a name — padding — and the rule that generates it has a name — alignment — and you just watched both of them cost you half a struct. The exposition explains the rule; the lab makes you wield it.

## Layout, Padding, Alignment

A struct is not a bag of members. It is a contiguous region of storage with a fixed, compiler-chosen map, and the map is derived from three rules:

1. **Every type has an alignment.** A value of that type may only sit at an address that is a multiple of its alignment. On this machine: `char` aligns to 1 (any address), `int` to 4, `double` and every pointer to 8.
2. **Each member is placed at the next offset that satisfies its alignment**, counting from the start of the struct. If the current offset is not a multiple of the member's alignment, the compiler inserts padding until it is.
3. **The struct's own alignment is the maximum of its members' alignments**, and its total size is rounded up to a multiple of that — so an array of the struct keeps every member aligned in every element.

Apply the rules to `struct Reading` and the cold open stops being surprising. `sensor_id` goes at 0. `value` needs a multiple of 4; the next free offset is 1, so three padding bytes go in and `value` lands at 4. `status` needs a multiple of 1, so it lands at 8. Then the struct's alignment is 4 (the max of 1, 4, 1), so the size rounds up from 9 to 12. Here is the map you just measured, drawn flat:

```text
byte:      0    1  2  3    4  5  6  7    8    9 10 11
         +----+-----------+-----------+----+-----------+
         | id |   pad     |   value   | st | tail pad  |
         +----+-----------+-----------+----+-----------+
                                                sizeof = 12
```

`offsetof(struct T, member)` — from `<stddef.h>` — is the truth-teller here. Never reason about layout from the declaration order alone; measure. When you are reading someone else's struct (and in I.8 you will read structs you didn't write, in code you didn't write), `offsetof` is how you check your mental map against the compiler's.

### Reordering members shrinks the struct

The padding is not fixed cost. It is a consequence of the order you chose. Put the widest members first and the same three fields pack into eight bytes:

```c
#include <stdio.h>
#include <stddef.h>

struct Reading {
    char sensor_id;
    int  value;
    char status;
};

struct ReadingTight {
    int  value;       /* 4 bytes, alignment 4 */
    char sensor_id;   /* 1 byte               */
    char status;      /* 1 byte               */
};

int main(void)
{
    printf("sizeof(struct Reading)      = %zu\n", sizeof(struct Reading));
    printf("sizeof(struct ReadingTight) = %zu\n", sizeof(struct ReadingTight));
    printf("Tight offsets: value=%zu sensor_id=%zu status=%zu\n",
           offsetof(struct ReadingTight, value),
           offsetof(struct ReadingTight, sensor_id),
           offsetof(struct ReadingTight, status));
    return 0;
}
```

```text
sizeof(struct Reading)      = 12
sizeof(struct ReadingTight) = 8
Tight offsets: value=0 sensor_id=4 status=5
```

Same three fields, same semantics, two-thirds the memory:

```text
byte:      0  1  2  3    4    5    6  7
         +-----------+----+----+------+
         |   value   | id | st | pad  |
         +-----------+----+----+------+
                          sizeof = 8
```

The rule of thumb is *order members by descending alignment* — pointers and `double`s first, then `int`s, then `char`s. On a struct you instantiate once, this saves six bytes and matters not at all. In an array of a million records — or a struct that rides in every packet buffer on a constrained device — it is the difference between fitting in cache and not. One caution: reorder for size only when the order is yours to choose. A struct that mirrors a wire format or a hardware register map has its order dictated from outside, and as you are about to see in the seam, that struct should not exist as a struct at all.

## Unions and Type Punning

A union is a struct in which every member sits at offset 0. All members overlap in the same storage; the union's size is the size of its largest member, its alignment the strictest of its members'. At any moment the storage means exactly one thing — the question this module keeps asking is *who decided which*.

Used deliberately, overlap is a legitimate tool. C (unlike C++) explicitly permits *type punning* through a union: you may write one member and read another, and the stored bits are reinterpreted as the new type. That makes a union the sanctioned way to look at the same bits two ways:

```c
#include <stdio.h>
#include <stdint.h>

union Word {
    uint32_t u;
    uint8_t  b[4];
    float    f;
};

int main(void)
{
    union Word w;

    printf("sizeof(union Word) = %zu\n", sizeof(union Word));

    w.u = 0x3F800000u;              /* the IEEE-754 bit pattern for 1.0f */
    printf("as float: %f\n", (double)w.f);

    w.u = 0x01020304u;
    printf("bytes: %02x %02x %02x %02x\n", w.b[0], w.b[1], w.b[2], w.b[3]);
    return 0;
}
```

```text
sizeof(union Word) = 4
as float: 1.000000
bytes: 04 03 02 01
```

Three readings of one 32-bit pattern — I.2's lesson, now with a mechanism. Note the byte order in the last line: `0x01020304` came back as `04 03 02 01`, least-significant byte first. That is this machine's *endianness* showing through the union, and it is exactly why punning is a tool for inspecting your own machine, not a tool for reading other machines' data. (The full endianness treatment is Deferred, deliberately.)

The dangerous version is the same move without the deliberateness. If a union's storage is written as one type and later read as another *because the code lost track of which was written*, you don't have punning — you have type confusion, and the reinterpretation is now a bug, or worse, a primitive someone else steers. The fix is as old as the problem: pair the union with a tag that records which member is live, and never touch the storage except through the tag. That pair — tag plus union — is your build task, and the seam shows what happens without it.

## Bitfields

One more layout mechanism, kept deliberately shallow. A *bitfield* lets you declare a struct member that occupies a stated number of bits, so flags and small enumerations pack into shared storage instead of spending a byte (or four) apiece:

```c
#include <stdio.h>

struct Flags {
    unsigned int active   : 1;
    unsigned int error    : 1;
    unsigned int mode     : 2;
    unsigned int reserved : 4;
};

int main(void)
{
    struct Flags f = {0};

    printf("sizeof(struct Flags) = %zu\n", sizeof(struct Flags));

    f.active = 1;
    f.mode   = 3;
    printf("active=%u error=%u mode=%u\n", f.active, f.error, f.mode);

    f.mode = 4;                    /* 4 does not fit in 2 bits */
    printf("after mode=4: mode=%u\n", f.mode);
    return 0;
}
```

Compiling this one *intentionally* provokes a warning — read it, because it tells you exactly what a bitfield does with a value that doesn't fit:

```text
bitfields.c:20:12: warning: implicit truncation from 'int' to bit-field
      changes value from 4 to 0 [-Wbitfield-constant-conversion]
    f.mode = 4;                    /* 4 does not fit in 2 bits */
           ^ ~
```

```text
sizeof(struct Flags) = 4
active=1 error=0 mode=3
after mode=4: mode=0
```

Eight declared bits lived in a four-byte `unsigned int` storage unit, and `4` (`100` in binary) lost its top bit on the way into a two-bit field, arriving as `0`. That is the whole mechanism: the compiler carves a storage unit into bit ranges and generates the masking and shifting for you.

Why shallow: which end of the storage unit the first field occupies, whether plain `int` bitfields are signed, and how fields straddle unit boundaries are all implementation-defined. Two compilers can lay the *same* bitfield struct out differently, which makes bitfields fine for internal flags and worthless as a wire format. Details and the portability rules are in Deferred; the lab's parse will not use them, on purpose.

## Opaque Pointers and Encapsulation

The last composition tool is not about layout at all — it is about *hiding* layout. C has no `private` keyword, but it has one real information-hiding mechanism: hand the caller a pointer to a struct whose definition they never see.

The header publishes only the *declaration* and the functions:

```c
/* counter.h */
#ifndef COUNTER_H
#define COUNTER_H

typedef struct Counter Counter;   /* the caller never sees the definition */

Counter *counter_new(int start);
void     counter_inc(Counter *c);
int      counter_get(const Counter *c);
void     counter_free(Counter *c);

#endif
```

The definition lives in the implementation file, alone:

```c
/* counter.c */
#include <stdlib.h>
#include "counter.h"

struct Counter {          /* the definition lives here, and only here */
    int n;
};

Counter *counter_new(int start)
{
    Counter *c = malloc(sizeof *c);
    if (c)
        c->n = start;
    return c;
}

void counter_inc(Counter *c)      { c->n++; }
int  counter_get(const Counter *c){ return c->n; }
void counter_free(Counter *c)     { free(c); }
```

```c
/* main.c */
#include <stdio.h>
#include "counter.h"

int main(void)
{
    Counter *c = counter_new(10);
    counter_inc(c);
    counter_inc(c);
    printf("count = %d\n", counter_get(c));
    /* c->n = 0;  -- try uncommenting: the compiler refuses */
    counter_free(c);
    return 0;
}
```

```sh
cc -std=c11 -Wall -Wextra counter.c main.c -o demo
./demo
```

```text
count = 12
```

Now uncomment the `c->n = 0;` line and recompile. This is the real diagnostic:

```text
main.c:7:6: error: incomplete definition of type 'Counter' (aka 'struct Counter')
    c->n = 0;                      /* reach past the API */
    ~^
./counter.h:4:16: note: forward declaration of 'struct Counter'
typedef struct Counter Counter;
               ^
```

To `main.c`, `Counter` is an *incomplete type*: the compiler knows it exists, knows a pointer to it is a valid value, and knows nothing about its size or members. You can hold the pointer, pass it, store it — and you cannot dereference it, because there is literally no layout available to dereference through. The hiding is enforced by the compiler, not by convention.

This buys you three things. First, *encapsulation*: callers must use the API, so invariants live in exactly one file. Second, *freedom to change the layout*: reorder, rename, or grow `struct Counter` and no caller recompiles. Third, *a forced ownership conversation*: because callers cannot build a `Counter` themselves, `counter_new` and `counter_free` are the only way in and out — I.4's who-frees-what question answered by construction. Notice the pairing discipline is the same one **the I.4 growable buffer** used: `buf_init`/`buf_free`, `counter_new`/`counter_free`, and in this module's build task, `val_copy`/`val_destroy`. Library code in C is full of this pattern; you have now built it.

## The Seam

Layout is attack surface twice over, and both faces are this module's seam.

**Face one: mis-parsing.** A wire buffer is bytes with an external, documented layout. A struct is bytes with a layout your compiler chose for your machine. Code that conflates them — declaring a struct that "matches" the protocol and casting the buffer — is trusting three things the protocol never promised: the compiler's offsets, the compiler's padding, and the machine's endianness. Here is the conflation, on a 7-byte Modbus-TCP-like header (transaction ID, protocol ID, length — all big-endian 16-bit — then a function code byte):

```c
#include <stdio.h>
#include <stdint.h>
#include <stddef.h>

static const uint8_t frame[7] = {
    0x12, 0x34,   /* transaction ID = 0x1234 */
    0x00, 0x00,   /* protocol ID    = 0      */
    0x00, 0x06,   /* length         = 6      */
    0x03          /* function code  = 3      */
};

struct MbapNative {
    uint16_t tid;
    uint16_t pid;
    uint16_t len;
    uint8_t  fc;
};

int main(void)
{
    printf("sizeof(struct MbapNative) = %zu  (the frame is 7 bytes)\n",
           sizeof(struct MbapNative));

    const struct MbapNative *h = (const struct MbapNative *)frame;
    printf("cast says:   tid=0x%04x pid=0x%04x len=%u fc=%u\n",
           h->tid, h->pid, h->len, h->fc);

    uint16_t tid = (uint16_t)((frame[0] << 8) | frame[1]);
    uint16_t pid = (uint16_t)((frame[2] << 8) | frame[3]);
    uint16_t len = (uint16_t)((frame[4] << 8) | frame[5]);
    uint8_t  fc  = frame[6];
    printf("parsed says: tid=0x%04x pid=0x%04x len=%u fc=%u\n",
           tid, pid, len, fc);
    return 0;
}
```

```text
sizeof(struct MbapNative) = 8  (the frame is 7 bytes)
cast says:   tid=0x3412 pid=0x0000 len=1536 fc=3
parsed says: tid=0x1234 pid=0x0000 len=6 fc=3
```

The struct is already the wrong size — 8 bytes against a 7-byte frame, the tail padding rounding it up. And every multi-byte field the cast produces is wrong: transaction `0x3412` instead of `0x1234`, length `1536` instead of `6`, because this machine is little-endian and the wire is big-endian. This run got *lucky* twice: the padding happened to sit at the tail rather than between fields (on another compiler or another member order it wouldn't), and the array happened to be aligned enough that the cast didn't fault (a `uint8_t` array promises alignment 1; `struct MbapNative` requires 2, so the cast is undefined behaviour on a strict-alignment machine). A parser built on this cast "works in testing" on the developer's machine and silently mangles every length field in production. Mis-parsing is where protocol bugs live — and a wrong length field is not a cosmetic bug; it is the input to the next buffer's bounds check.

**Face two: type confusion via unions.** A union with no trusted record of what was written is a reinterpretation primitive you didn't intend to offer:

```c
#include <stdio.h>
#include <stdint.h>

union Slot {
    uint64_t num;
    char    *ptr;
};

int main(void)
{
    union Slot s;
    s.num = 0x4142434445464748ull;   /* we wrote an integer... */
    printf("num = 0x%llx\n", (unsigned long long)s.num);
    puts(s.ptr);                     /* ...now we read it as a pointer */
    return 0;
}
```

It compiles clean — the compiler cannot know which member is live. Then:

```text
num = 0x4142434445464748
Segmentation fault: 11
```

The integer's bytes, read as a pointer, named an address that doesn't exist, and the kernel ended the process. Now swap the roles: imagine those bytes arrived from the network, and your code's branch — not the bytes — decided they were a pointer to dereference. The attacker doesn't need to smash a stack (I.5's move); they just need your tag check to be missing, and your own union does the reinterpretation for them. This is why the tagged-union build task scores *tag-guarded access with an assertion*: the guard is the difference between a union and a loaded foot-gun.

Both faces get their names formally in Book III.2, where the vulnerability taxonomy maps each bug class back to its Book I seam. When you meet them there, you will be reading them as an attacker; today you are building the discipline that keeps them out.

## Lab

Three exercises, one theme: the layout is measurable, and the wire is not your struct. Do them in order.

**Step 1 — Map the cold-open struct.** Re-run `coldopen.c` from the cold open if you haven't, then extend it: print `sizeof` and `offsetof` for a struct of *your own* design with at least four members of mixed types (include a pointer and a `double`). Before running, write your predicted offsets on paper. Run, compare, and for every prediction you missed, say which of the three layout rules fired.

**Step 2 — Shrink it.** Reorder your Step 1 struct's members by descending alignment and re-measure. `reorder.c` from the exposition is the model: your output should show the old size, the new size, and the new offsets. If the shrink is zero, your struct was already tight — say why in one sentence (which rule left no room?).

**Step 3 — Parse a real frame, byte by byte.** Here is one captured frame: a minimal Modbus-TCP-like header, seven bytes — transaction ID (2 bytes, big-endian), protocol ID (2, big-endian), length (2, big-endian), function code (1). Write this parser:

```c
#include <stdio.h>
#include <stdint.h>

/* One captured frame: a 7-byte Modbus-TCP-like header.
 *   [0..1] transaction ID, big-endian
 *   [2..3] protocol ID,    big-endian
 *   [4..5] length,         big-endian
 *   [6]    function code
 */
static const uint8_t frame[7] = {
    0x12, 0x34,   /* transaction ID */
    0x00, 0x00,   /* protocol ID    */
    0x00, 0x06,   /* length         */
    0x03          /* function code  */
};

static uint16_t be16(const uint8_t *p)
{
    return (uint16_t)((p[0] << 8) | p[1]);
}

int main(void)
{
    uint16_t tid = be16(&frame[0]);
    uint16_t pid = be16(&frame[2]);
    uint16_t len = be16(&frame[4]);
    uint8_t  fc  = frame[6];

    printf("transaction ID : 0x%04x\n", tid);
    printf("protocol ID    : %u\n", pid);
    printf("length         : %u\n", len);
    printf("function code  : %u", fc);
    if (fc == 3)
        printf(" (read holding registers)");
    putchar('\n');
    return 0;
}
```

```sh
cc -std=c11 -Wall -Wextra mbap.c -o mbap
./mbap
```

```text
transaction ID : 0x1234
protocol ID    : 0
length         : 6
function code  : 3 (read holding registers)
```

Read the `be16` helper until it is boring: take the high byte, shift it left 8, OR in the low byte. That two-line function is the entire decode for every 16-bit field in the frame, and it is *explicit* — the endianness conversion is written in the code, not assumed from the machine. Change the frame bytes and re-decode: try `0x00, 0x01` for the transaction ID, then a function code of `0x10` (16) and add the name for it (write multiple registers) to the printout.

Then close the lab with the one-line rule, which you have now earned twice (the seam showed the cast failing, this step showed the parse working): **parse wire bytes explicitly, field by field, in the protocol's byte order — never cast a byte buffer to a struct, because the compiler's offsets, padding, and endianness are not the protocol's.**

## Build Task

**The tagged-union value type.** Build a small dynamic value: a struct carrying a tag and a union of three payloads, with guarded access, deep copy, and clean destruction — the pattern underneath every interpreter's value type, every JSON parser's node, every config system's settings table. This interface is fixed by name; Book II will hold you to it.

**Interface.** In a single file `val.c` (multi-file discipline arrives in I.7; keep it to one translation unit):

```c
enum ValTag { VAL_INT, VAL_DOUBLE, VAL_STRING };

struct Val {
    enum ValTag tag;
    union {
        int    i;
        double d;
        char  *s;
    } as;
};
```

Required operations:

- `void val_print(const struct Val *v);` — prints the value according to its tag.
- `struct Val val_copy(const struct Val *v);` — deep copy: a `VAL_STRING` copy gets its *own* heap allocation, so original and copy share no pointers.
- `void val_destroy(struct Val *v);` — releases everything the value owns; safe on any tag.
- Tag-guarded accessors — one per payload, on the shape of `int val_as_int(const struct Val *v);` — each beginning with `assert(v->tag == VAL_INT);` (or its tag). The assertion is part of the deliverable, not a nicety.

You may add small constructors (`val_int`, `val_double`, `val_string(const char *)`) if they keep the demo readable; `strdup` is POSIX, not C11, so duplicate strings with `malloc` + a bounded copy you control.

**The demo.** `main` builds a mixed sequence — an array of `struct Val` holding at least one of each tag — copies the whole sequence, prints both original and copy, then destroys both. Before exiting it prints `sizeof(struct Val)`.

**The layout paragraph.** In a comment block above `main`, write one paragraph explaining the type's layout accurately: the tag, the padding, the union, and the total. On the author's machine (arm64, clang) the numbers to beat are: tag at offset 0 occupying 4 bytes, 4 bytes of padding, the union at offset 8 occupying 8 bytes (its largest member is the `char *`), total size 16. Verify with `offsetof` on your machine and report what you actually measure.

**Constraints.**

- Every union access — in `val_print`, `val_copy`, the accessors, everywhere — is guarded by the tag. No exceptions.
- String payloads are heap-owned, freed exactly once, per the ownership discipline you built in I.4: every `malloc` has exactly one `free`, on every path through the demo.
- Compiles warning-free under `cc -std=c11 -Wall -Wextra`.

**Scoring criteria.**

| Criterion | What passes |
|---|---|
| Tag-guarded access | A deliberate wrong-tag access (call `val_as_int` on a `VAL_STRING` in a scratch main) is caught by the assertion in the accessor — demonstrated, not asserted in prose. No unguarded union read exists anywhere. |
| Ownership (I.4 rules) | `val_copy` produces an independent deep copy; mutating the copy's string cannot touch the original. `val_destroy` frees every heap byte exactly once — the demo's alloc/free count balances, and there is no shared pointer between original and copy that could double-free. |
| Layout understanding | The demo prints `sizeof(struct Val)`, and the comment paragraph explains tag, padding, and union accurately against `offsetof` output on your machine. |

**Stretch goals.**

1. Add `int val_eq(const struct Val *a, const struct Val *b);` — deep equality: tags equal, and for strings, contents equal (not pointers).
2. Add `size_t val_serialize(const struct Val *v, uint8_t *out, size_t cap);` that writes a value to bytes using the lab's discipline — tag byte, then the payload in an explicit byte order — and a matching deserializer. Round-trip your demo sequence through it. You have just designed a (tiny) wire format; notice that you did it byte by byte.

## Why This Matters for Your Roadmap

Binary protocol decoding is the OT skill underneath the OT skills. Modbus, DNP3, IEC 61850, and OPC-UA's binary encodings are byte-oriented wire formats — length-prefixed, field-offset, big-endian or little-endian by specification, never by your compiler's convenience — and parsing them is this module all the way down: offsets you compute explicitly, fields you assemble byte by byte, unions you tag and guard. The lab's seven bytes were a Modbus TCP header with the serial numbers filed off; the real MBAP is the same shape, and you already know why nobody sane casts it.

This module feeds a concrete artifact: the "Reading Modbus traffic in Wireshark" post on Laboratoires Structure. Decode a header by hand here, then open a capture and watch Wireshark's dissector produce the same fields you produced — transaction ID, length, function code — and the capture file stops being noise and starts being a document you can audit. That is also the SOEN 228 mapping made concrete: PLC/RTU internals are, at this altitude, structs and byte buffers moving over a wire. And it is the entry ticket to WT2's OT-security-proper work in Winter 2029: the difference between a candidate who has seen a protocol diagram and one who has parsed a frame by hand and can say why the cast is wrong is visible in the first ten minutes of a technical interview.

## Reps

Run these before starting I.7:

1. From memory, write a struct with a `double`, an `int`, and two `char`s. Predict every offset and the size on paper. Then measure with `offsetof`/`sizeof` and grade yourself.
2. From memory, write `be16` and its little-endian twin `le16`. Parse a new 7-byte frame with different bytes; confirm the decode by hand first.
3. Reorder the members of your Step 1 rep struct and re-measure; if it didn't shrink, say which layout rule left no room.
4. Re-read your seam demo output until you can state, unprompted, the three things the cast trusted that the protocol never promised.

## Deferred

- **Bitfield portability subtleties** — allocation order within the storage unit, the signedness of plain `int` fields, whether fields straddle unit boundaries: all implementation-defined, all parked. Use bitfields for internal flags; never for a wire format.
- **Flexible array members** (`char data[]` as a struct's last member) — the C11-sanctioned way to build a header-plus-variable-payload allocation. It arrives when a later module needs one.
- **A principled endianness treatment** — the lab stated the rule and you applied it by hand; the systematic treatment (network byte order, byte-order detection, where conversions belong in a parser's architecture) waits for the protocol work in Book III, where the wire formats are adversarial inputs, not fixed frames.
