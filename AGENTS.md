# Repository Rules

- Keep every index.ts file as a thin facade.
- index.ts may re-export the stable public surface and perform only minimal facade assembly.
- Do not place core implementation logic, validators, state machines, or other substantial behavior in index.ts.
- Put implementation in named sibling files or domain folders, and keep index.ts focused on package or module entrypoints.
- For internal code, prefer direct imports from implementation files over routing through sibling barrel index.ts files when that avoids runtime cycles.

## Anti-Monolith Code Structure Rules

- Organize code by domain responsibility first, not by accidental growth order.
- Prefer a `libs/pando/engine` style layout: one package, several clearly named domain folders, thin facades at package and subdomain boundaries, and small implementation files inside each domain.
- Every directory should answer one clear question such as `node`, `tag`, `optimization`, `runtime`, `checkpoint`, `validation`, or `inspection`. Do not create folders whose role is only "misc", "helpers", or "common" unless they are truly shared and still narrowly scoped.
- If a file starts owning multiple responsibilities, split it by behavior boundary immediately instead of waiting for a later cleanup.
- New functionality should usually extend a focused file or create a new focused sibling file, not enlarge an existing catch-all module.

## index.ts Rules

- Package-level index.ts files are entrypoints only.
- Folder-level index.ts files are local facades only.
- index.ts may re-export symbols, define a very small facade object, or perform trivial namespace assembly.
- index.ts must not contain validation logic, parsing workflows, state machines, scheduling logic, replay logic, persistence logic, or multi-step transformations.
- If code in index.ts would require tests of its own beyond facade wiring, that code belongs in a sibling implementation file.

## File Responsibility Rules

- Each implementation file should have one dominant reason to change.
- Prefer files named after the behavior they own, for example `calc.ts`, `transform.ts`, `subset.ts`, `checkpoint.ts`, `replay.ts`, `validation.ts`.
- Do not accumulate unrelated exports into files named `utils.ts`, `helpers.ts`, `misc.ts`, or `internal.ts` unless the contents are tightly related and local to one domain.
- A file may contain several closely related functions, but they must participate in the same workflow or abstraction boundary.
- When a file needs section comments to explain unrelated areas of logic, it is already too broad and should be split.

## Domain Folder Rules

- Prefer subfolders when a package contains multiple distinct subdomains.
- Each subfolder should expose a small local facade and keep implementation in sibling files below that boundary.
- Shared code should live in the narrowest folder that owns it. Do not move code upward to a package-wide shared folder unless at least two domains actually need it.
- Cross-domain dependencies should flow through explicit public contracts, not through incidental deep imports into unrelated folders.

## Import Rules

- For public consumers, import through the package facade.
- For internal implementation, prefer direct imports from the owning implementation file when that avoids barrel cycles and undefined runtime exports.
- Do not route internal dependencies through sibling index.ts files just for symmetry.
- Avoid bidirectional dependencies between domain folders. If two folders need each other, extract the shared contract or primitive into a lower-level owner.

## Validation and State Logic Rules

- Validators belong in dedicated validation modules or validation subfolders.
- State machines, controllers, schedulers, replay pipelines, and persistence workflows must live in dedicated files or domain folders, never mixed into general entrypoints.
- Builders, validators, and inspectors may live in the same domain folder, but should not collapse into one file once they become independently meaningful.

## Testing and Colocation Rules

- Tests should be colocated with the behavior they validate when practical.
- If a new subdomain has enough implementation to justify a folder, its tests should also live near that folder rather than only at the package root.
- Structural refactors must preserve or improve test locality and readability.

## Review Heuristics

- A reviewer should be able to find one responsibility in one obvious place.
- If adding one feature requires touching many unrelated files in the same folder, the folder boundary is probably wrong.
- If a file becomes the default destination for unrelated changes, split it before continuing.
- If a package-level index.ts grows with each feature, treat that as a structural bug, not as normal growth.

## Preferred Shape

- Package root: thin facade plus domain folders.
- Domain folder: thin local facade plus focused implementation files.
- Implementation file: one responsibility, one dominant abstraction, limited local context.
- Shared abstractions: extracted intentionally, not created as dumping grounds.