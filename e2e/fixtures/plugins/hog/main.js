// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Its command never returns. The app must stop it and stay responsive.
turtle.commands.register({
  id: "hang",
  label: "Hog: hang forever",
  run() {
    for (;;);
  },
});
