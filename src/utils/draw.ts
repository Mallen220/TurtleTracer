// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export function getRandomColor() {
  const letters = "56789ABCD";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * letters.length)];
  }
  return color;
}
