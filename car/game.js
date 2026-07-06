const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const levelEl = document.querySelector("#level");
const startScreen = document.querySelector("#startScreen");
const gameOverScreen = document.querySelector("#gameOver");
const finalScoreEl = document.querySelector("#finalScore");
const installButton = document.querySelector("#installButton");

const COLORS = ["#ff5b32", "#48a8ff", "#f1e9db", "#8a62ff", "#f5ba36"];
const SPEED_PER_LEVEL = 60;
const ROAD_ANIMATION_LEVEL_BOOST = 5;
const HEAVY_VEHICLES = [
  { type: "bus", width: 62, height: 148, color: "#f5ba36" },
  { type: "truck", width: 64, height: 132, color: "#48a8ff" },
];
const TRAILER = { type: "trailer", width: 68, height: 327, color: "#f1e9db" };
const laneCount = 3;
let width;
let height;
let dpr;
let laneWidth;
let roadOffset = 0;
let state = "ready";
let score = 0;
let speed = 300;
let spawnTimer = 0;
let lastTime = 0;
let traffic = [];
let particles = [];
let explosions = [];
let crashFx = null;
let animationId;
let installPromptEvent = null;

function speedRatio() {
  return Math.min(1, (speed - 300) / 300);
}

function roadVisualSpeed() {
  const boostedSpeed = speed + ROAD_ANIMATION_LEVEL_BOOST * SPEED_PER_LEVEL;
  return boostedSpeed * (1 + speedRatio() * 0.85);
}

const player = {
  lane: 1,
  x: 0,
  y: 0,
  width: 54,
  height: 94,
  targetX: 0,
};

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = rect.width;
  height = rect.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  laneWidth = width / laneCount;
  player.y = height - player.height - 35;
  player.targetX = laneCenter(player.lane) - player.width / 2;
  if (state !== "playing") player.x = player.targetX;
  draw();
}

function laneCenter(lane) {
  return lane * laneWidth + laneWidth / 2;
}

function currentLevel() {
  return Math.floor(score / 10) + 1;
}

function updateHud() {
  scoreEl.textContent = String(score).padStart(2, "0");
  levelEl.textContent = String(currentLevel()).padStart(2, "0");
}

function resetGame() {
  score = 0;
  speed = 300;
  spawnTimer = 0.8;
  traffic = [];
  particles = [];
  explosions = [];
  crashFx = null;
  player.lane = 1;
  player.x = laneCenter(1) - player.width / 2;
  player.targetX = player.x;
  updateHud();
  state = "playing";
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  lastTime = performance.now();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
}

function move(direction) {
  if (state !== "playing") return;
  player.lane = Math.max(0, Math.min(laneCount - 1, player.lane + direction));
  player.targetX = laneCenter(player.lane) - player.width / 2;
}

function spawnCar() {
  const openLanes = [...Array(laneCount).keys()].filter(
    (lane) => !traffic.some((car) => car.lane === lane && car.y < 170),
  );
  if (!openLanes.length) return;
  const lane = openLanes[Math.floor(Math.random() * openLanes.length)];
  let heavyVehicle = null;
  if (currentLevel() >= 10 && Math.random() < 0.25) {
    heavyVehicle = TRAILER;
  } else if (currentLevel() >= 5 && Math.random() < 0.35) {
    heavyVehicle = HEAVY_VEHICLES[Math.floor(Math.random() * HEAVY_VEHICLES.length)];
  }
  const width = heavyVehicle?.width ?? 54;
  const height = heavyVehicle?.height ?? 92;
  traffic.push({
    lane,
    x: laneCenter(lane) - width / 2,
    y: -height - 18,
    width,
    height,
    type: heavyVehicle?.type ?? "car",
    color: heavyVehicle?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)],
    passed: false,
  });
}

function update(dt) {
  speed = Math.min(600, 300 + (currentLevel() - 1) * SPEED_PER_LEVEL);
  roadOffset = (roadOffset + roadVisualSpeed() * dt) % 2000;
  player.x += (player.targetX - player.x) * Math.min(1, dt * 14);

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnCar();
    spawnTimer = Math.max(0.52, 1.15 - score * 0.018) + Math.random() * 0.3;
  }

  for (const car of traffic) {
    car.y += speed * dt;
    if (!car.passed && car.y > player.y + player.height) {
      car.passed = true;
      score += 1;
      updateHud();
    }

    if (overlaps(player, car)) {
      crash(car);
      return;
    }
  }
  traffic = traffic.filter((car) => car.y < height + 120);

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

function overlaps(a, b) {
  const inset = 8;
  return (
    a.x + inset < b.x + b.width - inset &&
    a.x + a.width - inset > b.x + inset &&
    a.y + inset < b.y + b.height - inset &&
    a.y + a.height - inset > b.y + inset
  );
}

function spawnExplosion(x, y, radius = 95) {
  explosions.push({
    x,
    y,
    radius,
    life: 0.45,
    maxLife: 0.45,
  });

  for (let i = 0; i < 22; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const power = 120 + Math.random() * 520;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * power,
      vy: Math.sin(angle) * power - 120,
      life: 0.45 + Math.random() * 0.65,
      maxLife: 1.1,
      size: 4 + Math.random() * 12,
      gravity: 260,
      color: Math.random() > 0.35 ? "#ff5b32" : "#ffdc75",
    });
  }
}

function crash(hitCar) {
  state = "over";
  const crashX = player.x + player.width / 2;
  const crashY = player.y + player.height / 2;
  crashFx = {
    x: crashX,
    y: crashY,
    vx: (player.x + player.width / 2 - (hitCar.x + hitCar.width / 2)) * 2.2,
    vy: -560,
    angle: -0.45,
    spin: 9 + Math.random() * 4,
    age: 0,
    duration: 1.7,
    nextExplosion: 0.08,
    fireAlpha: 0,
    shake: 1,
  };

  spawnExplosion(crashX, crashY, 125);
  for (let i = 0; i < 54; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const power = 120 + Math.random() * 540;
    particles.push({
      x: crashX,
      y: crashY,
      vx: Math.cos(angle) * power,
      vy: Math.sin(angle) * power - 180,
      life: 0.55 + Math.random() * 0.75,
      maxLife: 1.3,
      size: 3 + Math.random() * 9,
      gravity: 360,
      color: i % 4 ? "#ff5b32" : "#d9ff43",
    });
  }
  finalScoreEl.textContent = String(score).padStart(2, "0");
  setTimeout(() => gameOverScreen.classList.remove("hidden"), 1350);
}

function drawRoad() {
  ctx.fillStyle = "#20242c";
  ctx.fillRect(0, 0, width, height);

  const edge = Math.max(7, width * 0.022);
  ctx.fillStyle = "#13161c";
  ctx.fillRect(0, 0, edge, height);
  ctx.fillRect(width - edge, 0, edge, height);

  const ratio = speedRatio();
  const dashHeight = 54;
  const dashGap = 56;
  const dashCycle = dashHeight + dashGap;
  const dashOffset = roadOffset % dashCycle;
  const laneLineWidth = Math.max(2, width * 0.006);

  ctx.fillStyle = "#d9ff43";
  for (let y = -dashHeight + dashOffset; y < height; y += dashCycle) {
    ctx.fillRect(0, y, edge, dashHeight * 0.42);
    ctx.fillRect(width - edge, y, edge, dashHeight * 0.42);
  }

  ctx.fillStyle = `rgba(180, 188, 201, ${0.22 + ratio * 0.14})`;
  for (let lane = 1; lane < laneCount; lane += 1) {
    const x = lane * laneWidth - laneLineWidth / 2;
    for (let y = -dashHeight + dashOffset; y < height; y += dashCycle) {
      ctx.fillRect(x, y, laneLineWidth, dashHeight);
      if (ratio > 0.35) {
        ctx.globalAlpha = (ratio - 0.35) * 0.28;
        ctx.fillRect(x, y - dashHeight * 0.45, laneLineWidth, dashHeight * 0.35);
        ctx.globalAlpha = 1;
      }
    }
  }

  const glow = ctx.createLinearGradient(0, 0, 0, height);
  glow.addColorStop(0, "#48a8ff12");
  glow.addColorStop(0.65, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawCar(car, isPlayer = false) {
  const { x, y, width: w, height: h } = car;
  ctx.save();
  if (isPlayer) {
    ctx.shadowColor = "#d9ff43";
    ctx.shadowBlur = 16;
  }

  ctx.fillStyle = "#090b0e";
  ctx.fillRect(x - 4, y + 16, 5, 22);
  ctx.fillRect(x + w - 1, y + 16, 5, 22);
  ctx.fillRect(x - 4, y + h - 38, 5, 22);
  ctx.fillRect(x + w - 1, y + h - 38, 5, 22);

  ctx.fillStyle = isPlayer ? "#d9ff43" : car.color;
  roundedRect(x, y, w, h, 9);
  ctx.fill();

  ctx.fillStyle = "#121822";
  roundedRect(x + 8, y + 17, w - 16, 31, 5);
  ctx.fill();

  ctx.fillStyle = isPlayer ? "#b9e9ff" : "#98c8e2";
  ctx.fillRect(x + 12, y + 20, w - 24, 5);
  ctx.globalAlpha = 0.35;
  ctx.fillRect(x + 9, y + 53, w - 18, 23);
  ctx.globalAlpha = 1;

  ctx.fillStyle = isPlayer ? "#ff5b32" : "#ffdc75";
  ctx.fillRect(x + 7, y + h - 10, 10, 5);
  ctx.fillRect(x + w - 17, y + h - 10, 10, 5);

  ctx.fillStyle = "#ffffff66";
  ctx.fillRect(x + w / 2 - 1, y + 4, 2, h - 8);
  ctx.restore();
}

function drawCrashedPlayer() {
  if (!crashFx) return;
  const progress = Math.min(1, crashFx.age / crashFx.duration);
  const lift = Math.sin(progress * Math.PI) * 72;
  const squash = 1 - Math.sin(progress * Math.PI) * 0.28;

  ctx.save();
  ctx.translate(crashFx.x, crashFx.y - lift);
  ctx.rotate(crashFx.angle);
  ctx.scale(1.08, squash);
  ctx.shadowColor = "#ff5b32";
  ctx.shadowBlur = 22;
  drawCar({ ...player, x: -player.width / 2, y: -player.height / 2 }, true);
  ctx.restore();
}

function drawHeavyVehicle(vehicle) {
  const { x, y, width: w, height: h } = vehicle;
  const isBus = vehicle.type === "bus";

  ctx.save();
  ctx.fillStyle = "#090b0e";
  for (const wheelY of [18, h * 0.45, h - 40]) {
    ctx.fillRect(x - 5, y + wheelY, 6, 24);
    ctx.fillRect(x + w - 1, y + wheelY, 6, 24);
  }

  ctx.fillStyle = vehicle.color;
  roundedRect(x, y, w, h, isBus ? 7 : 5);
  ctx.fill();

  ctx.fillStyle = "#121822";
  if (isBus) {
    for (let yy = y + 16; yy < y + h - 38; yy += 28) {
      ctx.fillRect(x + 9, yy, w - 18, 13);
    }
  } else {
    roundedRect(x + 8, y + 12, w - 16, 38, 5);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x + 8, y + 58, w - 16, h - 76);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "#ffdc75";
  ctx.fillRect(x + 8, y + h - 12, 12, 6);
  ctx.fillRect(x + w - 20, y + h - 12, 12, 6);
  ctx.fillStyle = "#ffffff66";
  ctx.fillRect(x + w / 2 - 1, y + 6, 2, h - 12);
  ctx.restore();
}

function roundedRect(x, y, w, h, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function draw() {
  if (!width || !height) return;
  const shake = crashFx ? crashFx.shake * 14 : 0;
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }
  drawRoad();
  for (const car of traffic) {
    if (car.type === "bus" || car.type === "truck" || car.type === "trailer") {
      drawHeavyVehicle(car);
    }
    else drawCar(car);
  }
  if (state === "over" && crashFx) drawCrashedPlayer();
  else if (state !== "over") drawCar(player, true);

  for (const explosion of explosions) {
    const progress = 1 - explosion.life / explosion.maxLife;
    const radius = explosion.radius * (0.25 + progress);
    const gradient = ctx.createRadialGradient(
      explosion.x,
      explosion.y,
      0,
      explosion.x,
      explosion.y,
      radius,
    );
    gradient.addColorStop(0, `rgba(255, 248, 170, ${0.95 * explosion.life})`);
    gradient.addColorStop(0.35, `rgba(255, 91, 50, ${0.75 * explosion.life})`);
    gradient.addColorStop(1, "rgba(255, 91, 50, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size ?? 5, p.size ?? 5);
  }
  ctx.globalAlpha = 1;
  if (crashFx) drawFireOverlay(crashFx.fireAlpha);
  ctx.restore();
}

function drawFireOverlay(alpha) {
  if (alpha <= 0) return;
  const gradient = ctx.createRadialGradient(width / 2, height * 0.62, 20, width / 2, height * 0.62, height);
  gradient.addColorStop(0, `rgba(255, 220, 117, ${0.5 * alpha})`);
  gradient.addColorStop(0.38, `rgba(255, 91, 50, ${0.42 * alpha})`);
  gradient.addColorStop(1, `rgba(90, 9, 0, ${0.78 * alpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = `rgba(255, 91, 50, ${0.18 * alpha})`;
  for (let i = 0; i < 9; i += 1) {
    const flameX = ((i * 73 + roadOffset * 0.7) % (width + 100)) - 50;
    const flameH = height * (0.2 + ((i % 3) * 0.09));
    ctx.beginPath();
    ctx.moveTo(flameX - 42, height);
    ctx.quadraticCurveTo(flameX, height - flameH, flameX + 45, height);
    ctx.fill();
  }
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  if (state === "playing") update(dt);
  else if (state === "over") updateCrashEffects(dt);
  draw();
  if (state === "playing" || particles.length || explosions.length || crashFx) {
    animationId = requestAnimationFrame(loop);
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.gravity ?? 180) * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

function updateCrashEffects(dt) {
  roadOffset = (roadOffset + roadVisualSpeed() * dt * 0.45) % 2000;
  updateParticles(dt);

  for (const explosion of explosions) {
    explosion.life -= dt;
  }
  explosions = explosions.filter((explosion) => explosion.life > 0);

  if (!crashFx) return;
  crashFx.age += dt;
  crashFx.x += crashFx.vx * dt;
  crashFx.y += crashFx.vy * dt;
  crashFx.vy += 780 * dt;
  crashFx.angle += crashFx.spin * dt;
  crashFx.shake = Math.max(0, 1 - crashFx.age / 1.15);
  crashFx.fireAlpha = Math.min(1, crashFx.age * 1.3) * Math.max(0, 1 - Math.max(0, crashFx.age - 1.2) * 1.4);

  crashFx.nextExplosion -= dt;
  if (crashFx.nextExplosion <= 0 && crashFx.age < 1.2) {
    spawnExplosion(
      crashFx.x + (Math.random() - 0.5) * 96,
      crashFx.y + (Math.random() - 0.5) * 118,
      85 + Math.random() * 72,
    );
    crashFx.nextExplosion = 0.12 + Math.random() * 0.11;
  }

  if (crashFx.age >= crashFx.duration) crashFx = null;
}

document.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "Enter", "a", "A", "d", "D"].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") move(-1);
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") move(1);
  if (event.key === "Enter" && state !== "playing") resetGame();
});

document.querySelector("#startButton").addEventListener("click", resetGame);
document.querySelector("#restartButton").addEventListener("click", resetGame);
document.querySelector("#leftButton").addEventListener("pointerdown", () => move(-1));
document.querySelector("#rightButton").addEventListener("pointerdown", () => move(1));
installButton.addEventListener("click", async () => {
  if (!installPromptEvent) return;
  installPromptEvent.prompt();
  await installPromptEvent.userChoice;
  installPromptEvent = null;
  installButton.classList.add("hidden");
});
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPromptEvent = event;
  installButton.classList.remove("hidden");
});
window.addEventListener("appinstalled", () => {
  installPromptEvent = null;
  installButton.classList.add("hidden");
});
resize();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
