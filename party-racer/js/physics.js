// 街機風格的俯視賽車物理。輸入：s 方向(-1~1)、g 油門、b 煞車/倒車、n 氮氣加速。

export const PHYS = {
  brake: 480,             // 煞車減速度
  reverse: 170,           // 倒車加速度
  reverseMaxRatio: 0.4,   // 倒車極速 = 極速 × 這個比例
  coast: 70,              // 放開油門時的滑行阻力
  turnSpeedRef: 70,       // 速度低於這個值時轉向會變弱（原地不能轉）
  nitroSpeed: 1.28,       // 氮氣時極速倍率
  nitroAccel: 1.7,        // 氮氣時加速倍率
  nitroDuration: 2.2,     // 滿槽可噴幾秒
  nitroRecharge: 9,       // 從空到滿需要幾秒
  carRadius: 14,          // 碰撞半徑
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function makeCar(def, pose) {
  return {
    def, x: pose.x, y: pose.y, a: pose.a,
    vx: 0, vy: 0, steer: 0,
    nitro: 1, boosting: false,
    offroad: false, slip: 0,
  };
}

export function speedOf(car) {
  return Math.hypot(car.vx, car.vy);
}

export function stepCar(car, inp, dt) {
  const d = car.def;
  const gas = !!inp.g && !inp.b;

  // 1. 轉向：輸入做平滑化，速度太低轉不動，高速時稍微遲鈍
  car.steer += (clamp(inp.s || 0, -1, 1) - car.steer) * Math.min(1, dt * 14);
  let fx = Math.cos(car.a), fy = Math.sin(car.a);
  const vfOld = car.vx * fx + car.vy * fy;
  const spd = Math.abs(vfOld);
  const low = Math.min(1, spd / PHYS.turnSpeedRef);
  const high = 1 - 0.3 * Math.min(1, spd / d.maxSpeed);
  car.a += car.steer * d.handling * low * high * (vfOld < 0 ? -1 : 1) * dt;
  if (car.a > Math.PI) car.a -= Math.PI * 2;
  else if (car.a < -Math.PI) car.a += Math.PI * 2;

  // 2. 把速度拆成「車頭方向」與「側向」
  fx = Math.cos(car.a); fy = Math.sin(car.a);
  let vf = car.vx * fx + car.vy * fy;
  let vl = -car.vx * fy + car.vy * fx;

  let maxV = d.maxSpeed * (car.offroad ? d.offroad : 1);
  let acc = d.accel * (car.offroad ? 0.5 + d.offroad * 0.5 : 1);

  // 3. 氮氣：按住油門＋氮氣時消耗；要至少有一點存量才能啟動，避免一直閃爍
  const wantNitro = !!inp.n && gas;
  if (wantNitro && car.nitro > (car.boosting ? 0 : 0.1)) {
    car.boosting = true;
    maxV *= PHYS.nitroSpeed;
    acc *= PHYS.nitroAccel;
    car.nitro = Math.max(0, car.nitro - dt / PHYS.nitroDuration);
  } else {
    car.boosting = false;
    car.nitro = Math.min(1, car.nitro + dt / PHYS.nitroRecharge);
  }

  // 4. 油門／煞車／倒車／滑行
  if (gas) {
    if (vf < maxV) vf = Math.min(maxV, vf + acc * (1 - 0.5 * Math.max(0, vf) / maxV) * dt);
  } else if (inp.b) {
    if (vf > 0) vf = Math.max(0, vf - PHYS.brake * dt);
    else vf = Math.max(-d.maxSpeed * PHYS.reverseMaxRatio, vf - PHYS.reverse * dt);
  } else {
    const c = PHYS.coast * dt;
    vf = Math.abs(vf) <= c ? 0 : vf - Math.sign(vf) * c;
  }
  // 超過目前極速（開上草地、氮氣結束）就逐漸降回來
  if (vf > maxV) vf = Math.max(maxV, vf - (180 + (vf - maxV) * 2.5) * dt);

  // 5. 抓地力：側向速度衰減，抓地力低的車會甩尾
  const grip = d.grip * (car.offroad ? 0.7 : 1) * (car.boosting ? 0.8 : 1);
  vl *= Math.exp(-grip * dt);
  car.slip = Math.abs(vl);

  car.vx = fx * vf - fy * vl;
  car.vy = fy * vf + fx * vl;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
}

// 車與車碰撞：圓形近似，重的車把輕的推開。回傳撞擊事件 [{a, b, power}]
export function collideCars(cars) {
  const hits = [];
  const R2 = PHYS.carRadius * 2;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const A = cars[i], B = cars[j];
      const dx = B.x - A.x, dy = B.y - A.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R2 * R2 || d2 === 0) continue;
      const dist = Math.sqrt(d2);
      const nx = dx / dist, ny = dy / dist;
      const ma = A.def.mass, mb = B.def.mass, mt = ma + mb;
      const overlap = R2 - dist;
      A.x -= nx * overlap * (mb / mt); A.y -= ny * overlap * (mb / mt);
      B.x += nx * overlap * (ma / mt); B.y += ny * overlap * (ma / mt);
      const rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (rv < 0) {
        const j = (-(1 + 0.35) * rv) / (1 / ma + 1 / mb);
        A.vx -= (j / ma) * nx; A.vy -= (j / ma) * ny;
        B.vx += (j / mb) * nx; B.vy += (j / mb) * ny;
        hits.push({ a: A, b: B, power: -rv });
      }
    }
  }
  return hits;
}
