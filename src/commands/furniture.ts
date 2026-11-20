import type { FurnitureInstance, Id } from '../domain/types';
import type { Pose } from '../geometry/placement';
import type { Change } from './history';

// Команды над мебелью. Каждая возвращает новую квартиру и применяется через execute.

export function addFurniture(instance: FurnitureInstance, name: string): Change {
  return {
    label: `Добавить: ${name}`,
    apply: (apartment) => ({ ...apartment, furniture: [...apartment.furniture, instance] }),
  };
}

/** Перемещение и поворот без пересоздания предмета: идентификатор и модель сохраняются. */
export function setFurniturePose(id: Id, pose: Pose, label = 'Переместить предмет'): Change {
  return {
    label,
    apply: (apartment) => {
      if (!apartment.furniture.some((item) => item.id === id)) throw new Error(`предмет ${id} не найден`);
      return {
        ...apartment,
        furniture: apartment.furniture.map((item) =>
          item.id === id
            ? { ...item, xCm: pose.xCm, zCm: pose.zCm, rotationDeg: pose.rotationDeg }
            : item,
        ),
      };
    },
  };
}

export function removeFurniture(id: Id): Change {
  return {
    label: 'Удалить предмет',
    apply: (apartment) => ({
      ...apartment,
      furniture: apartment.furniture.filter((item) => item.id !== id),
    }),
  };
}
