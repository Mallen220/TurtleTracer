# PedroPathingPlus

**PedroPathingPlus** is an advanced pathing library for the FIRST Tech Challenge (FTC). It is implemented as a plugin that extends the [Pedro Pathing](https://github.com/Pedro-Pathing/PedroPathing) library and integrates robust, command-based structures. The project is still in its early stages; the goal is to add support for a wide range of features users may need.

> PedroPathingPlus is primarily tested with a SolversLib pinpoint chassis. Errors may occur on other designs; these will be remedied as they are discovered. If you encounter issues, please open a detailed issue (including logs) on the project's GitHub repository.

---

## 📥 Installation

To use PedroPathingPlus in your FTC project, follow these steps:

### 1. Add Repositories

Add the following Maven repositories to your module `build.gradle` (Module: app) or `settings.gradle` file:

```groovy
   maven { url 'https://repo.dairy.foundation/releases' }
    maven { url 'https://mymaven.bylazar.com/releases' }
    maven { url 'https://jitpack.io' }
```

### 2. Add Dependencies

Add the dependencies to your module `build.gradle` dependencies block:

```groovy
dependencies {
  // PedroPathingPlus
  implementation 'com.github.Mallen220:PedroPathingPlus:master-SNAPSHOT' // or use a specific tag/release

  // Core dependencies
  implementation 'com.pedropathing:ftc:2.0.0'
  implementation 'org.solverslib:core:0.3.3' // Will be replaced with PedroPathingPlus-specific versions in the future
  implementation 'org.solverslib:pedroPathing:0.3.3'
}
```

> Tip: Prefer using a specific release tag (for example `1.0.6`) instead of `master-SNAPSHOT` for reproducible builds.

---

## 🚀 Upcoming Features

We are working hard to bring you:
- **Direct `.pp` Execution:** Run autonomous routines defined in `.pp` files without writing boilerplate Java code.
- **Enhanced Command Integration:** Tighter integration with the command-based paradigm.
- **Improved Documentation:** Comprehensive guides and examples.

---

**Built by [Mallen220](https://github.com/Mallen220)**
