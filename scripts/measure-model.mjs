// Измеряет габариты glTF-модели по данным POSITION с учётом трансформаций узлов.
// Запуск: node scripts/measure-model.mjs public/models/<id>/<id>.gltf [...]
// Результат — в единицах файла (для glTF это метры) и в сантиметрах.
import { readFileSync } from 'node:fs';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

function localMatrix(node) {
  if (node.matrix) return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(
    new Vector3(...(node.translation ?? [0, 0, 0])),
    new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
    new Vector3(...(node.scale ?? [1, 1, 1])),
  );
}

function measure(path) {
  const gltf = JSON.parse(readFileSync(path, 'utf8'));
  const box = new Box3();
  const visit = (index, parent) => {
    const node = gltf.nodes[index];
    const world = parent.clone().multiply(localMatrix(node));
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION];
        box.union(new Box3(new Vector3(...accessor.min), new Vector3(...accessor.max)).applyMatrix4(world));
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) visit(root, new Matrix4());
  return box;
}

const cm = (value) => (value * 100).toFixed(1);
for (const path of process.argv.slice(2)) {
  const box = measure(path);
  const size = box.getSize(new Vector3());
  console.log(path);
  console.log(`  размер, см: ширина X ${cm(size.x)}, высота Y ${cm(size.y)}, глубина Z ${cm(size.z)}`);
  console.log(`  min, см: ${cm(box.min.x)} ${cm(box.min.y)} ${cm(box.min.z)}`);
  console.log(`  max, см: ${cm(box.max.x)} ${cm(box.max.y)} ${cm(box.max.z)}`);
}
