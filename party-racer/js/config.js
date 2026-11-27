// 遊戲設定：車款、顏色、賽道。想調整平衡或新增內容，改這個檔案就好。

export const WORLD = { w: 1600, h: 900 };
export const MAX_PLAYERS = 8;
export const ROOM_PREFIX = 'partyracer-v1-';
// 房間代碼字元：拿掉容易看錯的 0/O、1/I/L
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

// ── 車款 ─────────────────────────────────────────────
// maxSpeed: 極速（單位/秒）  accel: 加速度  handling: 轉向速度（弧度/秒）
// grip: 抓地力（越低越容易甩尾）  mass: 重量（碰撞時誰推誰）
// offroad: 開上草地/砂地時保留的速度比例（越高越不怕出界）
// stats: 選車畫面顯示用的 1–5 星評分
export const CARS = [
  {
    id: 'comet', name: '彗星 GT', type: '均衡型', shape: 'coupe',
    desc: '各項能力平均，新手最好上手',
    maxSpeed: 250, accel: 208, handling: 2.8, grip: 7.0, mass: 1.0, offroad: 0.55,
    stats: { speed: 3, accel: 3, handling: 3, weight: 3 },
  },
  {
    id: 'bolt', name: '閃電 R', type: '極速型', shape: 'sport',
    desc: '直線最快，但起步慢、過彎容易甩尾',
    maxSpeed: 280, accel: 182, handling: 2.6, grip: 5.4, mass: 0.9, offroad: 0.45,
    stats: { speed: 5, accel: 2, handling: 2, weight: 2 },
  },
  {
    id: 'pixie', name: '小精靈', type: '操控型', shape: 'kart',
    desc: '起步最快、轉彎最靈活，極速較低',
    maxSpeed: 238, accel: 262, handling: 3.45, grip: 9.0, mass: 0.75, offroad: 0.5,
    stats: { speed: 2, accel: 5, handling: 5, weight: 1 },
  },
  {
    id: 'bull', name: '猛牛 4x4', type: '重量型', shape: 'truck',
    desc: '撞人不怕被撞，開上草地也不太減速',
    maxSpeed: 246, accel: 200, handling: 2.65, grip: 7.6, mass: 1.6, offroad: 0.82,
    stats: { speed: 3, accel: 2, handling: 2, weight: 5 },
  },
];

export const STAT_LABELS = { speed: '極速', accel: '加速', handling: '操控', weight: '重量' };

export function carById(id) {
  return CARS.find((c) => c.id === id) || CARS[0];
}

// ── 顏色 ─────────────────────────────────────────────
export const COLORS = [
  { hex: '#ff4d4d', name: '紅' },
  { hex: '#ff9f1c', name: '橙' },
  { hex: '#ffd60a', name: '黃' },
  { hex: '#4cd964', name: '綠' },
  { hex: '#2ec4d6', name: '青' },
  { hex: '#3a86ff', name: '藍' },
  { hex: '#a259ff', name: '紫' },
  { hex: '#ff70a6', name: '粉' },
  { hex: '#f2f2f2', name: '白' },
  { hex: '#34343c', name: '黑' },
];

export const FUN_NAMES = [
  '飆風少年', '甩尾王', '小旋風', '追風者', '油門踩到底', '彎道之王',
  '煞車是什麼', '馬路小霸王', '慢慢開', '超車達人', '風一樣的人', '路邊的草',
];

// ── 賽道 ─────────────────────────────────────────────
// points：賽道中心線的控制點（世界座標 1600×900），會用平滑曲線連起來。
// 第一個點是起終點線，起跑格排在它的後方，所以第一點前後要是直線。
export const TRACKS = [
  {
    id: 'sunny', name: '陽光環道', desc: '寬敞好開，適合新手', width: 110,
    points: [
      [800, 160], [1150, 160], [1390, 210], [1470, 420], [1360, 650],
      [1080, 740], [800, 620], [520, 740], [240, 650], [130, 420],
      [210, 210], [450, 160],
    ],
  },
  {
    id: 'crown', name: '皇冠山道', desc: '兩個髮夾彎，考驗煞車時機', width: 100,
    points: [
      [700, 760], [1050, 760], [1330, 740], [1470, 560], [1440, 300],
      [1310, 150], [1150, 210], [1080, 420], [950, 500], [830, 420],
      [760, 210], [600, 150], [440, 220], [380, 400], [250, 470],
      [140, 580], [200, 730], [400, 760],
    ],
  },
  {
    id: 'city', name: '城市街道', desc: '直角彎加 S 彎，路幅較窄', width: 96,
    points: [
      [560, 150], [900, 150], [1010, 175], [1060, 280], [1090, 400],
      [1200, 445], [1380, 450], [1460, 520], [1460, 690], [1380, 760],
      [1080, 760], [960, 690], [840, 690], [720, 760], [350, 760],
      [220, 730], [150, 600], [150, 300], [200, 180], [320, 150],
    ],
  },
];

export function trackById(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
