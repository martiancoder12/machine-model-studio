# I.1 · Hello, machine

> **Level:** L0 → L1 · **Prerequisites:** none — this is the first module of Book I
> **You will be able to:**
> - drive a C program through all four stages of the compilation pipeline by hand and read what each stage emits
> - read a compiler diagnostic and name the stage that produced it before you fix anything
> - use `printf` format strings as an explicit contract — and recognize a broken contract as a bug class

## Cold Open

Before any explanation, you are going to run the entire pipeline. Open a text editor and write this file, exactly, as `hello.c`:

```c
#include <stdio.h>

int main(void) {
    printf("hello, machine\n");
}
```

Five lines. Compile it and run it:

```sh
$ cc hello.c -o hello
$ ./hello
```

```text
hello, machine
```

That is the version you have seen in every tutorial. Now do it again — slowly, one stage at a time:

```sh
$ cc -E hello.c -o hello.i    # preprocess only
$ cc -S hello.i -o hello.s    # compile to assembly
$ cc -c hello.s -o hello.o    # assemble to an object file
$ cc hello.o -o hello2        # link by hand
$ ./hello2
```

```text
hello, machine
```

Same output, four extra artifacts on disk. Look at their sizes:

```text
$ wc -l hello.c hello.i hello.s
       5 hello.c
     571 hello.i
      25 hello.s
```

Your five lines became 571. Open `hello.i` and scroll to the bottom — the last three lines are yours:

```text
int main(void) {
    printf("hello, machine\n");
}
```

Everything above it — 568 lines of declarations — came out of that single `#include <stdio.h>`. Now open `hello.s` and find your string. It is there, at line 23 on this machine:

```text
l_.str:                                 ; @.str
	.asciz	"hello, machine\n"
```

And `hello.o` is no longer text at all:

```text
$ file hello.o
hello.o: Mach-O 64-bit object arm64
```

**What just happened.** The file you wrote is not the thing the machine ran. Between your source and the running program sit four separate transformations, each consuming one representation and emitting another, and you just drove all four yourself. `cc` is not the compiler — it is the driver that runs the compiler, and three other programs besides. Do not worry about *why* yet. That is the rest of the module.

One piece of housekeeping before we go further. The book's standard compile line, from here on, is:

```sh
$ cc -std=c11 -Wall -Wextra hello.c -o hello
```

`-std=c11` pins the language to C11, the version this book teaches. `-Wall -Wextra` turns on the compiler's warnings — all of them that matter for a learner, and then some. Correct code in this book compiles warning-free under these flags. When a listing provokes a warning or an error on purpose, the text will say so and show you the real diagnostic. (All output in this module was observed on an arm64 Mac running Apple clang 21, where `cc` *is* clang. On Linux your `cc` is probably GCC. The four-stage structure is identical; only some spellings differ.)

## The Compilation Pipeline

Here is the whole machine, laid flat:

```text
hello.c ──preprocessor──> hello.i ──compiler──> hello.s ──assembler──> hello.o ──linker──> hello
 C source    cc -E       expanded C   cc -S    assembly    cc -c      object file   cc     executable
```

Four programs. Each one speaks its own dialect of error message, and learning to tell them apart is half of reading diagnostics. Take them in order.

**Preprocess.** The preprocessor is a text expander. It does not know C. It handles every line that starts with `#`: `#include` pastes the named file in verbatim (that is where your 568 extra lines came from — the contents of `stdio.h` and everything it includes in turn), and `#define` does textual substitution you will meet properly later. Its errors are about *text it cannot find*:

```text
$ cc -std=c11 -E prebreak.c -o /dev/null
prebreak.c:2:10: fatal error: 'nonexistent.h' file not found
    2 | #include "nonexistent.h"
      |          ^~~~~~~~~~~~~~~
```

Note what it does *not* do: check your syntax. Take the semicolon-broken program from the lab below and run only `cc -E` on it — the preprocessor emits 571 lines of output without a murmur. Syntax is not its job.

**Compile.** This is the stage people mean when they say "the compiler." It reads expanded C and emits assembly — the machine's instructions spelled out as text. It is also the stage that actually understands C, so this is where nearly all of your diagnostics will live for the rest of your life: syntax errors, undeclared names, type mismatches. The full `hello.s` is short enough to read whole:

```text
	.build_version macos, 26, 0	sdk_version 26, 5
	.section	__TEXT,__text,regular,pure_instructions
	.globl	_main                           ; -- Begin function main
	.p2align	2
_main:                                  ; @main
	.cfi_startproc
; %bb.0:
	stp	x29, x30, [sp, #-16]!           ; 16-byte Folded Spill
	mov	x29, sp
	.cfi_def_cfa w29, 16
	.cfi_offset w30, -8
	.cfi_offset w29, -16
	adrp	x0, l_.str@PAGE
	add	x0, x0, l_.str@PAGEOFF
	bl	_printf
	mov	w0, #0                          ; =0x0
	ldp	x29, x30, [sp], #16             ; 16-byte Folded Reload
	ret
	.cfi_endproc
                                        ; -- End function
	.section	__TEXT,__cstring,cstring_literals
l_.str:                                 ; @.str
	.asciz	"hello, machine\n"

.subsections_via_symbols
```

You are not expected to read ARM assembly — that is not this book. But look at the shape: there is a function called `_main`, it loads the address of your string (`l_.str`) into a register, it calls `_printf` (`bl` is "branch and link" — a function call), it puts `0` in a register, and it returns. Your five lines, one level closer to the metal. The C is gone; the structure survives.

**Assemble.** The assembler turns the assembly text into an object file: real machine code bytes, plus a symbol table, in a binary container format (Mach-O here, ELF on Linux). It almost never speaks to you, for a simple reason: the compiler only emits valid assembly. You would have to write bad assembly by hand to make it complain.

**Link.** The linker stitches object files together into an executable. Its job is *resolving names*: your object file uses `_printf` but does not contain it. Ask the object file directly:

```text
$ nm hello.o
0000000000000000 T _main
                 U _printf
```

`T _main` — `main` is defined here, in the text (code) section. `U _printf` — `printf` is *undefined*: a promise to be kept later. The linker keeps it by pulling in the C standard library, which on this machine lives in `/usr/lib/libSystem.B.dylib`. When the promise cannot be kept, the error is the linker's, and it looks nothing like a compiler error. Declare a function, call it, but never define it:

```c
#include <stdio.h>

int triple(int x);   /* declared, never defined */

int main(void)
{
    printf("%d\n", triple(14));
}
```

The compile stage is perfectly happy — the declaration told it all it needed:

```text
$ cc -std=c11 -Wall -Wextra -c linkbreak.c -o linkbreak.o   # builds fine
$ cc linkbreak.o -o linkbreak
Undefined symbols for architecture arm64:
  "_triple", referenced from:
      _main in linkbreak.o
ld: symbol(s) not found for architecture arm64
clang: error: linker command failed with exit code 1 (use -v to see invocation)
```

No line numbers, no caret pointing at your code — because the linker does not read your code. It reads symbol tables. `Undefined symbols` is the linker's voice, and once you can hear it you will never again waste an hour hunting a missing semicolon over what is actually a forgotten file on the command line.

That is the pipeline. Preprocess expands, compile translates, assemble encodes, link resolves. Every C program you ever build — including the firmware you will one day audit — went through exactly this.

## The Shape of a Program

Zoom back into the source. A C program is a small set of nested shapes, and the compiler is rigid about all of them.

```c
#include <stdio.h>

int main(void)
{
    int total = 0;              /* declaration + definition */

    {                           /* a block: statements grouped */
        int addend = 10;        /* lives only inside this block */
        total = total + addend; /* statement: do something */
    }

    total = total + 5;
    printf("total = %d\n", total);
    return 0;                   /* the exit status */
}
```

```text
$ ./shape
total = 15
```

The shapes, named:

- **`main` is the entry point.** Every C program has exactly one. Execution begins at its first statement, whatever else is in the file. The `(void)` says it takes no arguments here; you will meet its other form, `main(int argc, char *argv[])`, in the build task.
- **Declarations come before use.** `int total = 0;` both declares the name `total` — tells the compiler it exists and what type it has — and defines it, giving it storage and an initial value. The compiler reads top to bottom and refuses names it has not been told about. This is not a style rule; it is how the compiler works, and the lab makes you watch it refuse.
- **Statements end in semicolons.** A statement is one thing the program does: assign, call, return. The semicolon is the terminator, not a separator — every statement wears one. Forgetting it is the most common error you will ever see, and the compiler's message for it is exact.
- **Blocks group statements and scope names.** A pair of braces makes a block. A name declared inside a block exists only inside it — `addend` is gone after its closing brace, and referring to it afterward is the same error as never declaring it. Blocks are how C expresses "this belongs to this," and they are the first storage-lifetime idea in a book that is, at bottom, about storage lifetimes.
- **`return 0;` is the program's report to whoever ran it.** The value `main` returns becomes the process's *exit status*, readable in the shell as `$?`:

```text
$ ./exitdemo
about to return 42
$ echo $?
42
```

Convention: `0` means success, anything else means failure, and the nonzero value says which failure. The build task scores you on this — a usage message with a zero exit status is a program that lies to scripts.

Why is the compiler so rigid? Because everything it lets through becomes machine code with no one left to ask. The C compiler's whole model of your program is built from what it can see in the file, top to bottom: names it has met, types it has been told, statements it can translate. Declarations before use, one `main`, semicolons, scoped blocks — those are not etiquette. They are the information the compiler needs to see, in the order it needs to see it.

## Types at the Surface

C has a small set of basic types. Meet three now, as what they actually are: **storage commitments**, not mathematics.

```c
#include <stdio.h>

int main(void)
{
    int whole = 42;
    double precise = 3.5;
    char letter = 'A';

    printf("whole   = %d  (sizeof int:    %zu bytes)\n", whole, sizeof(int));
    printf("precise = %f  (sizeof double: %zu bytes)\n", precise, sizeof(double));
    printf("letter  = %c  (sizeof char:   %zu byte)\n", letter, sizeof(char));

    int truncated = 3.9;
    printf("truncated = %d\n", truncated);

    char as_number = 'A';
    printf("letter as number = %d, next letter = %c\n", as_number, as_number + 1);
}
```

```text
whole   = 42  (sizeof int:    4 bytes)
precise = 3.500000  (sizeof double: 8 bytes)
letter  = A  (sizeof char:   1 byte)
truncated = 3
letter as number = 65, next letter = B
```

Read the three declarations as commitments. `int whole` says: reserve a fixed-size box (4 bytes on this machine) for a whole number — no fractions, ever. `double precise` reserves a bigger box (8 bytes here) that can hold fractional values to about fifteen significant digits. `char letter` reserves a single byte — enough for one character's numeric code.

The machine enforces the commitment silently. `int truncated = 3.9;` does not fail; the compiler warns (this listing intentionally provokes one) and then stores what fits:

```text
types.c:13:21: warning: implicit conversion from 'double' to 'int' changes value from 3.9 to 3 [-Wliteral-conversion]
   13 |     int truncated = 3.9;
      |         ~~~~~~~~~   ^~~
1 warning generated.
```

The box is an `int`, so in goes `3`; the `.9` never lands. The type decided what the value was allowed to be. And `char` is honest about being a number: `'A'` *is* 65 in the machine's encoding (ASCII), so `as_number + 1` is 66, which printed as a character is `B`. A `char` is a one-byte integer that `printf` will dress up as a letter if you ask with `%c`.

Two honest flags. First, the sizes above are *this machine's* — the C standard guarantees minimums, not exact widths, and the fixed-width types (`int32_t`, `uint64_t`, …) that pin them down are module I.2's opening topic. Second, what happens when a value overflows its box entirely is a deeper subject than a warning: unsigned arithmetic wraps by rule, signed overflow is undefined behaviour, and that distinction — flagged now, owned in I.8 — is one of the load-bearing seams of this whole curriculum. For now the surface rule is enough: **a declaration is a storage commitment, and the machine stores what the commitment permits.**

## `printf` and Format Strings

`printf`'s first argument is not a message. It is a *contract*.

```c
#include <stdio.h>

int main(void)
{
    int count = 7;
    double price = 12.5;
    char grade = 'B';

    printf("count = %d, price = %.2f, grade = %c\n", count, price, grade);
    printf("%d apples cost %.1f dollars; grade %c\n", count, price, grade);
}
```

```text
count = 7, price = 12.50, grade = B
7 apples cost 12.5 dollars; grade B
```

Every `%`-conversion in the format string is a promise: *there is a corresponding argument, after the format string, of this exact type.* The conversions you need now:

| Specifier | Promised argument | Prints as |
|-----------|-------------------|-----------|
| `%d` | `int` | signed decimal integer |
| `%f` | `double` | decimal, six digits after the point |
| `%.1f` / `%.2f` | `double` | decimal, one / two digits after the point |
| `%c` | `int` holding a character code | the single character |
| `%s` | `char *` pointing at a string | the string's text |
| `%zu` | `size_t` (what `sizeof` yields) | unsigned decimal |
| `%p` | a pointer, cast to `(void *)` | an address — module I.3's home ground |
| `%%` | (none) | a literal `%` |

The contract has two directions, and both can be broken. Too few arguments, or arguments of the wrong type, and `printf` reads values that are not there or misreads the ones that are. Too many, and the extras are ignored. The compiler checks the contract *when the format string is a literal it can see* — that is what `-Wformat` (part of `-Wall`) does — but checking is not refusing. A broken contract is a warning, and the program builds, and runs, and lies to you.

Keep that thought. It is the seam.

## The Seam

`printf` is your first attack surface. Two demonstrations, both run for real.

**One: a mismatched contract.** Give `%d` a string instead of an `int`:

```c
#include <stdio.h>

int main(void)
{
    int secret = 12345;
    printf("the value is %d\n", "not a number");
    printf("secret is really %d\n", secret);
}
```

```text
seam.c:6:33: warning: format specifies type 'int' but the argument has type 'char *' [-Wformat]
    6 |     printf("the value is %d\n", "not a number");
      |                          ~~     ^~~~~~~~~~~~~~
      |                          %s
1 warning generated.
$ ./seam
the value is 39273685
secret is really 12345
```

The compiler told you the truth, the program built anyway, and `%d` interpreted the string's *address* — or the low digits of it — as an integer. And `39273685` is not even stable garbage: run the binary again and you get a different number every time (`41370837`, then `36013269`, …), because the address being leaked is randomized at every launch — ASLR, a mitigation Book III will meet properly. That is the lesson in one number: the value your program prints was never yours to control. Undefined behaviour does not mean "the computer does something strange." It means *the result is no longer your program's to predict, repeat, or defend.*

**Two: the format string as input.** The lethal version is not a wrong argument — it is no fixed format at all:

```c
#include <stdio.h>

int main(int argc, char *argv[])
{
    if (argc < 2) {
        printf("usage: %s <message>\n", argv[0]);
        return 1;
    }
    printf(argv[1]);
    printf("\n");
    return 0;
}
```

```text
fmtvuln.c:9:12: warning: format string is not a string literal (potentially insecure) [-Wformat-security]
    9 |     printf(argv[1]);
      |            ^~~~~~~
fmtvuln.c:9:12: note: treat the string as an argument to avoid this
    9 |     printf(argv[1]);
      |            ^
      |            "%s",
1 warning generated.
```

Even the compiler names the insecurity. Run it on ordinary input and it behaves:

```text
$ ./fmtvuln "hello there"
hello there
```

Now hand it conversions of your own:

```text
$ ./fmtvuln "%x %x %x %x %x %x %x %x"
fffffff0 6ddaa8e8 6ddaaed8 2 6ddaaeb0 8cf0fe00 0 1
```

Those are values off the machine's stack, printed on demand — the exact digits differ on every run and every machine, the leaking does not — because `printf` faithfully fulfilled conversions for arguments that do not exist: it just kept reading. Escalate to `%s`, which treats each value as an *address* and prints the string it points at:

```text
$ ./fmtvuln "%s %s %s %s %s %s %s %s"
Segmentation fault: 11
$ echo $?
139
```

Exit status 139 is 128 + 11: killed by signal 11, SIGSEGV, an invalid memory read. The program followed pointers the input invented, and the machine stopped it where the reading got illegal. This is the bug class formally named the **format-string vulnerability**: when the format string is data, whoever controls the data controls what `printf` reads — and with conversions you have not met yet (`%n`), what it *writes*. The one-line fix the compiler itself suggested is the rule: never pass data as the format string — `printf("%s", argv[1])` prints the input *as data*, conversions inert.

File the class away. Book III names it formally, teaches its history, and reads it as an attacker; Book II will show you a language whose equivalent refuses this contract at compile time. For now you own the shape of it: *a broken contract between format string and arguments is undefined behaviour, and an attacker-controlled format string is a vulnerability.*

## Lab

Guided, in order. Every command is real; run them all. Predict before you read each output.

1. **Rebuild the pipeline by hand.** Start from a fresh `hello.c` (the five-line cold-open version). Run each stage separately and confirm each artifact exists:

   ```sh
   $ cc -std=c11 -E hello.c -o hello.i
   $ cc -std=c11 -S hello.i -o hello.s
   $ cc -std=c11 -c hello.s -o hello.o
   $ cc hello.o -o hello
   $ ./hello
   ```

2. **Open `hello.i`.** Find your string: `grep -n "hello, machine" hello.i` should land near the last line (line 570 of 571 on this machine). Now scroll the top. Everything before your code is `stdio.h` and its includes, expanded inline. How many lines of your program did you actually write?

3. **Open `hello.s`.** Find your string again: `grep -n "hello, machine" hello.s` (line 23 here, `.asciz "hello, machine\n"`). `asciz` is "ASCII, zero-terminated" — the assembler's spelling of a C string. Find `_main`, the `bl _printf` call, and the `mov w0, #0` that becomes your exit status.

4. **Interrogate the object file.** `nm hello.o` — confirm `_main` is `T` (defined here) and `_printf` is `U` (a promise). Then link and run. You have now watched one string literal survive four representations.

5. **Break it: missing semicolon.** Delete the semicolon after the `printf` call in your `hello.c` and compile. Predict first: which stage speaks?

   ```text
   hello.c:4:31: error: expected ';' after expression
       4 |     printf("hello, machine\n")
         |                               ^
         |                               ;
   1 error generated.
   ```

   The compiler — stage two. Syntax is its job. Note the caret and the offered fix. For contrast, run `cc -E` on the same broken file: the preprocessor emits 571 lines without complaint. It never looks at your syntax.

6. **Break it: missing declaration.** Use a variable you never declared:

   ```c
   #include <stdio.h>

   int main(void)
   {
       message = 42;
       printf("%d\n", message);
   }
   ```

   ```text
   break2.c:5:5: error: use of undeclared identifier 'message'
   break2.c:6:20: error: use of undeclared identifier 'message'
   2 errors generated.
   ```

   Stage two again — declarations-before-use is a language rule, and the compiler is the stage that knows the language. Note it reports *both* uses, not just the first: it keeps reading after an error to tell you everything it can.

7. **Break it: wrong argument count.** Put the contract out of balance both ways:

   ```c
   #include <stdio.h>

   int main(void)
   {
       int a = 1;
       printf("%d %d\n", a);
       printf("%d\n", a, 99);
   }
   ```

   ```text
   break3.c:6:17: warning: more '%' conversions than data arguments [-Wformat-insufficient-args]
   break3.c:7:23: warning: data argument not used by format string [-Wformat-extra-args]
   2 warnings generated.
   ```

   Warnings, not errors — exit status 0, binary produced. Run it:

   ```text
   $ ./break3
   1 1806788872
   1
   ```

   The first line's second number is garbage — and different garbage on every run (ASLR again; your number will not match this one): `%d` with no argument reads whatever bytes the call left in reach. The second line shows the benign direction — extra arguments are silently dropped. Same stage (the compiler, `-Wformat`), completely different severity. This is why the book treats warnings as errors-in-waiting.

8. **Name the stage.** Collect the diagnostics you just produced — the missing-header `fatal error`, `expected ';'`, `undeclared identifier`, the two `-Wformat` warnings, and (from the pipeline section) `Undefined symbols`. Cover the filenames and read only the wording. You should be able to assign every one to its stage: expansion problems to the preprocessor, language problems to the compiler, missing-name problems to the linker.

**State the rule:** every diagnostic is one stage of the pipeline complaining about one specific input — name the speaking stage first, then fix what that stage actually reads.

## Build Task

**`tempconv`** — a temperature converter driven from the command line. This is your first scored artifact; there is deliberately no reference solution. Everything you need is in this module plus one library function you will look up yourself.

**Interface.** Exactly:

```text
$ ./tempconv <value> <scale>
```

`<scale>` is `C` or `F`. `C` means the input value is Celsius and you print the Fahrenheit equivalent; `F` means Fahrenheit in, Celsius out. The output is one line: the converted value to exactly one decimal place, a space, and the target scale letter.

```text
$ ./tempconv 100 C
212.0 F
$ ./tempconv 32 F
0.0 C
```

**Behavioural requirements.**

- Correct conversion both directions: `F = C × 9/5 + 32` and its inverse. Watch your arithmetic: in C, `9 / 5` of two `int`s is `1`. The types section told you why; make the division happen in `double`.
- Known values must hold exactly: 0 °C = 32 °F, 100 °C = 212 °F, and the crossover point, −40 °C = −40 °F.
- Malformed input — wrong argument count, a non-numeric value, a scale letter other than `C`/`F` — prints a usage message and exits nonzero (`return 1;` from `main`). Not a crash, not a silent zero, not a successful-looking exit. Scripts that call your program must be able to tell it failed.
- Arguments arrive as `argv[1]` and `argv[2]`; declare `main(int argc, char *argv[])`. `argc` counts them, including the program name, so a well-formed call has `argc == 3`.
- The tool you do not have yet: turning `argv[1]` (a string) into a `double` *with error detection*. That is `strtod` from `<stdlib.h>`, which reports where parsing stopped through its second argument — a `12` parses cleanly, `twelve` parses nothing, `12abc` stops early. Reading its manual page is part of the task: `man strtod`. Reading manuals is the job.

**Constraints.** C11. Compiles warning-free under `cc -std=c11 -Wall -Wextra`. No libraries beyond the C standard library.

**Scoring criteria** (verbatim from the syllabus, as the grader applies them):

| # | Criterion | Pts |
|---|-----------|-----|
| 1 | Compiles warning-free under `cc -Wall -Wextra` | 25 |
| 2 | Converts both directions correctly on the known values (0 °C = 32 °F, 100 °C = 212 °F, −40 °C = −40 °F) | 50 |
| 3 | Rejects malformed input (missing or non-numeric arguments) with a usage message, not a crash | 25 |

**Stretch goals** (unscored, for reps):

1. Accept lowercase `c` / `f` as scale flags.
2. Add a third scale, `K` (Kelvin), converting to and from it in both directions, same one-decimal output contract.

## Why This Matters for Your Roadmap

Foundational, candidly. There is no OT hook in this module yet — the pipeline, `main`, the basic types, and `printf` are the alphabet, and you do not write threat models in an alphabet. The hook arrives when this same toolchain turns into an audit instrument: in I.7 the build becomes multi-file and instrumented, and in I.8 you point it at code you did not write. Everything those modules do stands on the four stages you ran by hand today.

## Reps

Run these before starting I.2; they are short and they compound.

1. From memory, write `hello.c`, run all four pipeline stages, and find your string in both `hello.i` and `hello.s`. No notes, no scrollback.
2. Predict-then-run: write a `printf` with a deliberate type mismatch, write down the exact warning you expect, then compile and compare.
3. Rebuild `tempconv` from scratch without opening your first version. Compare the two; keep the better one.
4. Read the conversion list in `man printf`. Find three specifiers this module did not use and try each in a five-line program.
5. Take the five diagnostics from Lab step 8, strip the file/line prefixes, and sort them by stage using only the wording.

## Deferred

Makefiles and multi-file programs — one file, one compile line is enough until I.7, where you split a real program across header, implementation, and main and the build system becomes part of the program. Everything about the debugger — also I.7, where `gdb` (or `lldb` on the Mac) arrives with the sanitizers as one instrumentation toolchain. The depths under the surface types — fixed-width integers, two's complement, overflow — are I.2's subject, and it starts on the next page.
