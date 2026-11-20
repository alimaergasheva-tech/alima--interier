import type { Validator } from '../commands/history';
import { validateIntegrity, type Issue } from '../domain/integrity';
import type { CatalogItem, Id } from '../domain/types';
import { validatePlacement } from './placement';

/**
 * Полная проверка квартиры: целостность и размещение мебели во всех комнатах,
 * включая скрытые. Используется при каждом атомарном применении изменения.
 */
export function createApartmentValidator(findItem: (id: Id) => CatalogItem | undefined): Validator {
  return (apartment) => {
    const issues: Issue[] = validateIntegrity(apartment);
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
      const result = validatePlacement(apartment, item, instance.roomId, instance);
      if (!result.valid) {
        const room = apartment.rooms.find((candidate) => candidate.id === instance.roomId);
        const reason = result.code === 'outside-room' ? 'пересекает стену' : result.message;
        issues.push({
          code: 'furniture-conflict',
          message: `В комнате «${room?.name ?? instance.roomId}» ${item.name.toLowerCase()} ${reason}`,
          objectIds: [instance.id, ...result.conflictIds],
        });
      }
    }
    return issues;
  };
}
