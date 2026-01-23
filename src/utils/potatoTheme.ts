export const POTATO_THEME_CSS = `
:root {
  --potato-flesh: #F9F3D8;
  --potato-skin: #D4B483;
  --potato-dark: #6D4C41;
  --potato-shadow: #8D6E63;
  --potato-accent: #8B4513;
  --potato-text-dark: #3E2723;
}

/* Override global backgrounds and text */
body,
.bg-white,
.bg-neutral-50,
.bg-neutral-100,
.dark\\:bg-neutral-900,
.dark\\:bg-neutral-800,
.dark\\:bg-black {
  background-color: var(--potato-flesh) !important;
  color: var(--potato-text-dark) !important;
  border-color: var(--potato-skin) !important;
}

/* Ensure images stay transparent */
img {
  background-color: transparent !important;
}

/* Headers, sidebars, darker sections */
.bg-neutral-200,
.dark\\:bg-neutral-700,
.dark\\:bg-neutral-800\\/50,
header,
nav {
  background-color: var(--potato-skin) !important;
  color: #3E2723 !important;
}

/* Buttons and inputs */
button, input, select {
  border-radius: 12px !important;
  font-family: 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', sans-serif !important;
}

button:not(.bg-transparent) {
  background-color: var(--potato-accent) !important;
  color: #FFF !important;
  border: 2px solid #5D4037 !important;
  box-shadow: 2px 2px 0px #5D4037 !important;
  transition: transform 0.1s !important;
}

button:hover {
  transform: scale(1.05) rotate(2deg) !important;
}

/* Icons - Make them distinct */
svg {
  color: var(--potato-text-dark) !important; /* Dark brown on light background */
  filter: drop-shadow(1px 1px 0px rgba(255,255,255,0.2));
}

/* Icons inside potato buttons should be white */
button:not(.bg-transparent) svg {
  color: #FFF !important;
  filter: drop-shadow(1px 1px 0px rgba(0,0,0,0.2));
}

/* Text colors */
.text-neutral-900,
.text-neutral-700,
.text-neutral-600,
.dark\\:text-white,
.dark\\:text-neutral-100,
.dark\\:text-neutral-300,
.dark\\:text-neutral-400 {
  color: var(--potato-text-dark) !important;
}

.text-blue-600, .dark\\:text-blue-400 {
  color: #A0522D !important;
}

/* Make things look a bit organic/lumpy */
.rounded-lg, .rounded-md, .rounded-xl {
  border-radius: 15px 25px 22px 18px / 20px 15px 25px 22px !important;
}

/* Scrollbars */
::-webkit-scrollbar-thumb {
  background: var(--potato-accent) !important;
  border-radius: 10px !important;
}
::-webkit-scrollbar-track {
  background: var(--potato-flesh) !important;
}
`;

export function firePotatoConfetti(x: number, y: number) {
  const count = 10;
  const spread = 50;

  for (let i = 0; i < count; i++) {
    const potato = document.createElement('img');
    potato.src = '/Potato.png';
    potato.style.position = 'fixed';
    potato.style.width = '30px';
    potato.style.height = 'auto';
    potato.style.left = x + 'px';
    potato.style.top = y + 'px';
    potato.style.pointerEvents = 'none';
    potato.style.zIndex = '9999';
    potato.style.backgroundColor = 'transparent'; // Ensure transparent
    potato.style.transition = 'all 1s ease-out';
    potato.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 360}deg)`;

    document.body.appendChild(potato);

    // Animate
    requestAnimationFrame(() => {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 50 + Math.random() * 100;
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity + 100; // Add gravity

      potato.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${Math.random() * 720}deg)`;
      potato.style.opacity = '0';
    });

    // Cleanup
    setTimeout(() => {
      potato.remove();
    }, 1000);
  }
}
