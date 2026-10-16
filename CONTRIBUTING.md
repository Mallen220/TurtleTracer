# Contributing to Turtle Tracer

First off—thank you for your interest in contributing to **Turtle Tracer**. This project exists to help FIRST Robotics teams build better autonomous routines, and community involvement is what keeps it improving.

Whether you’re fixing a bug, adding a feature, improving performance, or just tightening up documentation, your help is appreciated.

---

## Project Status

This project is under **active and rapid development**. Expect:

- Frequent commits
- Breaking changes between releases
- Ongoing refactors as systems mature

If you encounter issues, please:

1. Check existing Issues
2. Try the latest release
3. If needed, revert to a previous release and report the problem

---

## Ways to Contribute

You can contribute in many ways:

- Bug reports and fixes
- New features or tools
- Performance improvements
- UI/UX polish
- Testing and validation
- Documentation improvements
- Plugins and extensions

No contribution is too small.

---

## Reporting Bugs

Before opening an issue, please check if it already exists.

When reporting a bug, include:

- App version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or logs (if applicable)

Open issues here:  
https://github.com/Mallen220/TurtleTracer/issues

---

## Feature Requests

Feature ideas are welcome. When proposing one:

- Clearly describe the problem it solves
- Explain why it benefits FTC teams
- Include mockups or examples if possible

Keep in mind:

- Simplicity > complexity
- Performance and stability are top priorities
- Features should align with real competition workflows

---

## Development Setup

### Prerequisites

- Node.js 18+
- Git

### Local Setup

```bash
git clone https://github.com/Mallen220/TurtleTracer.git
cd TurtleTracer
npm install
npm run dev
```

### Building

```bash
npm run dist
```

---

## Project Structure (High-Level)

- `src/` – Svelte UI and core application logic
- `electron/` – Electron main and preload processes
- `public/` – Static assets
- `scripts/` – Build and utility scripts

Try to keep changes scoped and modular.

---

## Testing & Validation

- Test your changes on at least one platform (macOS, Windows, or Linux)
- Verify paths load, save, and export correctly
- Avoid introducing UI lag or frame drops
- If adding simulation logic, validate against known robot constraints

Automated testing is evolving—manual validation is currently important.

---

## UI & UX Guidelines

- Maintain the existing color semantics:
  - Purple = Paths
  - Amber = Waits
  - Pink = Rotations

- Prefer clarity over visual novelty
- Avoid unnecessary dialogs or modal overload
- Keep workflows keyboard-friendly where possible

---

## Coding Standards

- Favor readability and maintainability
- Avoid premature optimization
- Use descriptive variable and function names
- Keep commits focused and meaningful

Commit messages should be clear and concise:

```
Add path optimizer boundary check
Fix telemetry desync on timeline scrub
```

---

## Pull Request Process

1. Fork the repository
2. Create a feature branch
   `git checkout -b feature/YourFeatureName`
3. Commit your changes
   `git commit -m "Describe your change"`
4. Push to your fork
   `git push origin feature/YourFeatureName`
5. Open a Pull Request against `main`

Please include:

- What the PR changes
- Why it’s needed
- Any known limitations or follow-ups

---

## Plugins

Plugins are folders with a `plugin.json`; [docs/plugins.md](docs/plugins.md)
explains how to write one, and `plugins/` has the bundled ones.

If contributing a plugin:

- Use only the `turtle` API (it's all a plugin can reach anyway)
- Ask for as few permissions and npm packages as you can, with exact versions
- Describe what it does in `description`, and document anything else in the plugin
- Follow the same quality and UX standards as core features

If changing the plugin system itself:

- The public API is `src/lib/plugins/api/`. `plugins/turtle.d.ts` is
  generated from it (`npm run generate:types`), so document changes there.
- The rest of the app reaches the plugin system only through
  `src/lib/plugins/index.ts` and the core registries (`src/lib/registries.ts`,
  the action and exporter registries). Lint enforces this, so the plugin
  host is only loaded when a plugin is on.
- Everything a plugin sends is checked in `src/lib/plugins/host/schemas.ts`.
  Never use a plugin's data without passing it through there.
- Try it in a packaged build as well (`npm run build`, then
  `npm run electron-builder -- --dir` and `npm run test:e2e`). Files behave
  differently inside the app's asar, and `e2e/plugins.spec.ts` runs plugins
  that misbehave on purpose (`e2e/fixtures/plugins/`) against the real sandbox.
- The design and the reasons for it are in `docs/plans/plugin-platform.md`.

---

## License

By contributing, you agree that your contributions will be licensed under the **Apache 2.0 License**, consistent with the rest of the project.

---

## Thanks

Every contribution helps make this tool better for teams at competitions, in the shop, and during those late-night build sessions.

Thanks for helping improve Turtle Tracer.
