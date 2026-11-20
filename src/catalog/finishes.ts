import type { AssetLicense, Id, MaterialDefinition } from '../domain/types';

// Каталог отделки внутренних стен (SPEC §13, задачи 12.2 и 28): краска, процедурные обои
// современных стилей и ткани Poly Haven (CC0) в роли обоев. Размеры рисунка — физические, в см.

const paint = (id: string, name: string, color: string, group: string): MaterialDefinition =>
  ({ id: `paint-${id}`, kind: 'paint', name, color, group, roughness: 0.9 });

const pattern = (id: string, name: string, group: string, kind: string, colors: [string, string, string],
  tileCm: number, color = colors[0]): MaterialDefinition => ({
  id: `wp-${id}`, kind: 'wallpaper', name, color, group, roughness: 0.85,
  tileSizeCm: { width: tileCm, height: tileCm }, pattern: { kind, colors },
});

function polyHaven(id: string, author: string): AssetLicense {
  return { sourceUrl: `https://polyhaven.com/a/${id}`, author, license: 'CC0 1.0', attribution: 'Не требуется', retrievedOn: '2026-11-16' };
}

const fabric = (id: string, name: string, color: string, width: number, height: number): MaterialDefinition => ({
  id: `wp-${id}`, kind: 'wallpaper', name, color, group: 'Ткань и фактура', roughness: 0.9,
  textureUrl: `/textures/${id}_diff_1k.jpg`, tileSizeCm: { width, height }, license: polyHaven(id, 'colormass, Rico Cilliers'),
});

const floor = (id: string, name: string, group: string, kind: string, colors: [string, string, string],
  tileSizeCm: { width: number; height: number }, roughness: number): MaterialDefinition => ({
  id: `floor-${id}`, kind: 'floor', name, color: colors[0], group, roughness, tileSizeCm, pattern: { kind, colors },
});

export const finishCatalog: MaterialDefinition[] = [
  // Краска: нейтральные и глубокие современные цвета.
  paint('white', 'Белый', '#f3f1ec', 'Краска · светлые'),
  paint('ivory', 'Слоновая кость', '#ece3d0', 'Краска · светлые'),
  paint('greige', 'Грейдж', '#cfc6b8', 'Краска · светлые'),
  paint('cloud', 'Облачно-серый', '#c9ccd0', 'Краска · светлые'),
  paint('sage', 'Шалфей', '#9fae98', 'Краска · зелёные'),
  paint('olive', 'Олива', '#7b8157', 'Краска · зелёные'),
  paint('forest', 'Тёмно-зелёный', '#2f4a3d', 'Краска · зелёные'),
  paint('emerald', 'Изумруд', '#1f5a4a', 'Краска · зелёные'),
  paint('graphite', 'Графит', '#3b3f45', 'Краска · глубокие'),
  paint('navy', 'Тёмно-синий', '#27374f', 'Краска · глубокие'),
  paint('plum', 'Слива', '#5b3a55', 'Краска · глубокие'),
  paint('terracotta', 'Терракота', '#b5654a', 'Краска · тёплые'),
  paint('mustard', 'Горчица', '#c9a13c', 'Краска · тёплые'),
  paint('blush', 'Пыльная роза', '#d8b4ab', 'Краска · тёплые'),
  paint('sky', 'Небесный', '#a9c3d6', 'Краска · холодные'),
  paint('mint', 'Мята', '#b8d5c6', 'Краска · холодные'),

  // Дизайнерская серия (запрос 19.11.2026): крупные рисунки, мягкие тона, тонкие линии.
  pattern('tropical-emerald', 'Тропики, изумруд', 'Обои · дизайнерские', 'tropical', ['#1f3d36', '#4f8a6f', '#a9c7a0'], 160),
  pattern('tropical-ink', 'Тропики, чернильные', 'Обои · дизайнерские', 'tropical', ['#1d2a3a', '#4c7a87', '#c8b27a'], 160),
  pattern('ginkgo-sand', 'Гинкго, песок и золото', 'Обои · дизайнерские', 'ginkgo', ['#efe7d8', '#c9b98d', '#d4a94f'], 100),
  pattern('ginkgo-sage', 'Гинкго, шалфей', 'Обои · дизайнерские', 'ginkgo', ['#dde3d6', '#8fa68c', '#b7c5ab'], 100),
  pattern('wash-greige', 'Акварель с золотой жилой', 'Обои · дизайнерские', 'wash', ['#ece8e1', '#c8c1b5', '#c9a24d'], 180),
  pattern('wash-blue', 'Туманный синий с золотом', 'Обои · дизайнерские', 'wash', ['#dfe6ea', '#8ea6b8', '#c9a24d'], 180),
  pattern('grasscloth-natural', 'Тканое полотно, натуральное', 'Обои · дизайнерские', 'grasscloth', ['#d8cdb6', '#a89873', '#f0e6d0'], 60),
  pattern('grasscloth-graphite', 'Тканое полотно, графит', 'Обои · дизайнерские', 'grasscloth', ['#4a4d52', '#2f3136', '#8b8f96'], 60),
  pattern('brass-lattice', 'Латунная решётка, графит', 'Обои · дизайнерские', 'brass', ['#2b2e33', '#c9a24d', '#b8923f'], 80),
  pattern('rainbow-blush', 'Мягкие арки, пудра', 'Обои · дизайнерские', 'rainbow', ['#f1e6df', '#d9b4a6', '#e8cfc3'], 90),
  pattern('rainbow-sage', 'Мягкие арки, шалфей', 'Обои · дизайнерские', 'rainbow', ['#ece9de', '#a9b9a2', '#cdd6c3'], 90),

  // Обои с рисунком: образец пользователя — серо-зелёная ботаника с ветвями и птицами.
  pattern('botanical-sage', 'Ботаника, серо-зелёные', 'Обои · ботаника', 'botanical', ['#e7e4d8', '#8d9a87', '#5f7468'], 120),
  pattern('botanical-night', 'Ботаника, тёмно-зелёные', 'Обои · ботаника', 'botanical', ['#22362f', '#6f8a73', '#c9b27a'], 120),
  pattern('botanical-blush', 'Ботаника, пудровые', 'Обои · ботаника', 'botanical', ['#efe2dc', '#b98f86', '#8d9a87'], 120),
  pattern('monstera-green', 'Монстера, зелёные', 'Обои · ботаника', 'monstera', ['#eeeadd', '#6f8b6a', '#99ae8f'], 100),
  pattern('monstera-dark', 'Монстера, графит', 'Обои · ботаника', 'monstera', ['#2c3036', '#51675a', '#7d9486'], 100),
  pattern('stripes-sage', 'Тонкая полоска, шалфей', 'Обои · полоса', 'stripes', ['#e9e6da', '#a3b19c', '#a3b19c'], 80),
  pattern('stripes-navy', 'Тонкая полоска, синяя', 'Обои · полоса', 'stripes', ['#ece9e0', '#33496b', '#33496b'], 80),
  pattern('wide-graphite', 'Широкая полоса, графит', 'Обои · полоса', 'wideStripes', ['#d9d6cf', '#4a4e54', '#4a4e54'], 100),
  pattern('chevron-greige', 'Шеврон, грейдж', 'Обои · геометрия', 'chevron', ['#e8e1d3', '#b9ad98', '#b9ad98'], 80),
  pattern('hex-teal', 'Соты, бирюзовые', 'Обои · геометрия', 'hexagons', ['#e4e8e3', '#5f8f8b', '#c9dad5'], 60),
  pattern('hex-graphite', 'Соты, графит', 'Обои · геометрия', 'hexagons', ['#30343a', '#7a8088', '#454a52'], 60),
  pattern('circles-sand', 'Круги, песочные', 'Обои · геометрия', 'circles', ['#efe8da', '#b5a283', '#c98e6a'], 80),
  pattern('dots-mint', 'Горох, мятный', 'Обои · геометрия', 'dots', ['#f1efe6', '#9ec3b2', '#d4c58a'], 60),
  pattern('fans-gold', 'Ар-деко, золото на синем', 'Обои · ар-деко', 'fans', ['#1f2d45', '#c5a458', '#6f86a8'], 80),
  pattern('fans-green', 'Ар-деко, золото на зелёном', 'Обои · ар-деко', 'fans', ['#244137', '#c5a458', '#8aa592'], 80),
  pattern('waves-blue', 'Волны, голубые', 'Обои · ар-деко', 'waves', ['#eef0ea', '#7d9bb5', '#7d9bb5'], 70),
  pattern('arches-terracotta', 'Арки, терракотовые', 'Обои · бохо', 'arches', ['#f0e6d6', '#c7704f', '#e2b99a'], 90),
  pattern('arches-sage', 'Арки, шалфейные', 'Обои · бохо', 'arches', ['#f0ebdd', '#9aae93', '#d9c9a6'], 90),
  pattern('terrazzo-light', 'Терраццо, светлое', 'Обои · камень', 'terrazzo', ['#ece8de', '#a9a49a', '#c98e72'], 90),
  pattern('marble-white', 'Мрамор, белый', 'Обои · камень', 'marble', ['#f3f2ef', '#aeb2b8', '#8e949c'], 120),
  pattern('marble-green', 'Мрамор, зелёный', 'Обои · камень', 'marble', ['#3c5547', '#c9d3c8', '#9fb4a3'], 120),
  pattern('concrete', 'Бетон, светлый', 'Обои · камень', 'concrete', ['#bdbdb8', '#55585c', '#55585c'], 100),
  pattern('linen-beige', 'Лён, бежевый', 'Обои · фактура', 'linen', ['#d8cdb9', '#8c7f68', '#8c7f68'], 60),
  pattern('slats-oak', 'Рейки, дуб', 'Обои · фактура', 'slats', ['#b58d63', '#7a5a3a', '#7a5a3a'], 80),

  // Ткани Poly Haven в роли обоев (SPEC §13): физический размер взят из описания текстуры.
  fabric('floral_jacquard', 'Жаккард, цветы', '#b8b5a8', 25.3, 38.4),
  fabric('quatrefoil_jacquard_fabric', 'Жаккард, квадрифолий', '#a8a79a', 28, 28.4),
  fabric('poly_wool_herringbone', 'Ёлочка, шерсть', '#8e8a82', 27, 27.6),
  fabric('rough_linen', 'Грубый лён', '#c4b8a1', 27.1, 27.1),
  fabric('crepe_satin', 'Креп-сатин', '#b9a79a', 26.3, 26.8),
  fabric('velour_velvet', 'Велюр', '#6a6560', 28.4, 27.3),
  fabric('ribbed_corduroy', 'Вельвет в рубчик', '#8f7c68', 26.6, 26.7),
  fabric('wool_boucle', 'Букле', '#d0c8bb', 31.5, 39),

  // Покрытия пола (SPEC D-16, задача 23): три вида по три цвета, текстуры процедурные.
  // Ламинат: доски 19 × 120 см, тайл 120 × 76 см (четыре ряда).
  floor('laminate-oak', 'Дуб светлый', 'Ламинат', 'laminate', ['#c9a77a', '#8a6a46', '#e0c89c'], { width: 120, height: 76 }, 0.55),
  floor('laminate-walnut', 'Орех', 'Ламинат', 'laminate', ['#7b5638', '#4a321f', '#9a7452'], { width: 120, height: 76 }, 0.55),
  floor('laminate-grey', 'Дуб серый', 'Ламинат', 'laminate', ['#a9a298', '#6e6860', '#c8c2b8'], { width: 120, height: 76 }, 0.55),
  floor('linoleum-beige', 'Бежевый', 'Линолеум', 'linoleum', ['#d9cdb4', '#a99c80', '#efe6d2'], { width: 100, height: 100 }, 0.7),
  floor('linoleum-grey', 'Серый', 'Линолеум', 'linoleum', ['#9ea1a4', '#6f7377', '#c3c6c9'], { width: 100, height: 100 }, 0.7),
  floor('linoleum-green', 'Шалфей', 'Линолеум', 'linoleum', ['#a3b09a', '#74846b', '#c7d1bf'], { width: 100, height: 100 }, 0.7),
  floor('carpet-grey', 'Серый', 'Ковролин', 'carpet', ['#8e9094', '#5f6165', '#b4b6ba'], { width: 50, height: 50 }, 0.95),
  floor('carpet-sand', 'Песочный', 'Ковролин', 'carpet', ['#cdbfa6', '#9b8c72', '#e6dcc9'], { width: 50, height: 50 }, 0.95),
  floor('carpet-blue', 'Синий', 'Ковролин', 'carpet', ['#5f7184', '#3d4c5c', '#8497aa'], { width: 50, height: 50 }, 0.95),
];

export function findFinish(id: Id): MaterialDefinition | undefined {
  return finishCatalog.find((material) => material.id === id);
}
