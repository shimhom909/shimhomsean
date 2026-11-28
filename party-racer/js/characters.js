// 可選角色：六隻擬人化動物（圖都是使用者提供的插畫，去背後放在 img/chara/）。
//
//   art     全身立繪（手機選角色、等待畫面）
//   sprite  Q 版全身（遊戲場上的角色、等候室卡片、頒獎台）
//   face    Q 版頭像（排名、擊倒訊息、結果表）
//   color   角色代表色（卡片上的名字顏色）

export const CHARACTERS = [
  { id: 'cat', name: '加班橘貓', color: '#c8702a', desc: '被報告追著跑的上班族，臉很臭但很可靠' },
  { id: 'dog', name: '帽T柴柴', color: '#3d5468', desc: '一臉不在乎，其實每件事都看在眼裡' },
  { id: 'rabbit', name: '躺平兔', color: '#d84a35', desc: '能躺就不坐，咖啡打翻了也沒差' },
  { id: 'capybara', name: '佛系水豚', color: '#4cae4f', desc: '情緒超穩定，天塌下來也先泡杯咖啡' },
  { id: 'raccoon', name: '想睡浣熊', color: '#9c63c9', desc: '哈欠打到眼淚都出來了，還是想再睡五分鐘' },
  { id: 'alpaca', name: '崩潰羊駝', color: '#e3a92c', desc: '西裝領帶穿好了，人先倒下了' },
].map((c) => ({
  ...c,
  art: `img/chara/${c.id}.webp`,
  sprite: `img/chara/${c.id}-chibi.webp`,
  face: `img/chara/${c.id}-face.webp`,
}));

export function charaById(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

export function isChara(id) {
  return CHARACTERS.some((c) => c.id === id);
}

export function randomChara(rand = Math.random) {
  return CHARACTERS[Math.floor(rand() * CHARACTERS.length)].id;
}

// 產生 <img> 標籤（alt 用角色名字）
export function charaImg(id, kind = 'art', cls = '') {
  const c = charaById(id);
  return `<img src="${c[kind]}" alt="${c.name}" draggable="false"${cls ? ` class="${cls}"` : ''}>`;
}

// 角色卡：羊皮紙卡片＋代表色的名字＋圖（Q 版或立繪）
export function charaCard(id, { kind = 'sprite', cls = '', label = '' } = {}) {
  const c = charaById(id);
  return `<div class="ccard ${cls}" style="--cc:${c.color}"><b class="ccard-name">${label || c.name}</b><div class="ccard-art">${charaImg(id, kind)}</div></div>`;
}

// 畫布用的圖片（載入一次後重複使用）
const cache = new Map();
export function charaImage(id, kind = 'sprite') {
  const src = charaById(id)[kind];
  let img = cache.get(src);
  if (!img && typeof Image !== 'undefined') {
    img = new Image();
    img.src = src;
    cache.set(src, img);
  }
  return img;
}
