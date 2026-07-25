# Back Matter — The Gate, the Artifacts, the Road

You have reached the end of Book I, which is not the same thing as having finished it. This method advances you on evidence, not completion. Here is that evidence made concrete: a checklist to run against yourself, an inventory of what you carry forward, and the road ahead.

## The Gate Checklist

The Gate Statement named three conditions, restated here as a self-assessment. Do not check a box because you remember doing the work; check it because you ran the check and it passed.

### Condition 1 — The I.7 gate build passes, clean under sanitizers

**Evidence artifact.** Your `libcore.a` project tree: public header, buffer and reader implementations, handwritten Makefile, test harness with its function-pointer dispatch table.

**Run the check.** Copy the tree to a fresh directory. `make` from that clean tree must build the library, build the harness, and run the tests, nothing typed in between. Deliberately break one test; confirm the harness exits nonzero and names the failure. Rebuild with `-fsanitize=address,undefined` and run the suite again.

**Pass looks like.** Clean-tree build works first try. The broken test is caught loudly. The suite passes under ASan and UBSan with zero leaks (zero valgrind errors, if you have valgrind). Adding a test is one dispatch-table entry, nothing else.

**If you cannot.** Clean-tree build fails on headers or linkage → back to I.7's translation units and include guards; your separation is wrong. ASan reports leaks → back to I.4; your ownership rules are intended, not followed. Adding a test needs driver changes → back to I.7's function pointers; you built a switch statement wearing a table's clothes.

### Condition 2 — The I.8 capstone: read, instrumented, extended

**Evidence artifact.** Your finished **I.8 parser** package: the written code map, the instrumented build, the sanitizer report for the planted defect, and your grammar extension with tests.

**Run the check.** Put it away for two weeks, then reproduce it from your own write-up: rebuild the instrumented version, regenerate the sanitizer report, run the extended parser at `-O2` under ASan/UBSan. Better, hand the map and the codebase to a peer and see whether the map alone lets them navigate.

**Pass looks like.** The map is accurate — entry points, token and AST structures, one transaction traced end to end, ownership noted at every allocation boundary — and verifiable against the source without you in the room. The planted defect is caught with sanitizer evidence that reproduces from the write-up alone. The extension lands without breaking existing behaviour; the whole artifact builds warning-free and clean at `-O2`.

**If you cannot.** Map doesn't match the source → redo I.8's reading method on a fresh file; you skimmed where you should have traced. Can't find the defect → back to the I.7 sanitizer lab until reading an ASan report is reflex. Extension breaks behaviour → revisit I.6's structs and I.8's transaction-tracing; you changed a structure without knowing who owned it.

### Condition 3 — The unaided skill

**Evidence artifact.** None standing — that is the point. The evidence is a fresh exercise: a C file of a few hundred lines you have never seen, from outside this book, and a timed write-up about it.

**Run the check.** Find an unfamiliar single-file C program — a small open-source utility works well. Ninety minutes. By eye, produce a code map and a written list of every suspected undefined behaviour. Then instrument the file and let ASan/UBSan confirm or refute each suspicion. Do not reread I.8.

**Pass looks like.** Your eye-list and tool-list substantially agree. You found at least one real defect, or you can state with tool-backed evidence why the file is clean. Unaided — the method is in you now, not in the chapter.

**If you cannot.** Tools find what your eye missed → rerun the I.2 and I.5 reps; the UB catalogue isn't reflex yet. Tool output confuses you → an I.7 gap. No map at all → repeat I.8's reading method on progressively larger files until entry-points → structures → transaction → ownership is automatic.

When all three hold, you are at L3. Not "done with the C book" — L3. Book II assumes it and does not re-teach it.

## The Artifact Inventory

Everything you built was built to be used again. These five artifacts are load-bearing across the next two books; the forward references below are promises the curriculum will collect.

**The I.4 growable buffer** — `buf_init` / `buf_push` / `buf_get` / `buf_free` over `data` / `len` / `cap` with doubling growth. The Vec ancestor: one owner, free exactly once, `buf_push` may invalidate saved pointers, `realloc` failure leaves the old block intact — every rule enforced by hand because the compiler refused to help. In Book II.2 you re-implement this exact artifact in Rust, ownership-checked, lining up rule for rule what you enforced by discipline against what the borrow checker enforces by construction. Keep the header comments; they are the contract you will translate.

**The I.5 overflow** — the deliberate `strcpy` smear from I.5's cold open, kept on purpose. It becomes two things. In Book II.1 you write the same program in Rust and watch the compiler refuse it — a bug class deleted at compile time, not patched after the fact. In Book III.2 you revisit it as an attacker: the same bytes landing in memory you didn't name, now read as a primitive, anchoring the vulnerability taxonomy that maps every class back to its Book I seam. The program that taught you the seam becomes the program you learn to weaponize and then defend.

**The I.8 parser** — the few-hundred-line lexer plus recursive-descent core you read, mapped, instrumented, and extended. Your capstone, and it stays in play the longest. In Book III.4 a coverage-guided fuzzer is pointed at this exact artifact: what you found by eye and sanitizer here, you will find by brute force there — and the harness targets the extended version, your extension included. The quality of your I.8 work determines the quality of your III.4 crash triage.

**`libcore.a`** — the static library and dispatch-table harness that carried the L3 gate. As evidence it is Condition 1; as an artifact it has a forward life. Book III.1's build task is a safe Rust wrapper over a C library at the FFI boundary, and a library you wrote yourself, whose ownership contracts you can recite, is the ideal candidate. Book II.9's capstone — a full Book I C program re-implemented in safe Rust with a line-for-line guarantee analysis — may draw on it too. Either way, this is C you will eventually be asked to make safe without rewriting first.

**`read_line`** — the bounded reader, `read_line(char *dst, size_t cap)`: never past `dst[cap - 1]`, always terminated, truncation signalled distinctly. Its contract is Book II.3's subject — slices and borrowing turn "never past the caller's buffer" from a documented promise into a type-level guarantee, and its truncation signalling is `Result`-and-`Option` thinking before you had the words. The canary-test pattern behind its bounds proof returns in III.4 as a fuzz harness's invariant checks.

## Next: Book II — *Rust: Discipline by Construction* (L3 → L4)

Every seam this book opened stays open until something closes it. Book II is the closing.

Look at what you now know how to do wrong. Free memory and use it again (I.4). Write past a buffer and corrupt a neighbour (I.5). Return a pointer to dead stack storage and have it *work in testing* (I.3). Write an overflow guard the optimizer lawfully deletes (I.8). Each time, the language watched and said nothing, because C's model is that you are the discipline. You have spent eight modules being the discipline. Book II asks: what would a language look like that carried the discipline for you?

Rust is the answer, developed module by module — and the mapping is not approximate; it is the cross-reference contract you have been building toward. The I.5 overflow becomes II.1's cold open: same program, compiler refusal. The I.4 buffer becomes II.2's build task: same interface, ownership checked. The string work behind `read_line` becomes II.3's borrowing and slices. The dangling stack pointer becomes II.4's lifetime errors. The UB catalogue becomes II.5's type system — no null, errors as values. The toolchain you assembled by hand in I.7 arrives as cargo in II.9.

The roadmap reason is the OT lane's direction of travel. The C install base — the PLCs, RTUs, and IEDs this book taught you to read — is the attack surface, and memory-safe firmware is where the field is heading because of it. The engineer your 2029 roadmap needs is not the one who only flags the unsafe original; it is the one who can propose the safe rewrite. Embedded-Rust work at Thales Canada / GD-OTS-class employers is the WT2/WT3 shape of that sentence, and Book II gets you there artifact by artifact.

The L4 gate is the consolidation-tier move made explicit: re-implement a full Book I C program in safe Rust, with the line-for-line analysis of what the compiler now guarantees. You cannot write that analysis without L3 — without being able to say what the C version did, ownership boundaries and all. So, one last time: pass the checklist first. Book II assumes it.

The seams are numbered. The artifacts are archived. Go learn what closes them.
