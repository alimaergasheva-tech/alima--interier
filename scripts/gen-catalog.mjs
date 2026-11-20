// Генерирует src/catalog/furnitureItems.ts из таблицы предметов и габаритов, измеренных по glTF.
// Запуск: node scripts/gen-catalog.mjs  (после scripts/fetch-polyhaven.mjs)
import { readFileSync, writeFileSync } from 'node:fs';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

// Модели, созданные scripts/gen-modern-models.mjs, получают лицензию ownModel() и габариты из своего glTF.
const OWN = Object.keys(JSON.parse(readFileSync('docs/stage-16/modern-models.json', 'utf8')));
const AUTHORS = JSON.parse(readFileSync(process.argv[2], 'utf8'));

// [id, название, категория, типы помещений, установка, высота установки для стены, см]
const L = 'living', KL = 'kitchen-living', B = 'bedroom', K = 'kitchen', H = 'hallway', BA = 'bathroom', CB = 'combined-bathroom', W = 'wardrobe', BC = 'balcony', T = 'toilet';
const TABLE = [
  ['sofa_02', 'Диван компактный', 'Мягкая мебель', [L, KL], 'floor'],
  ['Sofa_01', 'Двухместный диван', 'Мягкая мебель', [L, KL, B], 'floor'],
  ['mid_century_lounge_chair', 'Кресло-лаундж', 'Мягкая мебель', [L, KL, B], 'floor'],
  ['Ottoman_01', 'Пуф', 'Мягкая мебель', [L, KL, B, H], 'floor'],
  ['vintage_day_bed', 'Кушетка', 'Мягкая мебель', [L, B], 'floor'],
  ['old_bed_frame', 'Кровать односпальная', 'Кровати', [B], 'floor'],
  ['modern_coffee_table_02', 'Журнальный стол квадратный', 'Столы', [L, KL], 'floor'],
  ['coffee_table_round_01', 'Журнальный стол круглый', 'Столы', [L, KL], 'floor'],
  ['side_table_01', 'Приставной столик', 'Столы', [L, KL, B, H], 'floor'],
  ['dining_table', 'Обеденный стол', 'Столы', [K, KL, L], 'floor'],
  ['round_wooden_table_01', 'Круглый обеденный стол', 'Столы', [K, KL], 'floor'],
  ['metal_office_desk', 'Рабочий стол', 'Столы', [L, B], 'floor'],
  ['dining_chair_02', 'Стул', 'Стулья', [K, KL, L, B], 'floor'],
  ['bar_chair_round_01', 'Барный стул', 'Стулья', [K, KL], 'floor'],
  ['wooden_stool_01', 'Табурет', 'Стулья', [K, KL, BA, CB, H, W], 'floor'],
  ['modern_wooden_cabinet', 'ТВ-тумба', 'Хранение', [L, KL, B, H], 'floor'],
  ['painted_wooden_cabinet', 'Комод-буфет', 'Хранение', [K, KL, L, H], 'floor'],
  ['drawer_cabinet', 'Шкаф с ящиками', 'Хранение', [B, H, W, L], 'floor'],
  ['painted_wooden_nightstand', 'Прикроватная тумба', 'Хранение', [B], 'floor'],
  ['wooden_bookshelf_worn', 'Книжный стеллаж', 'Хранение', [L, KL, B, H], 'floor'],
  ['painted_wooden_bench', 'Банкетка', 'Хранение', [H, K, KL, W, BC], 'floor'],
  ['fridge_01', 'Холодильник', 'Техника', [K, KL], 'floor'],
  ['washing_machine_01', 'Стиральная машина', 'Техника', [BA, CB, K], 'floor'],
  ['bathtub_01', 'Ванна', 'Сантехника', [BA, CB], 'floor'],
  ['toilet_01', 'Унитаз', 'Сантехника', [T, BA, CB], 'floor'],
  ['washbasin_01', 'Раковина с тумбой', 'Сантехника', [BA, CB, T], 'floor'],
  ['television_02', 'Телевизор', 'Техника', [L, KL, B], 'tabletop'],
  ['electric_stove', 'Электроплита', 'Техника', [K, KL], 'floor'],
  ['vintage_electric_kettle', 'Чайник электрический', 'Техника', [K, KL], 'tabletop'],
  ['ceiling_fan', 'Потолочный вентилятор', 'Техника', [L, KL, B, K], 'ceiling'],
  ['ornate_mirror_01', 'Зеркало', 'Декор и свет', [H, B, BA, CB, W], 'wall', 120],
  ['wall_clock', 'Настенные часы', 'Декор и свет', [L, KL, K, B, H], 'wall', 190],
  ['potted_plant_01', 'Комнатное растение', 'Декор и свет', [L, KL, B, H, BC], 'floor'],
  ['Chandelier_01', 'Люстра классическая', 'Декор и свет', [L, KL, B, K, H], 'ceiling'],
  ['Chandelier_02', 'Люстра современная круглая', 'Декор и свет', [L, KL, B, K], 'ceiling'],
  ['ceiling_shade_01', 'Плафон', 'Декор и свет', [K, H, BA, CB, W, BC, B], 'ceiling'],
  ['floor_lamp', 'Торшер', 'Декор и свет', [L, KL, B, H], 'floor'],
  ['desk_lamp_arm_01', 'Настольная лампа', 'Декор и свет', [L, B], 'tabletop'],
  ['industrial_wall_sconce', 'Бра', 'Декор и свет', [L, KL, B, H], 'wall', 160],
];

function localMatrix(node) {
  if (node.matrix) return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])),
    new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])));
}
function measure(path) {
  const gltf = JSON.parse(readFileSync(path, 'utf8'));
  const box = new Box3();
  const visit = (index, parent) => {
    const node = gltf.nodes[index];
    const world = parent.clone().multiply(localMatrix(node));
    if (node.mesh !== undefined) for (const p of gltf.meshes[node.mesh].primitives) {
      const a = gltf.accessors[p.attributes.POSITION];
      box.union(new Box3(new Vector3(...a.min), new Vector3(...a.max)).applyMatrix4(world));
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) visit(root, new Matrix4());
  return box.getSize(new Vector3());
}

const lines = ["// ЭТОТ ФАЙЛ СОЗДАН scripts/gen-catalog.mjs; габариты измерены по glTF и округлены до сантиметра.", "// Источники и лицензии — ASSETS.md.", "import type { CatalogItem } from '../domain/types';", "import { polyHaven, box, ownModel } from './polyHaven';", '', 'export const furnitureItems: CatalogItem[] = ['];
for (const [id, name, category, rooms, mount, mountH] of TABLE) {
  const size = measure(`public/models/${id}/${id}.gltf`);
  const [w, h, d] = [size.x, size.y, size.z].map((v) => Math.round(v * 100));
  const own = OWN.includes(id);
  const author = own ? 'собственная' : AUTHORS.find((a) => a.id === id)?.authors.join(', ');
  if (!author) throw new Error(`Нет автора: ${id}`);
  lines.push('  {',
    `    id: '${id.toLowerCase()}',`, '    version: 1,', `    name: '${name}',`, `    category: '${category}',`,
    `    roomTypes: [${rooms.map((r) => `'${r}'`).join(', ')}],`,
    `    sizeCm: { width: ${w}, depth: ${d}, height: ${h} },`,
    `    model: { url: '/models/${id}/${id}.gltf', unit: 'm' },`, "    previewUrl: '',", `    mount: '${mount}',`,
    ...(mountH ? [`    mountHeightCm: ${mountH},`] : []),
    "    layer: 'object',", `    colliders: box(${w}, ${d}, ${h}),`, `    license: ${own ? 'ownModel()' : `polyHaven('${id}', '${author}')`},`, '  },');
}
lines.push('];', '');
writeFileSync('src/catalog/furnitureItems.ts', lines.join('\n'));
console.log(`Записано предметов: ${TABLE.length}`);
