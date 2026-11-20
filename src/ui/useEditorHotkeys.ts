import { useEffect } from 'react';
import { findCatalogItem } from '../catalog/techCatalog';
import { removeFurniture, setFurniturePose } from '../commands/furniture';
import { isEditableTarget } from '../commands/hotkeys';
import { normalizeDeg, validatePlacement } from '../geometry/placement';
import { ROTATE_STEP_DEG, isDragging } from '../interaction/drag';
import { selectApartment, useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';

/** Клавиши выбранного предмета: R и Shift+R — поворот на 15°, Delete — удаление. */
export function useEditorHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Во время переноса клавиши обрабатывает сам перенос; в полях ввода они не действуют.
      if (isDragging() || isEditableTarget(event.target as HTMLElement | null)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const ui = useUiStore.getState();
      const project = useProjectStore.getState();
      const apartment = selectApartment(project);
      if (!apartment || ui.selection?.kind !== 'furniture') return;
      const selectedId = ui.selection.id;
      const instance = apartment.furniture.find((item) => item.id === selectedId);
      if (!instance) return;

      if (event.code === 'KeyR') {
        event.preventDefault();
        const item = findCatalogItem(instance.catalogItemId);
        if (!item) return;
        const step = event.shiftKey ? -ROTATE_STEP_DEG : ROTATE_STEP_DEG;
        const pose = {
          xCm: instance.xCm,
          zCm: instance.zCm,
          rotationDeg: normalizeDeg(instance.rotationDeg + step),
        };
        const check = validatePlacement(apartment, item, instance.roomId, pose, {
          findItem: findCatalogItem,
          ignoreId: instance.id,
          elevationCm: instance.elevationCm,
        });
        if (!check.valid) {
          ui.setNotice(`${check.message}. Поворот не выполнен`);
          return;
        }
        const result = project.execute(setFurniturePose(instance.id, pose, 'Повернуть предмет'));
        ui.setNotice(result && !result.ok ? (result.issues[0]?.message ?? 'Изменение отклонено') : null);
      } else if (event.code === 'Delete') {
        event.preventDefault();
        project.execute(removeFurniture(instance.id));
        ui.select(null);
        ui.setNotice(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
