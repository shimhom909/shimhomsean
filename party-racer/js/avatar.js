// 角色：日式動漫風格的原創角色，全部用 SVG 即時畫出來（不需要圖檔）。
//  - portraitSVG：半身立繪（手機角色設定、頒獎台）
//  - chibiSVG：Q 版全身（射擊遊戲場上的小人）
//  - faceSVG：頭像（等候室、排名等小地方）
// 角色資料是一個小物件，例如 { hair:'twin', hairColor:'#ff9ec7', eyes:'round', ... }，
// 主題色（衣服顏色）直接用玩家選的顏色。

export const AVATAR_OPTIONS = {
  hair: [
    { id: 'short', name: '短髮' }, { id: 'bob', name: '鮑伯頭' }, { id: 'long', name: '長直髮' },
    { id: 'twin', name: '雙馬尾' }, { id: 'pony', name: '馬尾' }, { id: 'spiky', name: '刺刺頭' },
  ],
  hairColor: [
    { hex: '#2e2b3f', name: '黑' }, { hex: '#7a4a2f', name: '棕' }, { hex: '#f2c84b', name: '金' },
    { hex: '#dfe3ee', name: '銀' }, { hex: '#ff9ec7', name: '粉' }, { hex: '#5aa0ff', name: '藍' },
    { hex: '#9b7bff', name: '紫' }, { hex: '#e8484f', name: '紅' }, { hex: '#4fbf8a', name: '綠' },
    { hex: '#ff9a3c', name: '橘' },
  ],
  eyes: [{ id: 'round', name: '圓圓眼' }, { id: 'sharp', name: '銳利眼' }, { id: 'happy', name: '笑瞇眼' }],
  eyeColor: [
    { hex: '#3b82f6', name: '藍' }, { hex: '#22a06b', name: '綠' }, { hex: '#e23d4b', name: '紅' },
    { hex: '#8b5cf6', name: '紫' }, { hex: '#e0a400', name: '金' }, { hex: '#8a5a2b', name: '棕' },
    { hex: '#ff5fa2', name: '粉' }, { hex: '#14b8c4', name: '青' },
  ],
  mouth: [{ id: 'smile', name: '微笑' }, { id: 'grin', name: '開心' }, { id: 'cool', name: '酷酷' }, { id: 'cat', name: '貓咪嘴' }],
  skin: [
    { hex: '#ffe8d8', name: '白皙' }, { hex: '#ffd8bd', name: '自然' },
    { hex: '#f0bb94', name: '小麥' }, { hex: '#c68c66', name: '古銅' },
  ],
  outfit: [{ id: 'sailor', name: '水手服' }, { id: 'hoodie', name: '帽T' }, { id: 'yukata', name: '浴衣' }, { id: 'suit', name: '戰鬥服' }],
  acc: [
    { id: 'none', name: '無' }, { id: 'cat', name: '貓耳' }, { id: 'ribbon', name: '蝴蝶結' },
    { id: 'glasses', name: '眼鏡' }, { id: 'phones', name: '耳機' }, { id: 'clip', name: '星星髮夾' },
  ],
};

const FIELDS = {
  hair: 'id', hairColor: 'hex', eyes: 'id', eyeColor: 'hex', mouth: 'id', skin: 'hex', outfit: 'id', acc: 'id',
};

export function randomAvatar(rand = Math.random) {
  const a = {};
  for (const [k, key] of Object.entries(FIELDS)) {
    const list = AVATAR_OPTIONS[k];
    a[k] = list[Math.floor(rand() * list.length)][key];
  }
  if (rand() < 0.45) a.acc = 'none';
  return a;
}

// 收到的資料只接受選單裡有的值，其他一律換成預設
export function sanitizeAvatar(a) {
  const out = {};
  const src = a && typeof a === 'object' ? a : {};
  for (const [k, key] of Object.entries(FIELDS)) {
    const list = AVATAR_OPTIONS[k];
    out[k] = list.some((o) => o[key] === src[k]) ? src[k] : list[0][key];
  }
  return out;
}

// ── 小工具 ───────────────────────────────────────────

function rgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mix(hex, amt) {
  const [r, g, b] = rgb(hex);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return '#' + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}
function lum(hex) {
  const [r, g, b] = rgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114;
}

const LINE = '#3b2a3f';
let uid = 0;

const path = (d, fill, stroke = LINE, sw = 2, extra = '') =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const ell = (cx, cy, rx, ry, fill, stroke = 'none', sw = 0, extra = '') =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;

// 鏡射一段路徑的 x 座標（畫左右對稱的東西）
function mirror(d) {
  return d.replace(/(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)/g, (m, x, _a, y) => `${-parseFloat(x)},${y}`);
}

// ── 頭部（以臉中心為原點，臉寬約 90） ─────────────────

const FACE = 'M-44,-18 C-45,12 -36,38 -14,54 Q0,63 14,54 C36,38 45,12 44,-18 C44,-62 -44,-62 -44,-18 Z';

function backHair(a, c, chibi) {
  const k = chibi ? 0.55 : 1;              // Q 版頭髮短一點，免得拖到地上
  const y = (v) => (v > 40 ? 40 + (v - 40) * k : v);
  const H = c.hairShade;
  switch (a.hair) {
    case 'bob':
      return path('M-56,-20 C-60,-74 60,-74 56,-20 C58,20 60,44 52,58 Q30,66 0,61 Q-30,66 -52,58 C-60,44 -58,20 -56,-20 Z', H);
    case 'long':
      return path(`M-55,-25 C-60,-76 60,-76 55,-25 C62,40 66,${y(120)} 60,${y(190)} Q30,${y(200)} 0,${y(196)} Q-30,${y(200)} -60,${y(190)} C-66,${y(120)} -62,40 -55,-25 Z`, H);
    case 'twin': {
      const tail = `M-44,-42 C-96,-34 -104,${y(70)} -86,${y(156)} Q-80,${y(180)} -68,${y(190)} Q-70,${y(150)} -64,${y(110)} C-58,${y(60)} -52,8 -38,-24 Z`;
      return path(tail, H) + path(mirror(tail), H) +
        path('M-54,-10 C-58,-72 58,-72 54,-10 C56,20 48,34 40,38 L-40,38 C-48,34 -56,20 -54,-10 Z', H);
    }
    case 'pony':
      return path(`M26,-56 C88,-66 100,${y(20)} 84,${y(118)} Q78,${y(150)} 64,${y(160)} Q72,${y(104)} 62,${y(62)} C56,${y(14)} 42,-20 24,-32 Z`, H) +
        path('M-54,-10 C-58,-72 58,-72 54,-10 C56,20 48,34 40,38 L-40,38 C-48,34 -56,20 -54,-10 Z', H);
    case 'spiky':
      return path('M-54,-10 L-68,-38 L-52,-50 L-62,-76 L-32,-68 L-24,-94 L0,-74 L24,-96 L32,-68 L62,-80 L52,-50 L68,-36 L54,-10 C56,24 46,36 40,40 L-40,40 C-46,36 -56,24 -54,-10 Z', H);
    default: // short
      return path('M-53,-12 C-57,-72 57,-72 53,-12 C55,20 47,34 40,38 L-40,38 C-47,34 -55,20 -53,-12 Z', H);
  }
}

function frontHair(a, c) {
  const H = c.hair;
  // 瀏海下緣的髮束（左→右），每種髮型不同
  const fringes = {
    short: 'L44,-4 Q40,-14 36,-24 Q32,-10 26,-2 Q22,-18 16,-28 Q10,-12 4,-2 Q0,-16 -6,-26 Q-12,-10 -18,-2 Q-22,-18 -28,-26 Q-34,-10 -40,-4',
    bob: 'L46,-6 L40,-8 L34,-6 L28,-9 L20,-6 L12,-9 L4,-6 L-4,-9 L-12,-6 L-20,-9 L-28,-6 L-34,-9 L-40,-6',
    long: 'L44,0 Q40,-12 34,-24 Q30,-8 22,2 Q18,-16 12,-26 Q6,-10 0,0 Q-4,-14 -10,-26 Q-16,-8 -22,2 Q-26,-14 -32,-24 Q-38,-10 -44,0',
    twin: 'L44,-2 Q40,-14 34,-22 Q30,-8 24,0 Q20,-14 14,-24 Q8,-8 2,-2 Q-2,-16 -8,-26 Q-14,-10 -20,-2 Q-24,-16 -30,-22 Q-36,-10 -44,-2',
    pony: 'L44,-6 Q38,-16 30,-26 Q28,-10 22,-4 Q16,-20 6,-30 Q4,-12 -2,-4 Q-8,-18 -16,-26 Q-20,-10 -26,-4 Q-32,-16 -38,-22 Q-42,-12 -44,-6',
    spiky: 'L46,-2 L38,-18 L34,4 L24,-20 L18,0 L8,-26 L2,2 L-8,-24 L-14,0 L-24,-22 L-30,2 L-38,-16 L-46,-2',
  };
  const top = 'M-50,-6 C-56,-64 -22,-76 0,-72 C22,-76 56,-64 50,-6';
  let out = path(`${top} ${fringes[a.hair] || fringes.short} Z`, H);
  // 兩側垂下的鬢髮
  const side = { short: 30, bob: 46, long: 62, twin: 54, pony: 40, spiky: 22 }[a.hair] || 30;
  const lock = `M-50,-24 Q-58,${side * 0.4} -48,${side} Q-44,${side * 0.5} -38,-8 Z`;
  out += path(lock, H) + path(mirror(lock), H);
  // 呆毛（刺刺頭）
  if (a.hair === 'spiky' || a.hair === 'short') out += path('M2,-70 Q10,-96 24,-92 Q12,-88 8,-70 Z', H);
  // 綁頭髮的髮圈（雙馬尾、馬尾）露在頭的兩側
  if (a.hair === 'twin') out += ell(-52, -34, 7, 8, c.tie, LINE, 2) + ell(52, -34, 7, 8, c.tie, LINE, 2);
  if (a.hair === 'pony') out += ell(48, -48, 7, 8, c.tie, LINE, 2);
  // 頭髮光澤（天使光環）
  out += `<path d="M-34,-46 Q0,-62 34,-46" fill="none" stroke="${c.hairLight}" stroke-width="5" stroke-linecap="round" stroke-dasharray="11 6" opacity="0.85"/>`;
  return out;
}

function eye(a, c, side) {
  const cx = side * 20, cy = 14;
  const s = side;
  if (a.eyes === 'happy') {
    return path(`M${cx - 11},${cy + 4} Q${cx},${cy - 9} ${cx + 11},${cy + 4}`, 'none', LINE, 3.2) +
      path(`M${cx + s * 11},${cy + 4} L${cx + s * 15},${cy}`, 'none', LINE, 2);
  }
  const sharp = a.eyes === 'sharp';
  const ry = sharp ? 10 : 14, ey = sharp ? cy + 3 : cy;
  const id = c.uid + 'iris' + (side > 0 ? 'R' : 'L');
  let out = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.eyeDark}"/><stop offset="0.55" stop-color="${c.eye}"/><stop offset="1" stop-color="${c.eyeLight}"/></linearGradient></defs>`;
  out += ell(cx, ey, 12, ry, '#ffffff');
  out += ell(cx, ey + 1, sharp ? 8 : 9.5, sharp ? 9.5 : 12.5, `url(#${id})`, c.eyeDark, 1);
  out += ell(cx, ey + 1, sharp ? 3.5 : 4.5, sharp ? 5 : 6, mix(c.eye, -0.65));
  out += ell(cx, ey + (sharp ? 5 : 7), sharp ? 4.5 : 6, 3, c.eyeLight, 'none', 0, 'opacity="0.8"');
  out += `<circle cx="${cx - 3.5}" cy="${ey - (sharp ? 2 : 4)}" r="${sharp ? 2.8 : 3.8}" fill="#fff"/>`;
  out += `<circle cx="${cx + 3.5}" cy="${ey + 4}" r="1.8" fill="#fff"/>`;
  // 上睫毛（粗）＋外側小勾、下睫毛（細）
  if (sharp) {
    out += path(`M${cx - s * 13},${ey - 1} Q${cx},${ey - 12} ${cx + s * 14},${ey - 8}`, 'none', LINE, 3.6);
    out += path(`M${cx + s * 14},${ey - 8} L${cx + s * 18},${ey - 10}`, 'none', LINE, 2.2);
  } else {
    out += path(`M${cx - s * 13},${ey - 7} Q${cx},${ey - 19} ${cx + s * 13},${ey - 9}`, 'none', LINE, 3.4);
    out += path(`M${cx + s * 13},${ey - 9} L${cx + s * 17},${ey - 6}`, 'none', LINE, 2.2);
  }
  out += path(`M${cx - 6},${ey + ry} Q${cx},${ey + ry + 1.5} ${cx + 6},${ey + ry}`, 'none', LINE, 1.4);
  return out;
}

function mouth(a) {
  switch (a.mouth) {
    case 'grin':
      return path('M-8,40 Q0,41 8,40 Q6,52 0,52 Q-6,52 -8,40 Z', '#8a2b3a', LINE, 1.8) + ell(0, 49, 4, 2.6, '#ff8a9a');
    case 'cool':
      return path('M-5,45 L6,43', 'none', LINE, 2);
    case 'cat':
      return path('M-7,41 Q-3.5,46 0,42 Q3.5,46 7,41', 'none', LINE, 2);
    default:
      return path('M-6,42 Q0,47 6,42', 'none', LINE, 2);
  }
}

function accBack(a, c) {
  if (a.acc === 'cat') {
    const ear = 'M-46,-44 L-40,-94 L-12,-64 Z';
    const inner = 'M-38,-54 L-36,-82 L-20,-64 Z';
    return path(ear, c.hair) + path(mirror(ear), c.hair) + path(inner, '#ffb3c8', 'none', 0) + path(mirror(inner), '#ffb3c8', 'none', 0);
  }
  return '';
}

function accFront(a, c) {
  switch (a.acc) {
    case 'ribbon': {
      const col = c.theme;
      return path('M30,-56 L14,-70 L16,-44 Z', col) + path('M30,-56 L48,-72 L46,-42 Z', col) +
        ell(30, -56, 5, 5, mix(col, -0.2), LINE, 2);
    }
    case 'glasses':
      return `<rect x="-34" y="2" width="28" height="22" rx="7" fill="rgba(255,255,255,0.18)" stroke="${LINE}" stroke-width="2.2"/>` +
        `<rect x="6" y="2" width="28" height="22" rx="7" fill="rgba(255,255,255,0.18)" stroke="${LINE}" stroke-width="2.2"/>` +
        path('M-6,10 Q0,6 6,10', 'none', LINE, 2);
    case 'phones':
      return path('M-54,-6 C-60,-96 60,-96 54,-6', 'none', LINE, 9) + path('M-54,-6 C-60,-96 60,-96 54,-6', 'none', '#4a4f66', 5) +
        `<rect x="-62" y="-14" width="16" height="30" rx="7" fill="${c.theme}" stroke="${LINE}" stroke-width="2.2"/>` +
        `<rect x="46" y="-14" width="16" height="30" rx="7" fill="${c.theme}" stroke="${LINE}" stroke-width="2.2"/>`;
    case 'clip':
      return path('M-34,-52 L-31,-44 L-23,-44 L-29,-39 L-27,-31 L-34,-36 L-41,-31 L-39,-39 L-45,-44 L-37,-44 Z', '#ffd23f', LINE, 1.8);
    default:
      return '';
  }
}

function colors(a, theme) {
  const hair = a.hairColor;
  return {
    uid: 'av' + (uid++),
    theme,
    hair,
    hairShade: mix(hair, -0.13),
    hairLight: lum(hair) > 200 ? '#ffffff' : mix(hair, 0.55),
    eye: a.eyeColor, eyeDark: mix(a.eyeColor, -0.45), eyeLight: mix(a.eyeColor, 0.55),
    skin: a.skin, skinShade: mix(a.skin, -0.12),
    tie: theme,
  };
}

function headParts(a, c) {
  const clip = c.uid + 'face';
  const front =
    accBack(a, c) +
    ell(-44, 8, 6, 10, c.skin, LINE, 2) + ell(44, 8, 6, 10, c.skin, LINE, 2) +
    path(FACE, c.skin, LINE, 2.2) +
    `<defs><clipPath id="${clip}"><path d="${FACE}"/></clipPath></defs>` +
    `<path d="M-46,-14 Q0,8 46,-14 L46,-40 L-46,-40 Z" fill="${c.skinShade}" clip-path="url(#${clip})"/>` +
    ell(-27, 31, 8, 4, '#ff7a9a', 'none', 0, 'opacity="0.38"') + ell(27, 31, 8, 4, '#ff7a9a', 'none', 0, 'opacity="0.38"') +
    eye(a, c, -1) + eye(a, c, 1) +
    path('M-1,30 L1,33', 'none', LINE, 1.4, 'opacity="0.6"') +
    mouth(a) +
    frontHair(a, c) +
    // 眉毛畫在瀏海上面、半透明（動漫常見畫法）
    path('M-29,-3 Q-20,-8 -11,-4', 'none', mix(c.hair, -0.5), 2.2, 'opacity="0.6"') +
    path('M29,-3 Q20,-8 11,-4', 'none', mix(c.hair, -0.5), 2.2, 'opacity="0.6"') +
    accFront(a, c);
  return front;
}

// ── 身體 ─────────────────────────────────────────────

// 半身：以畫面座標 (0..200, 0..240) 畫，脖子中心在 x=100
function portraitBody(a, c) {
  const T = c.theme;
  const dark = mix(T, -0.3);
  const torso = 'M58,152 Q100,144 142,152 Q170,160 174,192 L178,240 L22,240 L26,192 Q30,160 58,152 Z';
  const arms = path('M50,178 Q54,212 52,240', 'none', LINE, 1.8, 'opacity="0.55"') + path('M150,178 Q146,212 148,240', 'none', LINE, 1.8, 'opacity="0.55"');
  const neck = `<rect x="89" y="120" width="22" height="38" fill="${c.skin}" stroke="${LINE}" stroke-width="2"/>` +
    `<path d="M89,128 Q100,140 111,128 L111,138 Q100,146 89,138 Z" fill="${c.skinShade}"/>`;
  let out = neck;
  switch (a.outfit) {
    case 'hoodie':
      out += path('M66,150 Q100,174 134,150 Q126,140 100,140 Q74,140 66,150 Z', dark) +   // 帽子
        path(torso, T, LINE, 2.4) + arms +
        path('M90,160 L88,196', 'none', '#ffffff', 2.4) + path('M110,160 L112,196', 'none', '#ffffff', 2.4) +
        ell(88, 198, 2.6, 3.4, '#ffffff', LINE, 1) + ell(112, 198, 2.6, 3.4, '#ffffff', LINE, 1) +
        path('M70,226 Q100,218 130,226 L132,240 L68,240 Z', mix(T, -0.12), LINE, 1.6);
      break;
    case 'yukata':
      out += path(torso, mix(T, 0.25), LINE, 2.4) + arms +
        // 花紋
        [[48, 200], [70, 226], [128, 206], [150, 230], [116, 236], [60, 178], [140, 176]]
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#ffffff" opacity="0.8"/><circle cx="${x}" cy="${y}" r="1.5" fill="${dark}"/>`).join('') +
        path('M86,152 L118,214', 'none', '#ffffff', 7) + path('M86,152 L118,214', 'none', LINE, 1.4, 'opacity="0.4"') +
        path('M114,152 L96,190', 'none', '#ffffff', 7) +
        path('M40,214 L160,214 L162,240 L38,240 Z', dark, LINE, 2) +
        path('M40,222 L160,222', 'none', '#ffd23f', 3);
      break;
    case 'suit':
      out += path(torso, '#2c3150', LINE, 2.4) + arms +
        path('M30,160 Q44,148 62,154 L58,176 Q42,176 30,182 Z', T, LINE, 2) +
        path('M170,160 Q156,148 138,154 L142,176 Q158,176 170,182 Z', T, LINE, 2) +
        path('M100,156 L100,240', 'none', T, 3) + path('M76,170 L92,186 L92,240', 'none', T, 2.2, 'opacity="0.9"') +
        path('M124,170 L108,186 L108,240', 'none', T, 2.2, 'opacity="0.9"') +
        `<circle cx="100" cy="196" r="8" fill="${mix(T, 0.4)}" stroke="${LINE}" stroke-width="2"/>`;
      break;
    default: // sailor
      out += path(torso, '#f7f8ff', LINE, 2.4) + arms +
        path('M60,152 L100,196 L140,152 L158,162 L152,184 L100,218 L48,184 L42,162 Z', T, LINE, 2) +
        path('M52,166 L100,206 L148,166', 'none', '#ffffff', 2.4) +
        path('M100,198 L88,222 L100,216 L112,222 Z', '#e8484f', LINE, 1.8) +
        ell(100, 200, 6, 5, '#e8484f', LINE, 1.8);
  }
  return out;
}

// Q 版：畫面座標 (0..120, 0..150)，身體中心 x=60
function chibiBody(a, c) {
  const T = c.theme;
  const dark = mix(T, -0.3);
  let legs = path('M50,124 L49,140', 'none', c.skin, 7) + path('M70,124 L71,140', 'none', c.skin, 7) +
    path('M43,141 Q49,136 55,141 L55,145 L43,145 Z', '#3b2a3f', LINE, 1.4) +
    path('M65,141 Q71,136 77,141 L77,145 L65,145 Z', '#3b2a3f', LINE, 1.4);
  const arms = path('M42,104 Q34,114 36,122', 'none', c.skin, 6) + path('M78,104 Q86,114 84,122', 'none', c.skin, 6);
  let body;
  switch (a.outfit) {
    case 'hoodie':
      body = path('M40,100 Q60,94 80,100 L82,126 L38,126 Z', T, LINE, 1.8) + path('M50,98 Q60,106 70,98', 'none', dark, 3) +
        path('M42,124 L78,124 L78,130 L42,130 Z', '#3a3f5c', LINE, 1.4);
      break;
    case 'yukata':
      legs = path('M43,141 Q49,137 55,141 L55,145 L43,145 Z', '#7a4a2f', LINE, 1.4) + path('M65,141 Q71,137 77,141 L77,145 L65,145 Z', '#7a4a2f', LINE, 1.4);
      body = path('M40,100 Q60,94 80,100 L84,142 L36,142 Z', mix(T, 0.25), LINE, 1.8) +
        path('M52,99 L66,122', 'none', '#ffffff', 4) + path('M38,116 L82,116 L82,124 L38,124 Z', dark, LINE, 1.4);
      break;
    case 'suit':
      body = path('M40,100 Q60,94 80,100 L82,128 L38,128 Z', '#2c3150', LINE, 1.8) + path('M60,100 L60,128', 'none', T, 2.4) +
        ell(40, 103, 6, 5, T, LINE, 1.4) + ell(80, 103, 6, 5, T, LINE, 1.4);
      break;
    default:
      body = path('M40,100 Q60,94 80,100 L80,120 L40,120 Z', '#f7f8ff', LINE, 1.8) +
        path('M46,99 L60,112 L74,99', 'none', T, 4) + path('M38,118 L82,118 L86,130 L34,130 Z', T, LINE, 1.6) +
        ell(60, 110, 3.5, 3, '#e8484f', LINE, 1);
  }
  return legs + arms + body;
}

// ── 對外的畫圖函式 ───────────────────────────────────

function svgWrap(viewBox, inner, w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${w ? ` width="${w}"` : ''}${h ? ` height="${h}"` : ''}>${inner}</svg>`;
}

export function portraitSVG(avatar, theme = '#3a86ff', size = {}) {
  const a = sanitizeAvatar(avatar);
  const c = colors(a, theme);
  const head = (inner) => `<g transform="translate(100,84) scale(0.92)">${inner}</g>`;
  const inner = head(backHair(a, c, false)) + portraitBody(a, c) + head(headParts(a, c));
  // crop:'bust' 只取頭和肩膀（等候室小卡片用）
  return svgWrap(size.crop === 'bust' ? '24 -16 152 168' : '0 -16 200 256', inner, size.w, size.h);
}

export function chibiSVG(avatar, theme = '#3a86ff', size = {}) {
  const a = sanitizeAvatar(avatar);
  const c = colors(a, theme);
  const head = (inner) => `<g transform="translate(60,56) scale(0.66)">${inner}</g>`;
  const inner = `<ellipse cx="60" cy="146" rx="22" ry="4" fill="rgba(0,0,0,0.22)"/>` +
    head(backHair(a, c, true)) + chibiBody(a, c) + head(headParts(a, c));
  return svgWrap('0 -10 120 160', inner, size.w, size.h);
}

export function faceSVG(avatar, theme = '#3a86ff', size = {}) {
  const a = sanitizeAvatar(avatar);
  const c = colors(a, theme);
  const inner = backHair(a, c, true) + headParts(a, c);
  return svgWrap('-72 -100 144 156', inner, size.w, size.h);
}

// 給 canvas 用：把 SVG 轉成圖片（同樣的角色只轉一次）
const imgCache = new Map();
export function avatarImage(kind, avatar, theme) {
  const key = kind + JSON.stringify(sanitizeAvatar(avatar)) + theme;
  if (imgCache.has(key)) return imgCache.get(key);
  const fn = kind === 'chibi' ? chibiSVG : kind === 'face' ? faceSVG : portraitSVG;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fn(avatar, theme));
  imgCache.set(key, img);
  return img;
}
