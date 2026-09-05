const ADJECTIVES = ["Rápido", "Ágil", "Feroz", "Astuto", "Valiente", "Certero", "Ligero"];
const ANIMALS = ["Tigre", "Zorro", "Halcón", "Lobo", "Puma", "Águila", "Lince"];

export function randomPlayerName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adjective} ${animal}`;
}
