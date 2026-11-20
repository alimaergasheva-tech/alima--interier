import type { Validator } from '../commands/history';
import { validateIntegrity, type Issue } from '../domain/integrity';
import type { CatalogItem, Id } from '../domain/types';
import { validateGeometry } from './apartmentChecks';
import { validatePlacement, type PlacementCode } from './placement';

const REASONS: Partial<Record<PlacementCode, string>> = {
  'outside-room': 'пересекает стену',
  'item-overlap': 'пересекается с другим предметом',
  'opening-conflict': 'мешает проёму',
  'bad-support': 'остаётся без опоры',
};

/**
 * Полная проверка квартиры: целостность данных, геометрия стен и проёмов,
 * размещение мебели во всех комнатах, включая скрытые.
 * Используется при каждом атомарном применении изменения.
 */
export function createApartmentValidator(findItem: (id: Id) => CatalogItem | undefined): Validator {
  return (apartment) => {
    const integrity = validateIntegrity(apartment);
    if (integrity.length > 0) return integrity;

    const issues: Issue[] = validateGeometry(apartment);
    if (issues.length > 0) return issues;

    for (const instance of apartment.furniture) {
      const item = findItem(instance.catalogItemId);
      if (!item) {
        issues.push({
          code: 'broken-reference',
          message: `Предмет ${instance.id} ссылается на отсутствующую карточку каталога`,
          objectIds: [instance.id],
        });
        continue;
      }
      const result = validatePlacement(apartment, item, instance.roomId, instance, {
        findItem,
        ignoreId: instance.id,
        elevationCm: instance.elevationCm,
      });
      if (!result.valid) {
        const room = apartment.rooms.find((candidate) => candidate.id === instance.roomId);
        issues.push({
          code: 'furniture-conflict',
          message: `В комнате «${room?.name ?? instance.roomId}» ${item.name.toLowerCase()} ${REASONS[result.code] ?? result.message}`,
          objectIds: [instance.id, ...result.conflictIds],
        });
      }
    }
    return issues;
  };
}
