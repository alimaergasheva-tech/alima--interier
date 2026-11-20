// Предметная модель квартиры (SPEC §6). Все линейные величины — в сантиметрах,
// координаты глобальные: плоскость пола XZ, вертикаль Y.

export type Id = string;

export type RoomType =
  | 'living'
  | 'kitchen-living'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'toilet'
  | 'combined-bathroom'
  | 'hallway'
  | 'wardrobe'
  | 'balcony';

/** Узел на оси стены. Общий узел соседних помещений существует в одном экземпляре. */
export interface Vertex {
  id: Id;
  xCm: number;
  zCm: number;
}

/** Стена между двумя узлами. Общая перегородка — одна сущность для обеих комнат. */
export interface Wall {
  id: Id;
  startVertexId: Id;
  endVertexId: Id;
  thicknessCm: number;
}

/** Ориентированная ссылка на стену в обходе границы комнаты. */
export interface WallRef {
  wallId: Id;
  /** true — комната обходит стену от конца к началу. */
  reversed: boolean;
}

export interface Room {
  id: Id;
  type: RoomType;
  name: string;
  /** Замкнутый упорядоченный обход границы. Полигон пола выводится из геометрии. */
  boundary: WallRef[];
}

interface OpeningBase {
  id: Id;
  wallId: Id;
  /** Расстояние вдоль оси стены от её начального узла до ближнего края проёма. */
  offsetCm: number;
  widthCm: number;
  heightCm: number;
}

export interface DoorOpening extends OpeningBase {
  kind: 'door';
  /** У какого края проёма петли: ближнего к началу стены или к концу. */
  hinge: 'start' | 'end';
  /** Куда открывается створка, если смотреть от начала стены к концу. */
  swing: 'left' | 'right';
}

export interface WindowOpening extends OpeningBase {
  kind: 'window';
  sillCm: number;
  /** Остекление: витраж (D-22) или обычное стекло. По умолчанию — обычное. */
  glass?: 'clear' | 'stained';
}

export type Opening = DoorOpening | WindowOpening;

export type MountKind = 'floor' | 'wall' | 'ceiling' | 'tabletop';
export type CatalogLayer = 'object' | 'floor-covering';
export type ModelUnit = 'm' | 'cm' | 'mm';

/** Упрощённый объём для проверки размещения, в локальных координатах предмета. */
export interface ColliderBox {
  xCm: number;
  zCm: number;
  widthCm: number;
  depthCm: number;
  yMinCm: number;
  yMaxCm: number;
}

export interface AssetLicense {
  sourceUrl: string;
  author: string;
  license: string;
  attribution: string;
  retrievedOn: string;
}

export interface CatalogItem {
  id: Id;
  version: number;
  name: string;
  category: string;
  roomTypes: RoomType[];
  /** Габариты по осям модели: ширина X, глубина Z, высота Y. */
  sizeCm: { width: number; depth: number; height: number };
  /** Единица исходного файла модели; пересчёт выполняется один раз на границе сцены. */
  model: { url: string; unit: ModelUnit };
  previewUrl: string;
  mount: MountKind;
  /** Высота установки нижней точки для настенных предметов. */
  mountHeightCm?: number;
  layer: CatalogLayer;
  colliders: ColliderBox[];
  license: AssetLicense;
}

export interface FurnitureInstance {
  id: Id;
  catalogItemId: Id;
  assetVersion: number;
  roomId: Id;
  xCm: number;
  zCm: number;
  /** Высота опорной точки над полом. */
  elevationCm: number;
  /** Поворот вокруг вертикальной оси. */
  rotationDeg: number;
  variantId: Id | null;
}

export interface MaterialDefinition {
  id: Id;
  kind: 'paint' | 'wallpaper' | 'floor';
  name: string;
  color: string;
  textureUrl?: string;
  /** Физический размер одного повтора рисунка. */
  tileSizeCm?: { width: number; height: number };
  roughness?: number;
  /** Раздел в панели отделки. */
  group?: string;
  /** Процедурный рисунок без загрузки файлов: вид узора и цвета (фон, основной, акцент). */
  pattern?: { kind: string; colors: [string, string, string] };
  /** Источник файла текстуры; у краски и процедурных узоров нет. */
  license?: AssetLicense;
}

export const SCHEMA_VERSION = 1;

/** Данные проекта. Выбор, камера и этап сюда не входят (см. store/uiStore). */
export interface Apartment {
  id: Id;
  schemaVersion: number;
  ceilingHeightCm: number;
  vertices: Vertex[];
  walls: Wall[];
  rooms: Room[];
  openings: Opening[];
  furniture: FurnitureInstance[];
  /** Отделка внутренних поверхностей: ключ wallSurfaceKey(стена, комната) → материал. */
  wallFinishes: Record<string, Id>;
  /** Покрытие пола по комнатам: id комнаты → id материала kind 'floor' (D-16). Нет записи — пол по умолчанию. */
  floorFinishes?: Record<Id, Id>;
}

export interface LayoutTemplate {
  id: Id;
  livingRooms: 1 | 2 | 3 | 4;
  title: string;
  composition: string;
  /** Геометрия без мебели; площадь вычисляется, а не хранится. */
  apartment: Apartment;
}
