# Repository Rules

## Entry Points and Facades

- Keep every `index.ts` file as a thin facade.
- Package-level `index.ts` files are entrypoints only.
- Folder-level `index.ts` files are local facades only.
- `index.ts` may re-export the stable public surface, define a very small facade object, or perform trivial namespace assembly.
- Do not place core implementation logic, validators, state machines, parsing workflows, scheduling logic, replay logic, persistence logic, or other substantial multi-step behavior in `index.ts`.
- If code in `index.ts` would require tests of its own beyond facade wiring, that code belongs in a sibling implementation file.

## Code Organization Rules

- Organize code by domain responsibility first, not by accidental growth order.
- Prefer a `libs/pando/engine`-like layout when the package is large enough to benefit from it: one package, several clearly named domain folders, thin facades at package and subdomain boundaries, and small implementation files inside each domain.
- Every directory should answer one clear question such as `node`, `tag`, `optimization`, `runtime`, `checkpoint`, `validation`, or `inspection`.
- Do not create folders whose role is only `misc`, `helpers`, or `common` unless they are truly shared and still narrowly scoped.
- Prefer subfolders when a package contains multiple distinct subdomains.
- Each subfolder should expose a small local facade and keep implementation in sibling files below that boundary.
- Shared code should live in the narrowest folder that owns it. Do not move code upward to a package-wide shared folder unless at least two domains actually need it.
- Cross-domain dependencies should flow through explicit public contracts, not through incidental deep imports into unrelated folders.
- Avoid bidirectional dependencies between domain folders. If two folders need each other, extract the shared contract or primitive into a lower-level owner.

## File Responsibility Rules

- Each implementation file should have one dominant reason to change.
- Prefer files named after the behavior they own, for example `calc.ts`, `transform.ts`, `subset.ts`, `checkpoint.ts`, `replay.ts`, or `validation.ts`.
- Do not accumulate unrelated exports into files named `utils.ts`, `helpers.ts`, `misc.ts`, or `internal.ts` unless the contents are tightly related and local to one domain.
- A file may contain several closely related functions, but they must participate in the same workflow or abstraction boundary.
- If a file starts owning multiple responsibilities, split it by behavior boundary immediately instead of waiting for a later cleanup.
- New functionality should usually extend a focused file or create a new focused sibling file, not enlarge an existing catch-all module.
- When a file needs section comments to explain unrelated areas of logic, it is already too broad and should be split.

## Import Rules

- For public consumers, import through the package facade.
- For internal implementation, prefer direct imports from the owning implementation file when that avoids barrel cycles and undefined runtime exports.
- Do not route internal dependencies through sibling `index.ts` files just for symmetry.

## Validation and State Logic Rules

- Validators belong in dedicated validation modules or validation subfolders.
- State machines, controllers, schedulers, replay pipelines, and persistence workflows must live in dedicated files or domain folders, never mixed into general entrypoints.
- Builders, validators, and inspectors may live in the same domain folder, but should not collapse into one file once they become independently meaningful.

## Testing and Verification Rules

- Tests should be colocated with the behavior they validate when practical.
- If a new subdomain has enough implementation to justify a folder, its tests should also live near that folder rather than only at the package root.
- Structural refactors must preserve or improve test locality and readability.
- When changing behavior in existing TypeScript code, add or update nearby tests when practical.
- After changing any `ts` or `tsx` code, run `biome format --write --changed` or format the explicit changed files before finishing.
- After changing any `ts` or `tsx` code, run `nx affected -t typecheck` or the narrowest equivalent target that covers the changed projects.
- After changing any `ts` or `tsx` code, run `nx affected -t eslint:lint --max-warnings=0` or the narrowest equivalent lint command that covers the changed files and projects. The zero-warning threshold is intentional.
- For isolated changes, the narrowest equivalent format, typecheck, and lint commands are acceptable.
- When the change is broader, crosses domain boundaries, touches shared contracts or public APIs, or affects multiple projects, prefer the existing `yarn mini-ci` workflow instead of manually reconstructing the same validation sequence.
- `yarn mini-ci` is the preferred full-validation path and includes formatting, type-checking, linting, and `CI=true nx affected -t test`.

## Reuse and Change Scope Rules

- Before adding a new helper, utility, validator, or abstraction, search for an existing domain-owned implementation and reuse or extend it when reasonable.
- Prefer the narrowest validation that proves the change is safe, but do not skip required formatting, type-checking, linting, or any broader test validation required by the change scope.
- Keep edits tightly scoped to the domain you are changing; if a fix requires touching multiple domains, make the cross-domain contract explicit.

## Review Heuristics

- A reviewer should be able to find one responsibility in one obvious place.
- If adding one feature requires touching many unrelated files in the same folder, the folder boundary is probably wrong.
- If a file becomes the default destination for unrelated changes, split it before continuing.
- If a package-level `index.ts` grows with each feature, treat that as a structural bug, not as normal growth.

## Preferred Shape

- Package root: thin facade plus domain folders.
- Domain folder: thin local facade plus focused implementation files.
- Implementation file: one responsibility, one dominant abstraction, limited local context.
- Shared abstractions: extracted intentionally, not created as dumping grounds.
