import { existsSync, readFileSync } from 'node:fs';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { techCatalog } from '../../src/catalog/techCatalog';
import type { RoomType } from '../../src/domain/types';

function size(path: string) {
  const gltf = JSON.parse(readFileSync(path, 'utf8'));
  const box = new Box3();
  const local = (n: any) => (n.matrix ? new Matrix4().fromArray(n.matrix)
    : new Matrix4().compose(new Vector3(...(n.translation ?? [0, 0, 0])), new Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new Vector3(...(n.scale ?? [1, 1, 1]))));
  const visit = (index: number, parent: Matrix4) => {
    const node = gltf.nodes[index];
    const world = parent.clone().multiply(local(node));
    if (node.mesh !== undefined) for (const p of gltf.meshes[node.mesh].primitives) {
      const a = gltf.accessors[p.attributes.POSITION];
      box.union(new Box3(new Vector3(...a.min), new Vector3(...a.max)).applyMatrix4(world));
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) visit(root, new Matrix4());
  return box.getSize(new Vector3()).multiplyScalar(100);
}

describe('каталог мебели и техники (задача 26)', () => {
  it('30–40 предметов с уникальными id и лицензиями CC0 (Poly Haven или собственные)', () => {
    expect(techCatalog.length).toBeGreaterThanOrEqual(30);
    expect(techCatalog.length).toBeLessThanOrEqual(40);
    expect(new Set(techCatalog.map((item) => item.id)).size).toBe(techCatalog.length);
    for (const item of techCatalog) {
      expect(item.license.license, item.id).toBe('CC0 1.0');
      // Либо модель Poly Haven, либо собственная модель проекта (scripts/gen-modern-models.mjs).
      expect(item.license.sourceUrl, item.id).toMatch(/^(https:\/\/polyhaven\.com\/a\/|scripts\/gen-modern-models\.mjs$)/);
      expect(item.license.author, item.id).not.toBe('');
    }
  });

  it('файлы моделей на месте, габариты карточек совпадают с моделью в пределах 1 см', () => {
    for (const item of techCatalog) {
      const path = `public${item.model.url}`;
      expect(existsSync(path), path).toBe(true);
      const measured = size(path);
      expect(Math.abs(measured.x - item.sizeCm.width), `${item.id} ширина`).toBeLessThanOrEqual(1);
      expect(Math.abs(measured.z - item.sizeCm.depth), `${item.id} глубина`).toBeLessThanOrEqual(1);
      expect(Math.abs(measured.y - item.sizeCm.height), `${item.id} высота`).toBeLessThanOrEqual(1);
    }
  });

  it('способы установки и коллайдеры согласованы', () => {
    for (const item of techCatalog) {
      if (item.mount === 'wall') expect(item.mountHeightCm, item.id).toBeGreaterThan(0);
      for (const c of item.colliders) {
        expect(c.widthCm, item.id).toBeLessThanOrEqual(item.sizeCm.width + 1);
        expect(c.yMaxCm, item.id).toBeLessThanOrEqual(item.sizeCm.height + 1);
      }
      expect(item.roomTypes.length, item.id).toBeGreaterThan(0);
    }
  });

  it('для каждого жилого типа помещения есть достаточный набор', () => {
    const count = (type: RoomType) => techCatalog.filter((item) => item.roomTypes.includes(type)).length;
    for (const type of ['living', 'kitchen-living', 'bedroom', 'kitchen', 'hallway'] as const) {
      expect(count(type), type).toBeGreaterThanOrEqual(5);
    }
  });

  it('у каждой карточки задан адрес превью по id (файлы создаёт npm run previews)', () => {
    for (const item of techCatalog) expect(item.previewUrl, item.id).toBe(`/previews/${item.id}.png`);
  });
});
