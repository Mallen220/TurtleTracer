# Security Policy

The security of **Turtle Tracer** and the safety of its users are important to us. While this project is primarily a desktop visualization and planning tool, we take reported security issues seriously and will address them as quickly as possible.

---

## Supported Versions

Due to the rapid development cycle, **only the latest release** is actively supported with security updates.

| Version        | Supported |
| -------------- | --------- |
| Latest Release | Yes       |
| Older Releases | No        |

If you are using an older version and encounter a security issue, please upgrade to the latest release and verify whether the issue still exists.

---

## Reporting a Security Vulnerability

If you discover a security vulnerability, **please do not open a public GitHub issue**.

Instead, report it responsibly using one of the following methods:

### Preferred Method

- Use GitHub’s **Private Security Advisory** feature:
  https://github.com/Mallen220/TurtleTracer/security/advisories

### Alternative

- Contact the maintainer directly via GitHub:
  https://github.com/Mallen220

When reporting, please include:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Any proof-of-concept code (if applicable)

You will receive acknowledgment as soon as possible.

---

## Response Timeline

While response times may vary depending on severity and availability:

- **Acknowledgment**: Typically within hours to a few days
- **Assessment**: As soon as the issue can be reproduced
- **Fix**: Prioritized based on severity and risk
- **Disclosure**: Coordinated responsibly after a fix is available

---

## Scope of Security Concerns

This policy covers:

- Desktop app security issues (e.g. misuse of the commands the page can call in `src-tauri/`)
- File system access vulnerabilities
- Path file parsing (`.pp` files)
- Plugin system security concerns
- Installer and update integrity
- Dependency vulnerabilities

This policy does **not** cover:

- Issues caused by modified builds
- Problems introduced by third-party plugins
- User environment misconfiguration
- Outdated operating systems or unsupported platforms

---

## Security Best Practices

Users and contributors are encouraged to:

- Download releases only from the official GitHub repository
- Verify checksums when available
- Keep dependencies up to date
- Avoid running the app with elevated privileges
- Review plugins before installing them

---

## Contributors & Security

If you are contributing code:

- Avoid using `eval`, and keep file system and network access in the Rust commands, with the checks they already make on what the page sends
- Validate and sanitize all file inputs
- Assume `.pp` files may be malformed or hostile
- Follow [Tauri security best practices](https://v2.tauri.app/security/)

If unsure, ask before merging potentially risky changes.

---

## License & Responsibility

Turtle Tracer is provided **as-is** under the Apache 2.0 License. While reasonable efforts are made to maintain security, no guarantees are made regarding absolute safety.

---

## Thanks

We appreciate the effort of researchers, contributors, and users who help keep this project safe. Responsible disclosure helps protect teams relying on this tool during competition season.

Thank you for helping improve Turtle Tracer.
