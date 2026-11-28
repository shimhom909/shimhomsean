// 角色：擬人化動物（貓、狗、兔子、狐狸、熊、熊貓），復古海報風格——粗黑墨線、平塗色塊、硬邊陰影。
// 全部用 SVG 即時畫出來（不需要圖檔）：
//  - portraitSVG：半身立繪（手機角色設定、頒獎台）
//  - chibiSVG：Q 版全身，有尾巴（射擊遊戲場上的小人）
//  - faceSVG：頭像（等候室、排名等小地方）
// 角色資料是一個小物件，例如 { species:'cat', fur:'#f08a3c', eyes:'round', ... }，
// 衣服顏色直接用玩家選的代表色。

export const AVATAR_OPTIONS = {
  species: [
    { id: 'cat', name: '貓咪' }, { id: 'dog', name: '狗狗' }, { id: 'rabbit', name: '兔子' },
    { id: 'fox', name: '狐狸' }, { id: 'bear', name: '小熊' }, { id: 'panda', name: '熊貓' },
  ],
  fur: [
    { hex: '#f08a3c', name: '橘' }, { hex: '#f2dcb0', name: '奶油' }, { hex: '#f7f3ea', name: '白' },
    { hex: '#a3a8b0', name: '灰' }, { hex: '#3b3640', name: '黑' }, { hex: '#8a5a3a', name: '棕' },
    { hex: '#e3b04b', name: '金' }, { hex: '#7f97ad', name: '藍灰' }, { hex: '#c98a5a', name: '焦糖' },
  ],
  pattern: [
    { id: 'none', name: '無' }, { id: 'muzzle', name: '白嘴' }, { id: 'stripes', name: '虎斑' },
    { id: 'spots', name: '斑點' }, { id: 'mask', name: '眼罩' },
  ],
  eyes: [{ id: 'round', name: '圓圓眼' }, { id: 'sharp', name: '銳利眼' }, { id: 'happy', name: '笑瞇眼' }, { id: 'dot', name: '豆豆眼' }],
  eyeColor: [
    { hex: '#3b82f6', name: '藍' }, { hex: '#22a06b', name: '綠' }, { hex: '#e23d4b', name: '紅' },
    { hex: '#8b5cf6', name: '紫' }, { hex: '#e0a400', name: '金' }, { hex: '#8a5a2b', name: '棕' },
    { hex: '#ff5fa2', name: '粉' }, { hex: '#14b8c4', name: '青' },
  ],
  mouth: [{ id: 'smile', name: '微笑' }, { id: 'grin', name: '開心' }, { id: 'cool', name: '酷酷' }, { id: 'tongue', name: '吐舌' }],
  outfit: [
    { id: 'jacket', name: '騎士皮衣' }, { id: 'sailor', name: '水手服' }, { id: 'hoodie', name: '帽T' },
    { id: 'yukata', name: '浴衣' }, { id: 'suit', name: '戰鬥服' },
  ],
  acc: [
    { id: 'none', name: '無' }, { id: 'goggles', name: '護目鏡' }, { id: 'ribbon', name: '蝴蝶結' },
    { id: 'glasses', name: '眼鏡' }, { id: 'phones', name: '耳機' }, { id: 'clip', name: '星星髮夾' },
  ],
};

const FIELDS = {
  species: 'id', fur: 'hex', pattern: 'id', eyes: 'id', eyeColor: 'hex', mouth: 'id', outfit: 'id', acc: 'id',
};

// 每種動物預設比較像的毛色（隨機產生時比較常用）
const NATURAL_FUR = {
  cat: ['#f08a3c', '#a3a8b0', '#3b3640', '#f7f3ea', '#f2dcb0'],
  dog: ['#c98a5a', '#e3b04b', '#8a5a3a', '#f7f3ea', '#f2dcb0'],
  rabbit: ['#f7f3ea', '#a3a8b0', '#f2dcb0', '#8a5a3a'],
  fox: ['#f08a3c', '#e3b04b', '#c98a5a'],
  bear: ['#8a5a3a', '#c98a5a', '#3b3640', '#f2dcb0'],
  panda: ['#3b3640'],
};

export function randomAvatar(rand = Math.random) {
  const a = {};
  for (const [k, key] of Object.entries(FIELDS)) {
    const list = AVATAR_OPTIONS[k];
    a[k] = list[Math.floor(rand() * list.length)][key];
  }
  if (rand() < 0.7) { const f = NATURAL_FUR[a.species]; a.fur = f[Math.floor(rand() * f.length)]; }
  if (rand() < 0.4) a.pattern = 'none';
  if (rand() < 0.45) a.acc = 'none';
  return a;
}

// 收到的資料只接受選單裡有的值，其他一律換成預設（舊版的人類角色資料也會變成預設動物）
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

const LINE = '#1d1c22';
let uid = 0;

const path = (d, fill, stroke = LINE, sw = 2.4, extra = '') =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const ell = (cx, cy, rx, ry, fill, stroke = 'none', sw = 0, extra = '') =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;

// 鏡射一段路徑的 x 座標（畫左右對稱的東西）
function mirror(d) {
  return d.replace(/(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)/g, (m, x, _a, y) => `${-parseFloat(x)},${y}`);
}
const both = (d, fill, stroke, sw, extra) => path(d, fill, stroke, sw, extra) + path(mirror(d), fill, stroke, sw, extra);

function colors(a, theme) {
  const panda = a.species === 'panda';
  const fur = panda ? '#f7f3ea' : a.fur;
  const patch = panda ? (lum(a.fur) > 190 ? '#3b3640' : a.fur) : mix(a.fur, lum(a.fur) < 80 ? 0.35 : -0.32);
  return {
    uid: 'av' + (uid++),
    theme,
    fur,
    shade: mix(fur, lum(fur) < 80 ? -0.45 : -0.18),
    light: mix(fur, 0.5),
    patch,
    muzzle: lum(fur) > 225 ? '#ffffff' : '#f8f0e0',
    inner: '#f3a7b5',
    nose: ['cat', 'rabbit'].includes(a.species) ? '#e8788c' : '#2a2428',
    eye: a.eyeColor, eyeDark: mix(a.eyeColor, -0.45), eyeLight: mix(a.eyeColor, 0.55),
  };
}

// ── 頭（以臉中心為原點，寬約 96） ──────────────────────

const HEADS = {
  cat: 'M-46,-6 C-48,-48 -26,-60 0,-60 C26,-60 48,-48 46,-6 C48,8 56,16 49,22 C44,40 24,50 0,50 C-24,50 -44,40 -49,22 C-56,16 -48,8 -46,-6 Z',
  dog: 'M-45,-6 C-47,-48 -26,-60 0,-60 C26,-60 47,-48 45,-6 C46,30 26,54 0,54 C-26,54 -46,30 -45,-6 Z',
  rabbit: 'M-44,-4 C-46,-46 -25,-58 0,-58 C25,-58 46,-46 44,-4 C45,28 26,50 0,50 C-26,50 -45,28 -44,-4 Z',
  fox: 'M-44,-8 C-46,-48 -25,-60 0,-60 C25,-60 46,-48 44,-8 C46,6 62,18 52,24 C44,40 22,50 0,50 C-22,50 -44,40 -52,24 C-62,18 -46,6 -44,-8 Z',
  bear: 'M-48,-4 C-50,-46 -28,-58 0,-58 C28,-58 50,-46 48,-4 C48,30 28,52 0,52 C-28,52 -48,30 -48,-4 Z',
};
HEADS.panda = HEADS.bear;

// 頭後面的耳朵
function earsBack(a, c) {
  switch (a.species) {
    case 'cat':
      return both('M-44,-28 L-48,-86 L-12,-56 Z', c.fur) + both('M-39,-40 L-42,-74 L-21,-56 Z', c.inner, 'none', 0);
    case 'fox':
      return both('M-42,-26 L-52,-96 L-8,-56 Z', c.fur) + both('M-38,-38 L-46,-82 L-18,-56 Z', c.muzzle, 'none', 0) +
        both('M-49,-82 L-52,-96 L-41,-87 Z', '#2a2428', LINE, 2);
    case 'rabbit':
      return `<g transform="rotate(-9 -20 -84)">${ell(-20, -84, 13, 36, c.fur, LINE, 2.4)}${ell(-20, -82, 6, 27, c.inner)}</g>` +
        `<g transform="rotate(9 20 -84)">${ell(20, -84, 13, 36, c.fur, LINE, 2.4)}${ell(20, -82, 6, 27, c.inner)}</g>`;
    case 'bear':
    case 'panda': {
      const ear = a.species === 'panda' ? c.patch : c.fur;
      const inn = a.species === 'panda' ? mix(c.patch, 0.25) : mix(c.fur, 0.35);
      return ell(-36, -48, 16, 16, ear, LINE, 2.4) + ell(36, -48, 16, 16, ear, LINE, 2.4) +
        ell(-36, -47, 8, 8, inn) + ell(36, -47, 8, 8, inn);
    }
    default:
      return '';
  }
}

// 狗的垂耳畫在臉的前面
function earsFront(a, c) {
  if (a.species !== 'dog') return '';
  const ear = a.pattern === 'none' ? mix(c.fur, -0.28) : c.patch;
  return both('M-38,-46 C-60,-48 -70,-12 -62,18 C-58,30 -46,28 -44,16 C-42,-4 -32,-30 -38,-46 Z', ear);
}

function eye(a, c, side) {
  const cx = side * 19, cy = 6;
  const s = side;
  if (a.eyes === 'happy') {
    return path(`M${cx - 10},${cy + 3} Q${cx},${cy - 8} ${cx + 10},${cy + 3}`, 'none', LINE, 3.4);
  }
  if (a.eyes === 'dot') {
    return ell(cx, cy, 5.5, 7, LINE) + `<circle cx="${cx - 1.8}" cy="${cy - 2.5}" r="2" fill="#fff"/>`;
  }
  const sharp = a.eyes === 'sharp';
  const ry = sharp ? 9 : 12.5, ey = sharp ? cy + 2 : cy;
  const id = c.uid + 'iris' + (side > 0 ? 'R' : 'L');
  let out = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.eyeDark}"/><stop offset="0.6" stop-color="${c.eye}"/><stop offset="1" stop-color="${c.eyeLight}"/></linearGradient></defs>`;
  out += ell(cx, ey, 11, ry, '#ffffff', LINE, 1.6);
  out += ell(cx, ey + 1, sharp ? 7.5 : 8.5, sharp ? 8.5 : 11, `url(#${id})`);
  out += ell(cx, ey + 1, sharp ? 2.2 : 4, sharp ? 6 : 5.5, mix(c.eye, -0.7));   // 銳利眼是貓咪那種直瞳孔
  out += `<circle cx="${cx - 3}" cy="${ey - (sharp ? 2 : 4)}" r="${sharp ? 2.6 : 3.4}" fill="#fff"/>`;
  out += `<circle cx="${cx + 3}" cy="${ey + 4}" r="1.5" fill="#fff"/>`;
  // 粗上眼線＋外側小勾
  out += path(`M${cx - s * 12},${ey - ry * 0.45} Q${cx},${ey - ry - 5} ${cx + s * 12},${ey - ry * 0.55}`, 'none', LINE, 3.4);
  out += path(`M${cx + s * 12},${ey - ry * 0.55} L${cx + s * 16},${ey - ry * 0.75}`, 'none', LINE, 2.2);
  return out;
}

function noseMouth(a, c) {
  const small = ['cat', 'rabbit'].includes(a.species);
  let out = small
    ? path('M-4.5,18 L4.5,18 L0,23 Z', c.nose, LINE, 1.6)
    : ell(0, 19, 6.5, 4.6, c.nose, LINE, 1.4) + ell(-2, 17.5, 2, 1.2, 'rgba(255,255,255,0.7)');
  out += path('M0,23 L0,26', 'none', LINE, 1.8);
  switch (a.mouth) {
    case 'grin':
      out += path('M-9,26 Q0,40 9,26 Z', '#8a2b3a', LINE, 1.8) + ell(0, 33, 4.5, 2.6, '#ff8a9a') +
        path('M4,26 L5,30 L7,26.5', '#ffffff', LINE, 1);
      break;
    case 'cool':
      out += path('M-7,29 L7,27', 'none', LINE, 2);
      break;
    case 'tongue':
      out += ell(2.5, 31.5, 4, 5, '#f0788a', LINE, 1.4) + path('M-8,26 Q-4,31 0,26 Q4,31 8,26', 'none', LINE, 2);
      break;
    default:
      out += path('M-8,26 Q-4,31 0,26 Q4,31 8,26', 'none', LINE, 2);
  }
  if (['cat', 'fox'].includes(a.species)) {
    out += both('M-28,22 L-52,18', 'none', LINE, 1.3, 'opacity="0.75"') + both('M-28,27 L-50,30', 'none', LINE, 1.3, 'opacity="0.75"');
  }
  return out;
}

// 花紋、口鼻部、陰影：都裁切在臉的形狀裡
function faceMarkings(a, c, head) {
  const clip = c.uid + 'head';
  let inner = '';
  // 硬邊陰影：光從左上照過來，右下留一塊深色（像海報上的強烈日照）
  inner += `<rect x="-70" y="-70" width="140" height="130" fill="${c.shade}"/>` + ell(-8, -8, 50, 52, c.fur);
  // 口鼻部
  if (a.species === 'fox') {
    inner += path('M-56,18 C-36,10 -14,20 0,20 C14,20 36,10 56,18 C46,44 22,54 0,54 C-22,54 -46,44 -56,18 Z', c.muzzle, 'none', 0);
  } else if (['dog', 'bear', 'panda'].includes(a.species) || a.pattern === 'muzzle') {
    inner += ell(0, 28, a.pattern === 'muzzle' ? 30 : 19, a.pattern === 'muzzle' ? 22 : 14, c.muzzle);
  } else {
    inner += ell(-7, 27, 9.5, 7, c.muzzle) + ell(7, 27, 9.5, 7, c.muzzle);
  }
  if (a.pattern === 'muzzle' && a.species !== 'fox') inner += path('M-6,-60 Q0,-20 6,-60 Z', c.muzzle, 'none', 0);
  if (a.pattern === 'stripes') {
    inner += ['M-12,-60 L-7,-44', 'M0,-62 L0,-46', 'M12,-60 L7,-44'].map((d) => path(d, 'none', c.patch, 5)).join('') +
      both('M-50,2 L-36,5', 'none', c.patch, 4.5) + both('M-50,12 L-38,13', 'none', c.patch, 4.5);
  } else if (a.pattern === 'spots') {
    inner += ell(-27, -36, 10, 8, c.patch) + ell(30, -30, 8, 7, c.patch) + ell(36, 22, 7, 6, c.patch) + ell(-12, -50, 5, 4, c.patch);
  } else if (a.pattern === 'mask') {
    inner += path('M-50,-6 C-36,-16 -10,-10 0,-2 C10,-10 36,-16 50,-6 C50,10 34,22 20,18 C10,16 6,12 0,12 C-6,12 -10,16 -20,18 C-34,22 -50,10 -50,-6 Z', c.patch, 'none', 0);
  }
  if (a.species === 'panda') {
    inner += `<ellipse cx="-19" cy="8" rx="13" ry="16" fill="${c.patch}" transform="rotate(25 -19 8)"/>` +
      `<ellipse cx="19" cy="8" rx="13" ry="16" fill="${c.patch}" transform="rotate(-25 19 8)"/>`;
  }
  // 左上的高光筆觸
  inner += path('M-32,-42 Q-20,-54 -6,-55', 'none', c.light, 4.5, 'opacity="0.9"');
  return `<defs><clipPath id="${clip}"><path d="${head}"/></clipPath></defs><g clip-path="url(#${clip})">${inner}</g>`;
}

function tuft(a, c) {
  if (!['cat', 'fox', 'dog'].includes(a.species)) return '';
  return path('M-12,-57 Q-8,-74 0,-62 Q6,-76 12,-57 Z', c.fur, LINE, 2.2);
}

function accFront(a, c) {
  const T = c.theme;
  switch (a.acc) {
    case 'ribbon':
      return path('M30,-56 L14,-70 L16,-44 Z', T) + path('M30,-56 L48,-72 L46,-42 Z', T) + ell(30, -56, 5, 5, mix(T, -0.2), LINE, 2);
    case 'glasses':
      return `<rect x="-33" y="-5" width="28" height="22" rx="7" fill="rgba(255,255,255,0.18)" stroke="${LINE}" stroke-width="2.6"/>` +
        `<rect x="5" y="-5" width="28" height="22" rx="7" fill="rgba(255,255,255,0.18)" stroke="${LINE}" stroke-width="2.6"/>` +
        path('M-5,3 Q0,-1 5,3', 'none', LINE, 2.4);
    case 'phones':
      return path('M-52,-4 C-58,-90 58,-90 52,-4', 'none', LINE, 9) + path('M-52,-4 C-58,-90 58,-90 52,-4', 'none', '#c9d2d8', 5) +
        `<rect x="-62" y="-14" width="17" height="30" rx="7" fill="${T}" stroke="${LINE}" stroke-width="2.4"/>` +
        `<rect x="45" y="-14" width="17" height="30" rx="7" fill="${T}" stroke="${LINE}" stroke-width="2.4"/>`;
    case 'clip':
      return path('M-30,-52 L-27,-44 L-19,-44 L-25,-39 L-23,-31 L-30,-36 L-37,-31 L-35,-39 L-41,-44 L-33,-44 Z', '#f3c93e', LINE, 1.8);
    case 'goggles':
      // 騎士護目鏡推在額頭上：皮帶＋鍍鉻框＋青色鏡片
      return path('M-48,-30 Q0,-44 48,-30', 'none', LINE, 9) + path('M-48,-30 Q0,-44 48,-30', 'none', '#6b4a32', 5) +
        [-16, 16].map((x) => `<circle cx="${x}" cy="-36" r="12" fill="#c9d2d8" stroke="${LINE}" stroke-width="2.4"/>` +
          `<circle cx="${x}" cy="-36" r="8" fill="#2ec4d0" stroke="${LINE}" stroke-width="1.6"/>` +
          `<path d="M${x - 5},-39 Q${x - 2},-43 ${x + 2},-42" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`).join('');
    default:
      return '';
  }
}

function headParts(a, c) {
  const head = HEADS[a.species] || HEADS.cat;
  return earsBack(a, c) +
    path(head, c.fur, LINE, 2.8) +
    faceMarkings(a, c, head) +
    path(head, 'none', LINE, 2.8) +
    tuft(a, c) +
    earsFront(a, c) +
    ell(-28, 18, 7, 4, '#ff6f7f', 'none', 0, 'opacity="0.4"') + ell(28, 18, 7, 4, '#ff6f7f', 'none', 0, 'opacity="0.4"') +
    eye(a, c, -1) + eye(a, c, 1) +
    noseMouth(a, c) +
    accFront(a, c);
}

// ── 身體 ─────────────────────────────────────────────

// 半身：以畫面座標 (0..200, 0..240) 畫，脖子中心在 x=100
function portraitBody(a, c) {
  const T = c.theme;
  const dark = mix(T, -0.3);
  const torso = 'M58,152 Q100,144 142,152 Q170,160 174,192 L178,240 L22,240 L26,192 Q30,160 58,152 Z';
  const arms = path('M50,178 Q54,212 52,240', 'none', LINE, 2, 'opacity="0.6"') + path('M150,178 Q146,212 148,240', 'none', LINE, 2, 'opacity="0.6"');
  const neck = `<rect x="88" y="118" width="24" height="40" fill="${c.fur}" stroke="${LINE}" stroke-width="2.4"/>` +
    `<path d="M88,126 Q100,140 112,126 L112,138 Q100,148 88,138 Z" fill="${c.shade}"/>`;
  // 衣服右下的硬邊陰影
  const shadow = `<path d="M120,150 Q170,160 174,192 L178,240 L132,240 Q150,200 120,150 Z" fill="rgba(29,28,34,0.18)"/>`;
  let out = neck;
  switch (a.outfit) {
    case 'jacket':
      // 騎士皮衣：深色皮革＋斜拉鍊＋代表色肩線
      out += path(torso, '#2e2a2c', LINE, 2.6) + arms +
        path('M30,168 Q44,152 62,154 L60,170 Q44,170 32,180 Z', T, LINE, 2) +
        path('M170,168 Q156,152 138,154 L140,170 Q156,170 168,180 Z', T, LINE, 2) +
        path('M74,150 L100,176 L86,204 Z', '#4a4346', LINE, 2) + path('M126,150 L100,176 L114,204 Z', '#4a4346', LINE, 2) +
        path('M112,180 L92,240', 'none', '#c9d2d8', 3) + ell(111, 182, 3, 4, '#c9d2d8', LINE, 1.2) +
        path('M40,210 L64,206', 'none', '#c9d2d8', 2.4) +
        `<path d="M60,160 Q70,190 58,230" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="5" stroke-linecap="round"/>`;
      break;
    case 'hoodie':
      out += path('M66,150 Q100,174 134,150 Q126,140 100,140 Q74,140 66,150 Z', dark) +
        path(torso, T, LINE, 2.6) + arms +
        path('M90,160 L88,196', 'none', '#ffffff', 2.4) + path('M110,160 L112,196', 'none', '#ffffff', 2.4) +
        ell(88, 198, 2.6, 3.4, '#ffffff', LINE, 1) + ell(112, 198, 2.6, 3.4, '#ffffff', LINE, 1) +
        path('M70,226 Q100,218 130,226 L132,240 L68,240 Z', mix(T, -0.12), LINE, 1.8);
      break;
    case 'yukata':
      out += path(torso, mix(T, 0.25), LINE, 2.6) + arms +
        [[48, 200], [70, 226], [128, 206], [150, 230], [116, 236], [60, 178], [140, 176]]
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#ffffff" opacity="0.8"/><circle cx="${x}" cy="${y}" r="1.5" fill="${dark}"/>`).join('') +
        path('M86,152 L118,214', 'none', '#ffffff', 7) + path('M114,152 L96,190', 'none', '#ffffff', 7) +
        path('M40,214 L160,214 L162,240 L38,240 Z', dark, LINE, 2.2) +
        path('M40,222 L160,222', 'none', '#f3c93e', 3);
      break;
    case 'suit':
      out += path(torso, '#2c3150', LINE, 2.6) + arms +
        path('M30,160 Q44,148 62,154 L58,176 Q42,176 30,182 Z', T, LINE, 2) +
        path('M170,160 Q156,148 138,154 L142,176 Q158,176 170,182 Z', T, LINE, 2) +
        path('M100,156 L100,240', 'none', T, 3) + path('M76,170 L92,186 L92,240', 'none', T, 2.2, 'opacity="0.9"') +
        path('M124,170 L108,186 L108,240', 'none', T, 2.2, 'opacity="0.9"') +
        `<circle cx="100" cy="196" r="8" fill="${mix(T, 0.4)}" stroke="${LINE}" stroke-width="2"/>`;
      break;
    default: // sailor
      out += path(torso, '#f7f4ec', LINE, 2.6) + arms +
        path('M60,152 L100,196 L140,152 L158,162 L152,184 L100,218 L48,184 L42,162 Z', T, LINE, 2.2) +
        path('M52,166 L100,206 L148,166', 'none', '#ffffff', 2.4) +
        path('M100,198 L88,222 L100,216 L112,222 Z', '#e8452c', LINE, 1.8) +
        ell(100, 200, 6, 5, '#e8452c', LINE, 1.8);
  }
  return out + shadow;
}

// Q 版：畫面座標 (0..120, 0..150)，身體中心 x=60
function tail(a, c) {
  const stroke = (d, col, w) => path(d, 'none', LINE, w + 4) + path(d, 'none', col, w);
  switch (a.species) {
    case 'cat': return stroke('M74,122 C98,120 102,96 92,82', c.fur, 6);
    case 'dog': return stroke('M74,118 C88,112 92,100 86,92', c.fur, 6);
    case 'rabbit': return ell(77, 122, 8, 7, c.muzzle, LINE, 2);
    case 'fox': return path('M70,120 C96,130 110,104 100,84 C96,98 88,104 72,110 Z', c.fur, LINE, 2.2) + path('M100,84 C104,92 103,98 99,102 C96,96 96,90 100,84 Z', c.muzzle, LINE, 1.6);
    case 'panda': return ell(75, 122, 6, 5, c.patch, LINE, 2);
    default: return ell(75, 122, 6, 5, c.fur, LINE, 2);
  }
}

function chibiBody(a, c) {
  const T = c.theme;
  const dark = mix(T, -0.3);
  const limb = c.species === 'panda' ? c.patch : c.fur;
  let legs = path('M50,124 L49,140', 'none', LINE, 10) + path('M50,124 L49,140', 'none', limb, 6.5) +
    path('M70,124 L71,140', 'none', LINE, 10) + path('M70,124 L71,140', 'none', limb, 6.5) +
    path('M43,141 Q49,136 55,141 L55,145 L43,145 Z', '#2e2a2c', LINE, 1.6) +
    path('M65,141 Q71,136 77,141 L77,145 L65,145 Z', '#2e2a2c', LINE, 1.6);
  const arms = path('M42,104 Q34,114 36,122', 'none', LINE, 9.5) + path('M42,104 Q34,114 36,122', 'none', limb, 6) +
    path('M78,104 Q86,114 84,122', 'none', LINE, 9.5) + path('M78,104 Q86,114 84,122', 'none', limb, 6);
  let body;
  switch (a.outfit) {
    case 'jacket':
      body = path('M40,100 Q60,94 80,100 L82,128 L38,128 Z', '#2e2a2c', LINE, 2) +
        ell(40, 103, 6, 5, T, LINE, 1.4) + ell(80, 103, 6, 5, T, LINE, 1.4) + path('M63,104 L57,128', 'none', '#c9d2d8', 2);
      break;
    case 'hoodie':
      body = path('M40,100 Q60,94 80,100 L82,126 L38,126 Z', T, LINE, 2) + path('M50,98 Q60,106 70,98', 'none', dark, 3) +
        path('M42,124 L78,124 L78,130 L42,130 Z', '#2e3b55', LINE, 1.6);
      break;
    case 'yukata':
      legs = path('M43,141 Q49,137 55,141 L55,145 L43,145 Z', '#7a4a2f', LINE, 1.6) + path('M65,141 Q71,137 77,141 L77,145 L65,145 Z', '#7a4a2f', LINE, 1.6);
      body = path('M40,100 Q60,94 80,100 L84,142 L36,142 Z', mix(T, 0.25), LINE, 2) +
        path('M52,99 L66,122', 'none', '#ffffff', 4) + path('M38,116 L82,116 L82,124 L38,124 Z', dark, LINE, 1.6);
      break;
    case 'suit':
      body = path('M40,100 Q60,94 80,100 L82,128 L38,128 Z', '#2c3150', LINE, 2) + path('M60,100 L60,128', 'none', T, 2.4) +
        ell(40, 103, 6, 5, T, LINE, 1.4) + ell(80, 103, 6, 5, T, LINE, 1.4);
      break;
    default:
      body = path('M40,100 Q60,94 80,100 L80,120 L40,120 Z', '#f7f4ec', LINE, 2) +
        path('M46,99 L60,112 L74,99', 'none', T, 4) + path('M38,118 L82,118 L86,130 L34,130 Z', T, LINE, 1.8) +
        ell(60, 110, 3.5, 3, '#e8452c', LINE, 1);
  }
  return tail(a, c) + legs + arms + body;
}

// ── 對外的畫圖函式 ───────────────────────────────────

// Q 版圖的 viewBox（射擊遊戲在 canvas 上畫小人時要用來對齊腳的位置）
export const CHIBI_VIEW = { x: 0, y: -34, w: 120, h: 184 };

function svgWrap(viewBox, inner, w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${w ? ` width="${w}"` : ''}${h ? ` height="${h}"` : ''}>${inner}</svg>`;
}

export function portraitSVG(avatar, theme = '#3a86ff', size = {}) {
  const a = sanitizeAvatar(avatar);
  const c = { ...colors(a, theme), species: a.species };
  const inner = portraitBody(a, c) + `<g transform="translate(100,84) scale(0.92)">${headParts(a, c)}</g>`;
  // crop:'bust' 只取頭和肩膀（等候室小卡片用）
  return svgWrap(size.crop === 'bust' ? '24 -32 152 184' : '0 -30 200 270', inner, size.w, size.h);
}

export function chibiSVG(avatar, theme = '#3a86ff', size = {}) {
  const a = sanitizeAvatar(avatar);
  const c = { ...colors(a, theme), species: a.species };
  const inner = `<ellipse cx="60" cy="146" rx="22" ry="4" fill="rgba(0,0,0,0.22)"/>` +
    chibiBody(a, c) + `<g transform="translate(60,56) scale(0.66)">${headParts(a, c)}</g>`;
  const v = CHIBI_VIEW;
  return svgWrap(`${v.x} ${v.y} ${v.w} ${v.h}`, inner, size.w, size.h);
}

export function faceSVG(avatar, theme = '#3a86ff', size = {}) {
  const a = sanitizeAvatar(avatar);
  const c = colors(a, theme);
  return svgWrap('-72 -96 144 156', headParts(a, c), size.w, size.h);
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
